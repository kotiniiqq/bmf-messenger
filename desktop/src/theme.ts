import { useSyncExternalStore } from 'react';
import {
  DEFAULT_THEME,
  SHAREABLE,
  parseThemeConfig,
  type ThemeConfig,
} from './theme-config.js';

/**
 * Applying the theme config to the document, and holding the current one.
 * The format itself — what a config may contain, how an untrusted one is read —
 * lives in `theme-config.ts`.
 */
export { ACCENTS, DEFAULT_THEME } from './theme-config.js';
export type { NavLayout, ThemeConfig } from './theme-config.js';

const STORAGE_KEY = 'bmf.theme';

export function loadTheme(): ThemeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseThemeConfig(JSON.parse(raw)) : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Writes the config onto the document. Dark mode is `body.dk`, the switch
 * prototype.css itself is built around — overriding the variables by hand would
 * mean maintaining a second copy of the palette.
 */
export function applyTheme(theme: ThemeConfig): void {
  const root = document.documentElement;

  root.style.setProperty('--op', String(theme.opacity));
  root.style.setProperty('--blur', `${theme.blur}px`);

  if (theme.accent === DEFAULT_THEME.accent) {
    // The stylesheet's own accent, including its per-mode --act alpha.
    root.style.removeProperty('--acc');
    root.style.removeProperty('--act');
  } else {
    const [r, g, b] = hexToRgb(theme.accent);
    root.style.setProperty('--acc', theme.accent);
    root.style.setProperty('--act', `rgba(${r},${g},${b},0.16)`);
  }

  document.body.classList.toggle('dk', theme.mode === 'dark');
  // Overrides the stylesheet's `--wall` gradient, the way the prototype's
  // applyWall() does; clearing it hands the gradient back.
  document.body.style.background = theme.wallpaper
    ? `url('${theme.wallpaper}') center/cover fixed`
    : '';

  root.dataset.theme = theme.mode;
}

// ── store ──────────────────────────────────────────────────────────────────
// Small enough not to need Zustand, and it has to be readable from main.tsx
// before React mounts so the window never paints the wrong colours.

let current = loadTheme();
const listeners = new Set<() => void>();
const resetListeners = new Set<() => void>();

function publish(next: ThemeConfig): void {
  current = next;
  applyTheme(next);
  for (const listener of listeners) listener();
}

export function getTheme(): ThemeConfig {
  return current;
}

/**
 * Applies the change and reports whether it survived a restart. A wallpaper is
 * stored inline, so a large one can overflow the storage quota — it still
 * applies, and the caller says so rather than letting it vanish silently.
 */
export function patchTheme(patch: Partial<ThemeConfig>): boolean {
  const next = parseThemeConfig({ ...current, ...patch });
  publish(next);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** Lets the banner react to a reset that came from the global shortcut. */
export function onThemeReset(listener: () => void): () => void {
  resetListeners.add(listener);
  return () => {
    resetListeners.delete(listener);
  };
}

export function resetTheme(): void {
  localStorage.removeItem(STORAGE_KEY);
  publish(DEFAULT_THEME);
  for (const listener of resetListeners) listener();
}

export function exportTheme(): string {
  const shareable = Object.fromEntries(SHAREABLE.map((key) => [key, current[key]]));
  return JSON.stringify(shareable, null, 2);
}

/**
 * Reads a config someone else exported. Everything goes through the same
 * whitelist as stored config, so an unknown key is dropped rather than trusted
 * (hard rule 9) — and images keep whatever is set locally.
 */
export function importTheme(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }

  if (typeof parsed !== 'object' || parsed === null) return false;

  const incoming = parsed as Record<string, unknown>;
  if (!SHAREABLE.some((key) => key in incoming)) return false;

  patchTheme(
    parseThemeConfig({
      ...current,
      ...incoming,
      wallpaper: current.wallpaper,
      chatBg: current.chatBg,
    }),
  );
  return true;
}

export function useTheme(): ThemeConfig {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getTheme,
    () => DEFAULT_THEME,
  );
}
