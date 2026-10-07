import { buildApp, type App } from '../../src/app.js';
import { sql } from '../../src/db/client.js';
import { redis, redisSub } from '../../src/db/redis.js';

export async function startTestApp(): Promise<App> {
  const app = await buildApp();
  await app.ready();
  return app;
}

/** Integration tests share one database, so each test starts from a clean slate. */
export async function truncateAll(): Promise<void> {
  await sql`truncate table audit_log, consents, devices, users restart identity cascade`;
}

/** Counters are keyed by IP and would otherwise leak between tests. */
export async function clearRateLimits(): Promise<void> {
  const keys = await redis.keys('auth:*');
  if (keys.length > 0) await redis.del(...keys);
}

export async function stopTestApp(app: App | undefined): Promise<void> {
  // When beforeAll failed the app was never built. Throwing here would replace
  // the real error with a confusing one about reading 'close' of undefined.
  await app?.close();
  await sql.end({ timeout: 5 });
  redis.disconnect();
  redisSub.disconnect();
}

export function uniqueUser(suffix: string) {
  return {
    username: `user_${suffix}`,
    email: `user_${suffix}@example.com`,
    password: 'correct-horse-battery-staple',
  };
}

export const CONSENTS = [
  { document: 'terms', version: '2026-07-01' },
  { document: 'privacy', version: '2026-07-01' },
  { document: 'beta-notice', version: '2026-07-01' },
];

export const DEVICE = { name: 'Test Desktop', platform: 'windows' as const };
