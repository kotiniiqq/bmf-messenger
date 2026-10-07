import type { Call } from '../models/call.js';
import type { Chat } from '../models/chat.js';
import type { ChatPrivacy } from '../models/e2e.js';
import type { Message } from '../models/message.js';
import type { Presence } from '../models/presence.js';

/** Server -> client. A client that reconnects catches up via GET /sync?since=cursor. */
export type ServerEvent =
  | { type: 'message.new'; payload: Message }
  | { type: 'message.edit'; payload: Message }
  | { type: 'message.delete'; payload: { chatId: string; messageId: string } }
  | { type: 'message.reaction'; payload: { messageId: string; emoji: string; count: number } }
  | { type: 'chat.update'; payload: Chat }
  // Somebody left, or was handed the chat because its owner did. The roster the
  // client caches when a chat opens is stale from this moment on, and the header
  // count is with it.
  | { type: 'chat.member'; payload: { chatId: string; userId: string; left: boolean } }
  | { type: 'read.update'; payload: { chatId: string; userId: string; lastReadMessageId: string } }
  | { type: 'presence.update'; payload: Presence }
  | { type: 'typing.start'; payload: { chatId: string; userId: string } }
  // Both carry the whole call rather than an id: a client that has just come
  // back has nowhere to look it up, and a ring that arrives without knowing
  // which chat it belongs to cannot be drawn.
  | { type: 'call.incoming'; payload: Call }
  | { type: 'call.state'; payload: Call }
  // The privacy mode is offered, accepted or called off. It travels as its own
  // event rather than inside chat.update because the offer needs an answer, and
  // a client that missed it would leave the other side waiting.
  | { type: 'chat.privacy'; payload: ChatPrivacy }
  | { type: 'mail.new'; payload: { accountId: string; messageId: string; subject: string } };

export type ClientEvent =
  | { type: 'typing'; payload: { chatId: string } }
  | { type: 'read'; payload: { chatId: string; messageId: string } }
  /**
   * `idleSeconds` is how long the machine has been untouched, not the window:
   * an automatic status that says "at the keyboard" while the person is in
   * another application is worth less than no status at all. Optional, because
   * a client running in a plain browser cannot know it.
   */
  | { type: 'presence.ping'; payload?: { idleSeconds?: number } };
