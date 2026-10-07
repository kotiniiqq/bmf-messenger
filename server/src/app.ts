import Fastify, { type FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import * as Sentry from '@sentry/node';
import { ZodError } from 'zod';
import { ERROR, LIMITS } from '@bmf/shared';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';
import { AppError } from './lib/errors.js';
import { healthRoutes } from './modules/health/router.js';
import { authRoutes } from './modules/auth/router.js';
import { chatRoutes } from './modules/chats/router.js';
import { searchRoutes } from './modules/search/router.js';
import { mediaRoutes } from './modules/media/router.js';
import { callRoutes } from './modules/calls/router.js';
import { mailRoutes } from './modules/mail/router.js';
import { presenceRoutes } from './modules/presence/router.js';
import { userRoutes } from './modules/users/router.js';
import { keyRoutes } from './modules/keys/router.js';
import { contactRoutes } from './modules/contacts/router.js';
import { noteRoutes } from './modules/notes/router.js';

/** Every REST route except the health probes lives under this prefix (spec section 6). */
export const API_PREFIX = '/api/v1';

/**
 * Builds a fully wired application without listening on a port, so integration
 * tests can drive it through `app.inject()` against a real database.
 */
export async function buildApp() {
  const app = Fastify({ loggerInstance: logger, trustProxy: true });

  await app.register(helmet);

    await app.register(cors, {
    // A request with no Origin header is not a browser request, so it needs no
    // CORS grant; anything else must be on the list.
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    credentials: false,
  });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: LIMITS.attachmentSizeBytes, files: 1 } });

  // Both handlers must be installed BEFORE any route plugin is registered.
  // `await app.register(...)` loads the plugin immediately, and the child
  // context captures whatever handlers exist at that moment — setting them
  // afterwards leaves every routed error on Fastify's defaults.
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply
        .code(err.status)
        .send({ code: err.code, message: err.message, details: err.details });
    }

    if (err instanceof ZodError) {
      return reply.code(400).send({
        code: ERROR.VALIDATION,
        message: 'Request validation failed',
        details: { issues: err.issues },
      });
    }

    // Fastify's own errors (rate limit, body parsing) carry a usable status code.
    const status = (err as FastifyError).statusCode;
    if (status && status < 500) {
      const code = status === 429 ? ERROR.RATE_LIMITED : ERROR.VALIDATION;
      return reply.code(status).send({ code, message: (err as FastifyError).message });
    }

    req.log.error({ err }, 'unhandled error');
    if (config.SENTRY_DSN) Sentry.captureException(err);
    return reply.code(500).send({ code: ERROR.INTERNAL, message: 'Something went wrong' });
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ code: ERROR.NOT_FOUND, message: 'Not found' }),
  );

  // Health probes stay unprefixed: Docker and Uptime Kuma expect stable paths.
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: API_PREFIX });
  await app.register(chatRoutes, { prefix: API_PREFIX });
  await app.register(searchRoutes, { prefix: API_PREFIX });
  await app.register(mediaRoutes, { prefix: API_PREFIX });
  await app.register(presenceRoutes, { prefix: API_PREFIX });
  await app.register(callRoutes, { prefix: API_PREFIX });
  await app.register(mailRoutes, { prefix: API_PREFIX });
  await app.register(userRoutes, { prefix: API_PREFIX });
  await app.register(keyRoutes, { prefix: API_PREFIX });
  await app.register(noteRoutes, { prefix: API_PREFIX });
  await app.register(contactRoutes, { prefix: API_PREFIX });

  return app;
}

/** The concrete instance type, including our pino logger. Use this, not FastifyInstance. */
export type App = Awaited<ReturnType<typeof buildApp>>;
