import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Fails if a component uses a CSS class no stylesheet defines.
 *
 * The prototype is the source of truth for how this looks, so a class name that
 * exists nowhere means the markup was invented rather than ported — and it
 * renders unstyled, which is easy to miss on a screen nobody opens.
 *
 * Usage: node scripts/check-classes.mjs
 */
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(repoRoot, 'desktop', 'src');
const prototypeHtml = join(repoRoot, 'docs', 'ui-prototype.html');

const STYLESHEETS = ['prototype.css', 'styles.css'];

async function collectDefined() {
  const defined = new Set();

  for (const name of STYLESHEETS) {
    const css = await readFile(join(srcDir, name), 'utf8');
    // Selectors only: strip declaration blocks first so `.5s` timings and
    // decimals inside values cannot masquerade as class names.
    const selectors = css.replace(/\{[^}]*\}/g, '{}');
    for (const [, cls] of selectors.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) defined.add(cls);
  }

  // The prototype also carries a few structural hooks with no rule of their own
  // (`.sp-item-info` is just a flex child). Those are ported markup too, so the
  // prototype's own `class=` attributes count as defined.
  const html = await readFile(prototypeHtml, 'utf8');
  for (const match of html.matchAll(/class=["']([^"']*)["']/g)) {
    for (const cls of match[1].split(/\s+/)) if (PLAUSIBLE.test(cls)) defined.add(cls);
  }

  return defined;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.tsx')) yield full;
  }
}

const PLAUSIBLE = /^-?[A-Za-z_][\w-]*$/;

/**
 * Pulls class tokens out of one `className=` value.
 *
 * Deliberately conservative — a false alarm would train everyone to ignore this
 * check. Tokens touching a `${` interpolation are dropped (`nav-${layout}` is
 * not the class `nav-`), and a quoted string only counts when it sits where a
 * class list can sit: the whole value, or a branch of a ternary. That skips the
 * operand in `list === 'all' ? …`, which is a value, not a class.
 */
function tokensFrom(value) {
  const tokens = [];

  const push = (chunk, atStart, atEnd) => {
    const parts = chunk.split(/\s+/).filter(Boolean);
    if (!parts.length) return;
    if (!atStart) parts.shift();
    if (!atEnd) parts.pop();
    tokens.push(...parts.filter((part) => PLAUSIBLE.test(part)));
  };

  for (const match of value.matchAll(/'([^']*)'|"([^"]*)"/g)) {
    const before = value.slice(0, match.index).replace(/\s+$/, '').at(-1) ?? '';
    if (before && !'?:{('.includes(before)) continue;
    push(match[1] ?? match[2] ?? '', true, true);
  }

  for (const [, template] of value.matchAll(/`([^`]*)`/g)) {
    const chunks = template.split(/\$\{[^}]*\}/g);
    chunks.forEach((chunk, index) =>
      push(chunk, index === 0, index === chunks.length - 1),
    );
  }

  return tokens;
}

/** Grabs each `className=` value, brace-balanced so nested ternaries survive. */
function classNameValues(source) {
  const values = [];

  for (const match of source.matchAll(/className=/g)) {
    let i = match.index + match[0].length;

    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i];
      const end = source.indexOf(quote, i + 1);
      if (end > 0) values.push(source.slice(i, end + 1));
      continue;
    }

    if (source[i] !== '{') continue;

    let depth = 0;
    const start = i;
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    values.push(source.slice(start, i + 1));
  }

  return values;
}

const defined = await collectDefined();
const problems = [];

for await (const file of walk(srcDir)) {
  const source = await readFile(file, 'utf8');
  const lines = source.split('\n');

  for (const value of classNameValues(source)) {
    for (const token of tokensFrom(value)) {
      if (defined.has(token)) continue;
      const line = lines.findIndex((text) => text.includes(token)) + 1;
      problems.push(`${file.slice(repoRoot.length + 1)}:${line} — .${token}`);
    }
  }
}

if (problems.length) {
  console.error('CSS classes used by components but defined in no stylesheet:\n');
  for (const problem of [...new Set(problems)].sort()) console.error('  ' + problem);
  console.error(
    `\n${problems.length} occurrence(s). Port the markup from docs/ui-prototype.html` +
      ' instead of inventing class names, or add the rule to desktop/src/styles.css.',
  );
  process.exit(1);
}

console.error(`check-classes: ok (${defined.size} classes defined)`);
