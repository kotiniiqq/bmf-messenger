import { logger } from '../lib/logger.js';
import { deliverScheduled } from './deliver-scheduled.js';
import { pruneAuditLog } from './prune-audit-log.js';
import { pruneOrphans } from '../modules/media/service.js';
import { sweepStale as sweepStaleCalls } from '../modules/calls/service.js';
import { syncDue as syncMailboxes } from '../modules/mail/service.js';

/** Every background job is registered here and nowhere else (CONTRIBUTING.md layout rules). */
const DAY_MS = 24 * 60 * 60 * 1000;

interface Job {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
}

const jobs: Job[] = [
  // Runs often: the delay between the promised minute and delivery is the
  // whole quality of the feature.
  { name: 'deliver-scheduled', intervalMs: 15_000, run: deliverScheduled },
  { name: 'prune-audit-log', intervalMs: DAY_MS, run: pruneAuditLog },
  // Uploads a client abandoned between the upload and the send would otherwise
  // occupy the 60 GB disk forever.
  { name: 'prune-orphan-uploads', intervalMs: DAY_MS / 4, run: () => pruneOrphans(24) },
  // Not housekeeping: only one call may be live per chat, so a ring left open by
  // a client that died blocks every future call in that chat until it is closed.
  { name: 'sweep-stale-calls', intervalMs: 20_000, run: sweepStaleCalls },
  // Mailboxes are polled rather than pushed: IMAP IDLE would hold a connection
  // open per mailbox, and this host has two cores.
  { name: 'sync-mailboxes', intervalMs: 60_000, run: syncMailboxes },
];

export function startJobs(): () => void {
  const timers = jobs.map((job) => {
    const timer = setInterval(() => {
      job.run().catch((err) => logger.error({ err, job: job.name }, 'job failed'));
    }, job.intervalMs);

    // A pending timer must never hold the process open during shutdown.
    timer.unref();
    return timer;
  });

  logger.info({ jobs: jobs.map((j) => j.name) }, 'background jobs started');
  return () => timers.forEach((timer) => clearInterval(timer));
}
