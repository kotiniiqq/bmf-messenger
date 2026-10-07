import type { MessageKey } from './i18n/index.js';

/**
 * The keyboard map, shared by the cheat sheet, the settings list and the
 * handler itself, so the three cannot drift apart.
 *
 * `Ctrl+Alt+R` is bound in main.tsx before any user config is applied and is
 * deliberately not in this table: a theme must never be able to reach it
 * (hard rule 9).
 */
export interface Shortcut {
  id: string;
  /** Read through `t()` at render time, not stored translated (hard rule 1). */
  title: MessageKey;
  combo: string;
}

export const SHORTCUTS: Shortcut[] = [
  { id: 'search', title: 'shortcuts.search', combo: 'Ctrl+K' },
  { id: 'cheat', title: 'shortcuts.cheat', combo: '?' },
  { id: 'night', title: 'shortcuts.night', combo: 'Ctrl+Shift+D' },
  { id: 'chats', title: 'shortcuts.chats', combo: 'Ctrl+1' },
  { id: 'mail', title: 'shortcuts.mail', combo: 'Ctrl+2' },
  { id: 'music', title: 'shortcuts.music', combo: 'Ctrl+3' },
  { id: 'play', title: 'shortcuts.play', combo: 'Ctrl+Shift+P' },
  { id: 'next', title: 'shortcuts.next', combo: 'Ctrl+Shift+.' },
  { id: 'prev', title: 'shortcuts.prev', combo: 'Ctrl+Shift+,' },
  { id: 'settings', title: 'shortcuts.settings', combo: 'Ctrl+,' },
  { id: 'reset', title: 'shortcuts.reset', combo: 'Ctrl+Alt+R' },
];

/** Same shape as the prototype's comboOf: modifiers first, then the key. */
export function comboOf(event: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null;

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.shiftKey) parts.push('Shift');
  if (event.altKey) parts.push('Alt');

  let key = event.key;
  if (key === ' ') key = 'Space';
  if (key.length === 1) key = key.toUpperCase();

  parts.push(key);
  return parts.join('+');
}
