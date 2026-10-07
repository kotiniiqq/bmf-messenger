import * as Sentry from '@sentry/node';
import { buildApp } from './app.js';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';
import { sql } from './db/client.js';
import { redis, redisSub } from './db/redis.js';
import { startJobs } from './jobs/index.js';
import { ensureBucket } from './lib/storage.js';
import { startHub, stopHub } from './ws/hub.js';
import { attachWebSocket } from './ws/server.js';

if (config.SENTRY_DSN) {
  Sentry.init({ dsn: config.SENTRY_DSN, environment: config.NODE_ENV, tracesSampleRate: 0.1 });
}

await ensureBucket();

const app = await buildApp();
const stopJobs = startJobs();

await startHub();
const detachWebSocket = attachWebSocket(app.server);

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  stopJobs();
  detachWebSocket();
  await stopHub();
  await app.close();
  await sql.end({ timeout: 5 });
  redis.disconnect();
  redisSub.disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.PORT, host: '0.0.0.0' });
logger.info({ port: config.PORT, env: config.NODE_ENV }, 'server started');
