import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Downloads the latest successful "Build desktop" run into ../installers, so the
 * folder always holds the current binaries instead of a pile of stale versions.
 *
 * Usage: node scripts/fetch-build.mjs
 */
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(dirname(repoRoot), 'installers');

// gh is not on PATH in every shell on this machine.
const GH = process.env.GH_PATH ?? 'C:\\Program Files\\GitHub CLI\\gh.exe';

function gh(args) {
  return execFileSync(GH, args, { cwd: repoRoot, encoding: 'utf8' });
}

const runs = JSON.parse(
  gh(['run', 'list', '--workflow=Build desktop', '--limit', '10', '--json',
      'databaseId,status,conclusion']),
);

const run = runs.find((r) => r.status === 'completed' && r.conclusion === 'success');
if (!run) {
  console.error('No successful "Build desktop" run to download.');
  process.exit(1);
}

const staging = join(target, '.staging');
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });

console.error(`downloading run ${run.databaseId}…`);
gh(['run', 'download', String(run.databaseId), '-D', staging]);

// Artifacts arrive in one directory per platform; the installers folder is flat.
for (const entry of await readdir(staging)) {
  const path = join(staging, entry);
  if (!(await stat(path)).isDirectory()) continue;

  for (const file of await readdir(path)) {
    await cp(join(path, file), join(target, file), { force: true });
  }
}

// Anything left from an older version would only confuse testing.
const fresh = new Set(await readdir(staging).then(async (dirs) => {
  const names = [];
  for (const dir of dirs) {
    const path = join(staging, dir);
    if ((await stat(path)).isDirectory()) names.push(...(await readdir(path)));
  }
  return names;
}));

for (const file of await readdir(target)) {
  if (file !== '.staging' && !fresh.has(file)) {
    await rm(join(target, file), { force: true });
    console.error(`removed stale ${file}`);
  }
}

await rm(staging, { recursive: true, force: true });
console.error(`installers updated in ${target}`);
