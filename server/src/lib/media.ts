import { createHmac } from 'node:crypto';
import { SignJWT } from 'jose';
import type { IceServer } from '@bmf/shared';
import { config } from './config.js';

/**
 * Credentials for the media plane: a LiveKit token and a set of ICE servers.
 *
 * Both are short-lived on purpose. The long-lived secrets — the LiveKit API
 * secret and coturn's shared secret — never leave this process; what a client
 * receives is only useful for one room, for a few minutes.
 */

/** How long a client has to use a token before it has to ask again. */
const TOKEN_TTL_SECONDS = 10 * 60;

/** Relay credentials outlive the token slightly: a long call re-uses them. */
const TURN_TTL_SECONDS = 12 * 60 * 60;

export function mediaConfigured(): boolean {
  return Boolean(config.LIVEKIT_URL && config.LIVEKIT_API_KEY && config.LIVEKIT_API_SECRET);
}

/**
 * A LiveKit access token: a JWT whose `video` grant says which room the bearer
 * may join. Signed here rather than through the LiveKit SDK because the claim
 * set is small, documented, and `jose` is already a dependency — one less
 * package that can pull in a transitive surprise.
 */
export async function livekitToken(room: string, userId: string, name: string): Promise<string> {
  if (!config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET) {
    throw new Error('LiveKit is not configured');
  }

  const secret = new TextEncoder().encode(config.LIVEKIT_API_SECRET);

  return new SignJWT({
    name,
    video: {
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.LIVEKIT_API_KEY)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS)
    .sign(secret);
}

/**
 * Closes the LiveKit room, disconnecting whoever is still in it.
 *
 * Ending a call in our database does not stop LiveKit. Without this the caller
 * keeps sitting in an open room listening to nothing, and the only thing that
 * ever ends it is them noticing.
 *
 * Failure is logged, not thrown: the call is already over as far as everything
 * else is concerned, and an empty room costs nothing until it times out.
 */
export async function closeRoom(room: string): Promise<void> {
  if (!mediaConfigured() || !config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET) return;

  const secret = new TextEncoder().encode(config.LIVEKIT_API_SECRET);
  const token = await new SignJWT({ video: { roomAdmin: true, room } })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.LIVEKIT_API_KEY)
    .setSubject('api')
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
    .sign(secret);

  // The signalling URL is a WebSocket one; the management API is plain HTTP on
  // the same host.
  const base = (config.LIVEKIT_URL ?? '').replace(/^ws/, 'http');

  try {
    await fetch(`${base}/twirp/livekit.RoomService/DeleteRoom`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ room }),
    });
  } catch (err) {
    console.error('could not close LiveKit room', room, err);
  }
}

/**
 * Time-limited TURN credentials, the scheme coturn calls `use-auth-secret`:
 * the username is an expiry timestamp, the password is its HMAC under the
 * shared secret. coturn verifies it without storing anything, so there is no
 * account to leak and nothing to revoke.
 */
export function turnCredentials(userId: string): { username: string; credential: string } | null {
  if (!config.TURN_SECRET || !config.TURN_HOST) return null;

  const expiry = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
  const username = `${expiry}:${userId}`;
  const credential = createHmac('sha1', config.TURN_SECRET).update(username).digest('base64');

  return { username, credential };
}

/**
 * What the client hands to WebRTC.
 *
 * STUN comes first so a direct path is tried before the relay — the spec asks
 * for two seconds of trying direct, then a silent fall back to TURN, and this
 * is the half of that arrangement the server owns.
 */
export function iceServers(userId: string): IceServer[] {
  if (!config.TURN_HOST) return [];

  const relay = turnCredentials(userId);
  const servers: IceServer[] = [{ urls: [`stun:${config.TURN_HOST}:3478`] }];

  if (relay) {
    servers.push({
      urls: [`turn:${config.TURN_HOST}:3478?transport=udp`, `turn:${config.TURN_HOST}:3478?transport=tcp`],
      username: relay.username,
      credential: relay.credential,
    });
  }

  return servers;
}
