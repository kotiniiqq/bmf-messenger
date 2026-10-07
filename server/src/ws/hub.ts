import type { WebSocket } from 'ws';
import type { ServerEvent } from '@bmf/shared';
import { LIMITS } from '@bmf/shared';
import { redis, redisSub } from '../db/redis.js';
import { logger } from '../lib/logger.js';

/**
 * Fan-out for server-to-client events.
 *
 * Sockets live in this process, but a user may be connected to another one, so
 * every event goes through Redis pub/sub and each process delivers to the
 * sockets it owns. Events are batched over a short window so a bulk operation
 * does not fire one frame per row (spec section 6).
 */
const CHANNEL = 'bmf:events';

interface Connection {
  socket: WebSocket;
  userId: string;
  deviceId: string;
  /** Frames waiting for the batch window to close. */
  pending: ServerEvent[];
  timer: NodeJS.Timeout | null;
  alive: boolean;
}

const byDevice = new Map<string, Connection>();
const byUser = new Map<string, Set<string>>();

export function connectionCount(): number {
  return byDevice.size;
}

export function register(socket: WebSocket, userId: string, deviceId: string): Connection {
  // One connection per device: a reconnect replaces the stale socket.
  close(deviceId, 'replaced by a newer connection');

  const connection: Connection = { socket, userId, deviceId, pending: [], timer: null, alive: true };
  byDevice.set(deviceId, connection);

  const devices = byUser.get(userId) ?? new Set<string>();
  devices.add(deviceId);
  byUser.set(userId, devices);

  return connection;
}

export function unregister(deviceId: string): void {
  const connection = byDevice.get(deviceId);
  if (!connection) return;

  if (connection.timer) clearTimeout(connection.timer);
  byDevice.delete(deviceId);

  const devices = byUser.get(connection.userId);
  devices?.delete(deviceId);
  if (devices && devices.size === 0) byUser.delete(connection.userId);
}

export function close(deviceId: string, reason: string): void {
  const connection = byDevice.get(deviceId);
  if (!connection) return;

  try {
    connection.socket.close(1000, reason);
  } catch {
    // Already gone; unregister below is what matters.
  }
  unregister(deviceId);
}

function flush(connection: Connection): void {
  connection.timer = null;
  if (connection.pending.length === 0) return;

  const batch = connection.pending;
  connection.pending = [];

  try {
    connection.socket.send(JSON.stringify(batch));
  } catch (err) {
    logger.warn({ err, deviceId: connection.deviceId }, 'ws send failed');
  }
}

function enqueue(connection: Connection, event: ServerEvent): void {
  connection.pending.push(event);
  connection.timer ??= setTimeout(() => flush(connection), LIMITS.wsEventBatchMs);
}

/** Delivers to sockets held by this process. */
function deliverLocally(userIds: string[], event: ServerEvent, exceptDevice?: string): void {
  for (const userId of userIds) {
    for (const deviceId of byUser.get(userId) ?? []) {
      if (deviceId === exceptDevice) continue;
      const connection = byDevice.get(deviceId);
      if (connection) enqueue(connection, event);
    }
  }
}

interface Envelope {
  userIds: string[];
  event: ServerEvent;
  exceptDevice?: string;
}

/** Publishes to every process, including this one. */
export async function publish(
  userIds: string[],
  event: ServerEvent,
  exceptDevice?: string,
): Promise<void> {
  if (userIds.length === 0) return;
  const envelope: Envelope = { userIds, event, exceptDevice };
  await redis.publish(CHANNEL, JSON.stringify(envelope));
}

let subscribed = false;

export async function startHub(): Promise<void> {
  if (subscribed) return;
  subscribed = true;

  await redisSub.subscribe(CHANNEL);
  redisSub.on('message', (channel, payload) => {
    if (channel !== CHANNEL) return;

    try {
      const envelope = JSON.parse(payload) as Envelope;
      deliverLocally(envelope.userIds, envelope.event, envelope.exceptDevice);
    } catch (err) {
      logger.warn({ err }, 'malformed event envelope');
    }
  });

  logger.info('websocket hub subscribed');
}

export async function stopHub(): Promise<void> {
  for (const deviceId of [...byDevice.keys()]) close(deviceId, 'server shutting down');
  if (subscribed) {
    await redisSub.unsubscribe(CHANNEL).catch(() => undefined);
    subscribed = false;
  }
}

export function markAlive(deviceId: string): void {
  const connection = byDevice.get(deviceId);
  if (connection) connection.alive = true;
}

/**
 * Drops sockets that missed a heartbeat. A half-open TCP connection looks
 * healthy to the server forever otherwise, and the client would sit waiting
 * for events that go nowhere.
 */
export function sweepDead(): void {
  for (const [deviceId, connection] of byDevice) {
    if (!connection.alive) {
      logger.info({ deviceId }, 'ws heartbeat missed, dropping');
      close(deviceId, 'heartbeat missed');
      continue;
    }

    connection.alive = false;
    try {
      connection.socket.ping();
    } catch {
      close(deviceId, 'ping failed');
    }
  }
}
