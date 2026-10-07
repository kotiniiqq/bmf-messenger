import { z } from 'zod';

/**
 * All configuration comes from the environment and is validated once at boot.
 * A missing or malformed variable must crash the process immediately — never
 * start half-configured, it is far harder to debug later.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TTL_SECONDS: z.coerce.number().default(15 * 60),
  REFRESH_TTL_SECONDS: z.coerce.number().default(30 * 24 * 60 * 60),

  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string().min(3),
  S3_SECRET_KEY: z.string().min(3),
  S3_BUCKET: z.string().default('bmf-media'),

  /**
   * Calls are optional at boot: the API is useful without them, and a
   * development machine has no media services. The calls module reports itself
   * unavailable rather than failing at the moment someone dials.
   */
  LIVEKIT_URL: z.string().url().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),

  /** coturn's shared secret and the address clients should relay through. */
  TURN_SECRET: z.string().optional(),
  TURN_HOST: z.string().optional(),

  /** Comma-separated list: the code supports several mail domains from day one. */
  MAIL_DOMAINS: z.string().default('bmf.ink'),
  MAIL_HOST: z.string().optional(),

  /**
   * Encrypts the credentials of connected mailboxes. Optional at boot for the
   * same reason as LiveKit: the rest of the API works without mail, and the
   * module says it is unavailable rather than failing when someone connects.
   *
   * Rotating it makes every stored mailbox password unreadable, which is
   * deliberate — a leaked secret has to be able to be revoked.
   */
  MAIL_SECRET: z.string().min(32).optional(),

  /**
   * Outbound mail goes over the provider's HTTP API, not SMTP: this host has
   * 25, 465 and 587 blocked outright, so an SMTP client cannot leave it. 443
   * works, which is the only reason mail can be sent from here at all.
   */
  MAIL_SEND_PROVIDER: z.enum(['postmark', 'mailgun', 'none']).default('none'),
  MAIL_SEND_TOKEN: z.string().optional(),
  MAIL_SEND_DOMAIN: z.string().optional(),

  /** Local DB-IP City Lite database. An absent file simply yields a null city. */
  GEOIP_DB_PATH: z.string().default('./data/dbip-city-lite.mmdb'),

  /**
   * Comma-separated browser origins allowed to call the API. The desktop client
   * loads from its own bmf:// scheme rather than file://, so it has a real
   * origin to allowlist instead of the wildcard "null" that file:// sends.
   */
  CORS_ORIGINS: z.string().default('bmf://app,http://localhost:5173,http://localhost:4173'),

  SENTRY_DSN: z.string().url().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid configuration:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  mailDomains: parsed.data.MAIL_DOMAINS.split(',').map((d) => d.trim()).filter(Boolean),
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  isProd: parsed.data.NODE_ENV === 'production',
};
