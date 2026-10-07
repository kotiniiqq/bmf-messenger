import { describe, expect, it } from 'vitest';
import { open, seal } from '../../src/lib/secrets.js';

/**
 * A mailbox password has to be replayable — the server presents it to the
 * mailbox on every sync — so it is encrypted rather than hashed. These cases
 * are what that has to mean in practice.
 */
describe('sealing mailbox credentials', () => {
  it('reads back what it sealed', () => {
    expect(open(seal('hunter2'))).toBe('hunter2');
  });

  it('handles the app passwords providers actually issue', () => {
    const appPassword = 'abcd efgh ijkl mnop';
    expect(open(seal(appPassword))).toBe(appPassword);
  });

  it('produces a different ciphertext every time', () => {
    // Same input twice must not look the same at rest, or the store leaks which
    // mailboxes share a password.
    expect(seal('same').equals(seal('same'))).toBe(false);
  });

  it('refuses a value that was tampered with', () => {
    const sealed = seal('hunter2');
    // Flip a bit in the ciphertext; GCM's tag is what should catch it.
    sealed[sealed.length - 1] ^= 0x01;
    expect(open(sealed)).toBeNull();
  });

  it('refuses a truncated value rather than throwing', () => {
    expect(open(seal('hunter2').subarray(0, 8))).toBeNull();
    expect(open(Buffer.alloc(0))).toBeNull();
    expect(open(null)).toBeNull();
  });
});
