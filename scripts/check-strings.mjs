import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Fails if a Cyrillic string sits anywhere in the client outside the dictionary.
 *
 * Hard rule 1: the interface speaks Russian, the code does not. A label written
 * straight into a component is invisible to translation and impossible to reuse,
 * and the cost of pulling them back out grows with every screen — which is what
 * happened before `desktop/src/i18n` existed.
 *
 * Usage: node scripts/check-strings.mjs
 */
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(repoRoot, 'desktop', 'src');
const dictDir = join(srcDir, 'i18n');

const CYRILLIC = /[\u0400-\u04FF]/;

/**
 * Files whose strings have not been moved yet \u2014 empty, and meant to stay that
 * way. It exists because the sweep landed in pieces: a file left this list and
 * never returned, and anything not listed was checked from its first commit.
 * The check refuses a file that is listed but already clean, so the list could
 * not rot while it was shrinking.
 */
const PENDING = new Set([]);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === dictDir) continue;
      yield* walk(full);
    } else if (/\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}

/**
 * Strips what is allowed to hold Russian: block comments, line comments, and
 * `docs/…` paths do not reach a user. Everything left is either a literal or
 * JSX text, and both are the thing this check is looking for.
 */
function strip(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (line) => line.replace(/[^\n]/g, ' '));
}

const problems = [];
const clean = [];

for await (const file of walk(srcDir)) {
  const name = relative(repoRoot, file).split(sep).join('/');
  const raw = (await readFile(file, 'utf8')).split('\n');
  const hits = strip(raw.join('\n'))
    .split('\n')
    .map((line, index) => {
      if (!CYRILLIC.test(line)) return null;
      // `i18n-ok`, on the line or the comment above it, marks text that is
      // matched against rather than shown: OS device names arrive in the
      // system language and have to be compared literally.
      if (raw[index]?.includes('i18n-ok') || raw[index - 1]?.includes('i18n-ok')) return null;
      return `${name}:${index + 1} — ${line.trim()}`;
    })
    .filter(Boolean);

  // A converted file that is still listed means the list outlived the work.
  if (PENDING.has(name)) {
    if (!hits.length) clean.push(name);
    continue;
  }

  problems.push(...hits);
}

if (clean.length) {
  console.error('These files hold no Russian any more — drop them from PENDING:\n');
  for (const name of clean.sort()) console.error('  ' + name);
  console.error('');
  process.exit(1);
}

if (problems.length) {
  console.error('Russian text outside desktop/src/i18n:\n');
  for (const problem of problems) console.error('  ' + problem);
  console.error(
    `\n${problems.length} line(s). Move the text into desktop/src/i18n/ru.ts and read it` +
      " with t('some.key'), so the interface stays translatable (hard rule 1).",
  );
  process.exit(1);
}

console.error(
  PENDING.size
    ? `check-strings: ok (${PENDING.size} file(s) still to convert)`
    : 'check-strings: ok (no Russian outside the dictionary)',
);
