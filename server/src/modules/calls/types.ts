import type { CallEndReason, CallKind } from '@bmf/shared';

export interface CallRow {
  id: string;
  chatId: string;
  startedBy: string | null;
  kind: CallKind;
  room: string;
  startedAt: Date;
  endedAt: Date | null;
  endReason: CallEndReason | null;
}

export interface CallParticipantRow {
  callId: string;
  userId: string;
  joinedAt: Date | null;
  leftAt: Date | null;
  invitedAt: Date;
}

/** A finished call joined to the chat it happened in, for the history screen. */
export interface CallHistoryRow {
  id: string;
  chatId: string;
  kind: CallKind;
  startedBy: string | null;
  startedAt: Date;
  endedAt: Date | null;
  chatType: string;
  chatTitle: string;
  peerName: string | null;
  peerId: string | null;
  answered: boolean;
  /** Postgres returns `extract(epoch …)` as a numeric string, or null. */
  connectedSeconds: string | null;
}
