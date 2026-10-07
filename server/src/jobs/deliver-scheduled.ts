import { logger } from '../lib/logger.js';
import * as repo from '../modules/chats/repo.js';
import { toMessage } from '../modules/chats/types.js';
import * as hub from '../ws/hub.js';

/**
 * Sends messages whose scheduled moment has passed.
 *
 * The claim and the update happen in one statement with `for update skip
 * locked`, so running this on two processes delivers each message once rather
 * than twice. A message the job has claimed is already a normal message: this
 * only has to announce it.
 */
const BATCH = 200;

export async function deliverScheduled(): Promise<number> {
  const due = await repo.claimDueMessages(BATCH);
  if (due.length === 0) return 0;

  for (const row of due) {
    try {
      const members = await repo.memberIds(row.chatId);
      await hub.publish(members, { type: 'message.new', payload: toMessage(row) });
    } catch (err) {
      // The row is already delivered as far as the database is concerned;
      // losing the announcement is recoverable through GET /sync, losing the
      // whole batch to one bad chat is not.
      logger.warn({ err, messageId: row.id }, 'scheduled message announce failed');
    }
  }

  logger.info({ delivered: due.length }, 'scheduled messages delivered');
  return due.length;
}
