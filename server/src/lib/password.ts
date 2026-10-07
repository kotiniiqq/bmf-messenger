import argon2 from 'argon2';

/**
 * Parallelism is 1, not the library default of 4: the beta host has 2 vCPU,
 * where four threads per hash fight Postgres for the processor. Memory and
 * time cost stay at OWASP-recommended levels.
 */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

/**
 * A hash of a value nobody can log in with. Verifying against it on a missing
 * account keeps the response time indistinguishable from a wrong password, so
 * timing does not reveal which usernames exist.
 */
const dummyHash = argon2.hash('bmf-nonexistent-account-placeholder', OPTIONS);

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A stored hash we cannot parse is a failed login, not a crashed request.
    return false;
  }
}

export async function verifyDummyPassword(plain: string): Promise<void> {
  await argon2.verify(await dummyHash, plain).catch(() => false);
}
