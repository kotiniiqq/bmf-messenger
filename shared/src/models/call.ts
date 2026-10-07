/**
 * A call in a chat.
 *
 * The media itself never touches our API — LiveKit carries it. What lives here
 * is who started what and when, which is the part a client cannot be trusted to
 * report and the part the history screen is drawn from.
 */
export type CallKind = 'audio' | 'video';

export type CallEndReason = 'hangup' | 'declined' | 'missed' | 'failed';

export interface Call {
  id: string;
  chatId: string;
  startedBy: string | null;
  kind: CallKind;
  startedAt: string;
  endedAt: string | null;
  endReason: CallEndReason | null;
  /** Who is in the room right now. Empty while it is still ringing. */
  participantIds: string[];
}

/**
 * One row of the history screen.
 *
 * Assembled on the server rather than in the client: whether a call counts as
 * missed depends on who actually joined it, which is a question about
 * `call_participants` and not about anything the client can see.
 */
export interface CallHistoryEntry {
  id: string;
  chatId: string;
  /** The other person for a direct chat, the chat's own title otherwise. */
  title: string;
  peerId: string | null;
  kind: CallKind;
  direction: 'in' | 'out';
  /** Nobody but the caller ever joined. */
  missed: boolean;
  startedAt: string;
  endedAt: string | null;
  /** Seconds spent connected; null for a call that never connected at all. */
  durationSeconds: number | null;
}

/**
 * What a client needs to join, handed out one call at a time.
 *
 * The token is short-lived and scoped to a single room, and the relay
 * credentials expire within minutes: nothing here is worth stealing for long,
 * which is the point — the long-lived secrets stay on the server.
 */
export interface CallCredentials {
  call: Call;
  /** LiveKit access token, valid for this room and this user only. */
  token: string;
  /** Where to take it, e.g. wss://livekit.bmf.ink */
  url: string;
  iceServers: IceServer[];
}

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}
