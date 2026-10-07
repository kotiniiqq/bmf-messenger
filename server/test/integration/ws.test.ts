import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ServerEvent } from '@bmf/shared';
import type { App } from '../../src/app.js';
import { startHub, stopHub } from '../../src/ws/hub.js';
import { attachWebSocket } from '../../src/ws/server.js';
import {
  CONSENTS,
  DEVICE,
  clearRateLimits,
  startTestApp,
  stopTestApp,
  truncateAll,
  uniqueUser,
} from '../helpers/app.js';

let app: App;
let server: Server;
let detach: () => void;
let port: number;

interface Actor {
  userId: string;
  accessToken: string;
  headers: { authorization: string };
}

async function makeUser(suffix: string): Promise<Actor> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { ...uniqueUser(suffix), device: DEVICE, consents: CONSENTS },
  });
  const body = res.json();
  return {
    userId: body.user.id,
    accessToken: body.tokens.accessToken,
    headers: { authorization: `Bearer ${body.tokens.accessToken}` },
  };
}

/** Opens a socket and resolves once it is actually connected. */
function connect(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, [`bearer.${token}`]);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
    socket.once('close', (code) => reject(new Error(`closed with ${code}`)));
  });
}

/** Waits for the next batch of events, or gives up. */
function nextEvents(socket: WebSocket, timeoutMs = 4000): Promise<ServerEvent[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no events received')), timeoutMs);
    socket.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()) as ServerEvent[]);
    });
  });
}

beforeAll(async () => {
  app = await startTestApp();
  await startHub();

  // A real socket needs a listening server; app.inject() alone cannot provide one.
  server = createServer((req, res) => app.server.emit('request', req, res));
  detach = attachWebSocket(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
});

beforeEach(async () => {
  await truncateAll();
  await clearRateLimits();
});

afterAll(async () => {
  detach();
  await stopHub();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await stopTestApp(app);
});

describe('websocket handshake', () => {
  it('refuses a connection without a token', async () => {
    await expect(connect('')).rejects.toThrow();
  });

  it('refuses a garbage token', async () => {
    await expect(connect('not-a-real-token')).rejects.toThrow();
  });

  it('accepts a valid access token', async () => {
    const alice = await makeUser('wsa');
    const socket = await connect(alice.accessToken);
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });
});

describe('event delivery', () => {
  it('pushes a new message to the other party in real time', async () => {
    const alice = await makeUser('wa');
    const bob = await makeUser('wb');

    const chat = await app.inject({
      method: 'POST',
      url: '/api/v1/chats/direct',
      headers: alice.headers,
      payload: { userId: bob.userId },
    });
    const chatId = chat.json().id;

    const socket = await connect(bob.accessToken);
    const incoming = nextEvents(socket);

    await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: alice.headers,
      payload: { clientMsgId: randomUUID(), body: 'live delivery' },
    });

    const events = await incoming;
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('message.new');
    expect((events[0]!.payload as { body: string }).body).toBe('live delivery');

    socket.close();
  });

  it('batches a burst into a single frame', async () => {
    const alice = await makeUser('ba');
    const bob = await makeUser('bb');

    const chat = await app.inject({
      method: 'POST',
      url: '/api/v1/chats/direct',
      headers: alice.headers,
      payload: { userId: bob.userId },
    });
    const chatId = chat.json().id;

    const socket = await connect(bob.accessToken);
    const incoming = nextEvents(socket);

    await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: `/api/v1/chats/${chatId}/messages`,
          headers: alice.headers,
          payload: { clientMsgId: randomUUID(), body: `burst ${i}` },
        }),
      ),
    );

    const events = await incoming;
    // The 50ms window should collect several of them rather than one per frame.
    expect(events.length).toBeGreaterThan(1);

    socket.close();
  });

  it('does not deliver messages from chats the listener is not in', async () => {
    const alice = await makeUser('oa');
    const bob = await makeUser('ob');
    const outsider = await makeUser('oc');

    const chat = await app.inject({
      method: 'POST',
      url: '/api/v1/chats/direct',
      headers: alice.headers,
      payload: { userId: bob.userId },
    });
    const chatId = chat.json().id;

    const socket = await connect(outsider.accessToken);
    const incoming = nextEvents(socket, 1500);

    await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: alice.headers,
      payload: { clientMsgId: randomUUID(), body: 'not for you' },
    });

    await expect(incoming).rejects.toThrow('no events received');
    socket.close();
  });
});
