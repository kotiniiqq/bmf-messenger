import pino from 'pino';
import { config } from './config.js';

/** Structured logs only. Never log secrets, tokens, message bodies or mail contents. */
export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
    remove: true,
  },
  transport: config.isProd ? undefined : { target: 'pino-pretty' },
});
