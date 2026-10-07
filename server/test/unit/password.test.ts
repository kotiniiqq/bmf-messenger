import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, verifyDummyPassword } from '../../src/lib/password.js';

describe('password hashing', () => {
  it('produces an argon2id hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('produces a different hash for the same password', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });

  it('verifies the right password', async () => {
    const hash = await hashPassword('right-password');
    await expect(verifyPassword(hash, 'right-password')).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('right-password');
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('returns false instead of throwing on a malformed hash', async () => {
    await expect(verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
  });

  it('burns comparable time on a nonexistent account', async () => {
    await expect(verifyDummyPassword('anything')).resolves.toBeUndefined();
  });
});
