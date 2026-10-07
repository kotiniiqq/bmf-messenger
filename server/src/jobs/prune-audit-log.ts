import { sql } from '../db/client.js';
import { logger } from '../lib/logger.js';

/** Section 10 requires bounded retention for operational data, not "forever". */
const RETENTION_DAYS = 90;

export async function pruneAuditLog(): Promise<number> {
  const rows = await sql`
    delete from audit_log
    where created_at < now() - ${`${RETENTION_DAYS} days`}::interval
    returning id`;

  if (rows.length > 0) {
    logger.info({ removed: rows.length, retentionDays: RETENTION_DAYS }, 'audit log pruned');
  }

  return rows.length;
}
