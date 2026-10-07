import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { LIMITS, type ClientEvent } from '@bmf/shared';
import { logger } from '../lib/logger.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { isDeviceRevoked } from '../modules/auth/plugin.js';
import * as chats from '../modules/chats/service.js';
import * as presence from '../modules/presence/service.js';
import * as hub from './hub.js';

/**
 * One socket per device, authorised at handshake with the access token
 * (spec section 6). The token goes in the `Sec-WebSocket-Protocol` header
 * rather than the query string, because query strings land in access logs.
 */
async function authenticate(req: {
  headers: Record<string, string | string[] | undefined>;
  url?: string;
}): Promise<{ userId: string; deviceId: string } | null> {
  const protocol = req.headers['sec-websocket-protocol'];
  const offered = Array.isArray(protocol) ? protocol.join(',') : (protocol ?? '');
  const bearer = offered
    .split(',')
    .map((p) => p.trim())
    .find((p) => p.startsWith('bearer.'));

  const token = bearer?.slice('bearer.'.length);
  if (!token) return null;

  try {
    const claims = await verifyAccessToken(token);
    if (await isDeviceRevoked(claims.deviceId)) return null;
    return { userId: claims.userId, deviceId: claims.deviceId };
  } catch {
    return null;
  }
}

async function handleClientEvent(
  userId: string,
  deviceId: string,
  raw: string,
): Promise<void> {
  let event: ClientEvent;
  try {
    event = JSON.parse(raw) as ClientEvent;
  } catch {
    return;
  }

  switch (event.type) {
    case 'typing': {
      // Typing is ephemeral: it is never stored and never replayed by /sync.
      const members = await chats.membersOf(event.payload.chatId, userId);
      await hub.publish(
        members,
        { type: 'typing.start', payload: { chatId: event.payload.chatId, userId } },
        deviceId,
      );
      break;
    }

    case 'read': {
      await chats.markRead(event.payload.chatId, userId, event.payload.messageId);
      const members = await chats.membersOf(event.payload.chatId, userId);
      await hub.publish(members, {
        type: 'read.update',
        payload: {
          chatId: event.payload.chatId,
          userId,
          lastReadMessageId: event.payload.messageId,
        },
      });
      break;
    }

    case 'presence.ping':
      hub.markAlive(deviceId);
      await presence.heartbeat(userId, deviceId, event.payload?.idleSeconds);
      break;
  }
}

/**
 * Takes the raw HTTP server, not the Fastify instance — the socket layer has
 * no business knowing about routes, and it keeps the logger generics out.
 *
 * The upgrade is handled manually rather than by binding the server directly,
 * so an unauthorised client is refused with a plain 401 before the handshake
 * completes. Letting it connect and closing afterwards would spend a socket on
 * every rejected attempt and leave the client guessing why it dropped.
 */
export function attachWebSocket(server: Server): () => void {
  const wss = new WebSocketServer({ noServer: true });

  const onUpgrade = (
    req: import('node:http').IncomingMessage,
    socket: import('node:stream').Duplex,
    head: Buffer,
  ) => {
    if (!req.url?.startsWith('/ws')) return;

    void (async () => {
      const identity = await authenticate(req as never);

      if (!identity) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        const { userId, deviceId } = identity;
        hub.register(ws, userId, deviceId);
        logger.info({ userId, deviceId }, 'ws connected');

        void presence
          .heartbeat(userId, deviceId)
          .catch((err) => logger.warn({ err, deviceId }, 'presence connect failed'));

        ws.on('pong', () => {
          hub.markAlive(deviceId);
          // The protocol-level pong is a heartbeat too, so a client that only
          // answers pings still counts as present.
          void presence
            .heartbeat(userId, deviceId)
            .catch((err) => logger.warn({ err, deviceId }, 'presence heartbeat failed'));
        });
        ws.on('message', (data) => {
          void handleClientEvent(userId, deviceId, data.toString()).catch((err) =>
            logger.warn({ err, deviceId }, 'ws client event failed'),
          );
        });

        ws.on('close', () => {
          hub.unregister(deviceId);
          void presence
            .disconnected(userId, deviceId)
            .catch((err) => logger.warn({ err, deviceId }, 'presence disconnect failed'));
          logger.info({ userId, deviceId }, 'ws disconnected');
        });

        ws.on('error', (err) => logger.warn({ err, deviceId }, 'ws error'));
      });
    })();
  };

  server.on('upgrade', onUpgrade);

  const heartbeat = setInterval(() => hub.sweepDead(), LIMITS.wsHeartbeatMs);
  heartbeat.unref();

  return () => {
    clearInterval(heartbeat);
    server.off('upgrade', onUpgrade);
    wss.close();
  };
}
