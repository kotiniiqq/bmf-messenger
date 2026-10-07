import type { FastifyInstance } from 'fastify';
import { sql } from '../../db/client.js';
import { redis } from '../../db/redis.js';

/**
 * /health/live  — process is up (used by the container runtime)
 * /health/ready — dependencies answer (used by the load balancer and Uptime Kuma)
 */
export async function healthRoutes(app: FastifyInstance) {
  app.get('/health/live', async () => ({ status: 'ok', uptime: process.uptime() }));

  app.get('/health/ready', async (_req, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = {};

    try {
      await sql`select 1`;
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'fail';
    }

    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'fail';
    }

    const healthy = Object.values(checks).every((c) => c === 'ok');
    return reply.code(healthy ? 200 : 503).send({ status: healthy ? 'ok' : 'degraded', checks });
  });
}
