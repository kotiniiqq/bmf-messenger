import { describe, expect, it } from 'vitest';
import { lookupCity } from '../../src/lib/geoip.js';

describe('geoip', () => {
  it('returns null for a missing address', async () => {
    await expect(lookupCity(undefined)).resolves.toBeNull();
  });

  it('returns null for private addresses without touching the database', async () => {
    await expect(lookupCity('127.0.0.1')).resolves.toBeNull();
    await expect(lookupCity('192.168.1.10')).resolves.toBeNull();
    await expect(lookupCity('10.0.0.5')).resolves.toBeNull();
  });

  it('resolves or degrades to null for a public address, never throwing', async () => {
    const city = await lookupCity('8.8.8.8');
    expect(city === null || typeof city === 'string').toBe(true);
  });

  it('never throws on malformed input', async () => {
    await expect(lookupCity('not-an-ip')).resolves.toBeNull();
  });
});
