import { Redis } from 'ioredis';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

/**
 * Second connection: a client in subscribe mode cannot issue normal commands.
 *
 * `enableReadyCheck` must be off here. It probes the connection with INFO, which
 * a subscriber is not allowed to run — the probe fails, ioredis treats the
 * connection as unhealthy, and message delivery stops without the subscribe call
 * ever reporting an error. That failure is silent and looks exactly like "events
 * are not being published".
 */
export const redisSub = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Without listeners ioredis prints "Unhandled error event" and keeps going;
// a reconnect storm would then be invisible in structured logs.
redis.on('error', (err) => logger.warn({ err }, 'redis connection error'));
redisSub.on('error', (err) => logger.warn({ err }, 'redis subscriber error'));
