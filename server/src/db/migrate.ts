import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from './client.js';
import { logger } from '../lib/logger.js';

/**
 * Migrations come in reversible pairs: `NNNN_name.up.sql` and `NNNN_name.down.sql`.
 * `up` applies every pair not yet recorded; `down` reverses the most recent one.
 * Applied names are recorded in `_migrations` and never re-run, and a merged migration
 * is never edited — add a new pair instead.
 */
const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

interface Migration {
  name: string;
  upFile: string;
  downFile: string;
}

async function loadMigrations(): Promise<Migration[]> {
  const files = await readdir(dir);
  const suffix = '.up.sql';

  return files
    .filter((f) => f.endsWith(suffix))
    .sort()
    .map((upFile) => {
      const name = upFile.slice(0, -suffix.length);
      const downFile = `${name}.down.sql`;
      if (!files.includes(downFile)) {
        throw new Error(`Migration ${name} has no down file — migrations must be reversible`);
      }
      return { name, upFile, downFile };
    });
}

async function ensureTable() {
  await sql`create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;
}

async function appliedNames(): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`select name from _migrations order by name`;
  return rows.map((r) => r.name);
}

async function up() {
  await ensureTable();
  const applied = new Set(await appliedNames());
  const pending = (await loadMigrations()).filter((m) => !applied.has(m.name));

  if (pending.length === 0) {
    logger.info('no pending migrations');
    return;
  }

  for (const migration of pending) {
    const content = await readFile(join(dir, migration.upFile), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`insert into _migrations (name) values (${migration.name})`;
    });
    logger.info({ migration: migration.name }, 'migration applied');
  }
}

async function down() {
  await ensureTable();
  const last = (await appliedNames()).at(-1);

  if (!last) {
    logger.info('nothing to roll back');
    return;
  }

  const migration = (await loadMigrations()).find((m) => m.name === last);
  if (!migration) {
    throw new Error(`Migration ${last} is recorded as applied but its files are missing`);
  }

  const content = await readFile(join(dir, migration.downFile), 'utf8');
  await sql.begin(async (tx) => {
    await tx.unsafe(content);
    await tx`delete from _migrations where name = ${last}`;
  });
  logger.info({ migration: last }, 'migration rolled back');
}

const command = process.argv[2] ?? 'up';

const run = async () => {
  if (command === 'up') return up();
  if (command === 'down') return down();
  throw new Error(`Unknown command "${command}" — expected "up" or "down"`);
};

run()
  .then(() => sql.end())
  .catch(async (err) => {
    logger.error({ err }, 'migration failed');
    await sql.end({ timeout: 5 }).catch(() => undefined);
    process.exit(1);
  });
