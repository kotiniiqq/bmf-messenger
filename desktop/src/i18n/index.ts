import { ru } from './ru.js';

/**
 * Interface strings live here and nowhere else (hard rule 1).
 *
 * Deliberately boring: one dictionary object, a lookup by dotted key, and no
 * runtime language switching yet — the client ships Russian only, and the
 * language row in settings is still a stage-5 stub. What this buys today is
 * that the strings are in one file instead of four thousand lines of JSX, so
 * adding a second language later is a new file rather than another sweep
 * through every screen.
 *
 * `scripts/check-strings.mjs` fails the build on a Cyrillic literal anywhere
 * outside this directory, which is what keeps the rule true after this change.
 */

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every dotted path in the dictionary that resolves to a string. */
export type MessageKey = Leaves<typeof ru>;

export type Params = Record<string, string | number>;

function lookup(key: string): string | undefined {
  let node: unknown = ru;

  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }

  return typeof node === 'string' ? node : undefined;
}

/**
 * `t('chat.compose.placeholder')`, with `{name}` holes filled from `params`.
 *
 * A missing key returns the key itself. That is on purpose: a visible
 * `chat.compose.placeholder` in the UI is a bug report, while an empty string
 * is a screen that silently lost its labels.
 */
export function t(key: MessageKey, params?: Params): string {
  const template = lookup(key);
  if (template === undefined) return key;
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/**
 * Russian needs three forms, and picking one by `n === 1` is the mistake that
 * produces "1 файлов". Takes them in the order the language teaches them:
 * one file, two files, five files.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;

  switch (mod100 % 10) {
    case 1:
      return one;
    case 2:
    case 3:
    case 4:
      return few;
    default:
      return many;
  }
}

export { ru };
