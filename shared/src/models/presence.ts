import type { StatusId } from './user.js';

/**
 * Whether someone is reachable right now.
 *
 * Deliberately separate from `User.statusId`, which is what a person chose to
 * say about themselves ("в фокусе", "в отпуске") and outlives any connection.
 * Presence is what the server observes: a device holding an open socket.
 */
export interface Presence {
  userId: string;
  online: boolean;
  /** ISO timestamp of the last heartbeat; null when never seen. */
  lastSeenAt: string | null;
  /**
   * What to show about a reachable person — their chosen status, or the one the
   * server derived for them when they asked for it to follow their activity.
   * Null when they are offline: there is nothing to say beyond that.
   */
  statusId: StatusId | null;
}
