/**
 * The theme format itself: what a config may contain and how an untrusted one is
 * read. Deliberately free of DOM and React so the whitelist can be reasoned
 * about — and tested — on its own.
 *
 * Hard rule 9: a theme is data. Parsing is against a whitelist, unknown keys are
 * dropped rather than merged, and nothing here can reference anything outside
 * the config, so there is no place for behaviour to live.
 */
export type NavLayout = 'top' | 'rail' | 'bottom';

export interface ThemeConfig {
  mode: 'light' | 'dark';
  accent: string;
  /** 0.3–1, shown as a percentage by the slider. */
  opacity: number;
  /** Backdrop blur in pixels, 0–60. */
  blur: number;
  layout: NavLayout;
  /** Wallpaper seen through the translucent window; a `data:` image or nothing. */
  wallpaper: string | null;
  /** Background of the message list; a `data:` image or nothing. */
  chatBg: string | null;
  /** Section buttons the user keeps in the navigation. */
  sections: { mail: boolean; music: boolean; notes: boolean };
}

export const DEFAULT_THEME: ThemeConfig = {
  mode: 'light',
  accent: '#7c6cf8',
  opacity: 0.82,
  blur: 26,
  layout: 'bottom',
  wallpaper: null,
  chatBg: null,
  sections: { mail: true, music: true, notes: true },
};

/** The prototype's own swatches (ACCENTS in ui-prototype.html). */
export const ACCENTS = ['#7c6cf8', '#6366f1', '#06b6d4', '#ec4899', '#10b981', '#f59e0b'];

/** The keys worth sharing: settings, not this machine's wallpaper files. */
export const SHAREABLE = ['mode', 'accent', 'opacity', 'blur', 'layout', 'sections'] as const;

const LAYOUTS: NavLayout[] = ['top', 'rail', 'bottom'];

/**
 * An image reference is only ever a `data:` URL of a known raster type. Spec
 * section 8: a theme may not reach outside its own package, so an `http(s)`
 * value — or an `svg`, which can carry script — is dropped, not fetched.
 */
function imageOrNull(value: unknown): string | null {
  return typeof value === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(value)
    ? value
    : null;
}

/** Only these keys survive parsing; unknown ones are dropped, not merged. */
export function parseThemeConfig(raw: unknown): ThemeConfig {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_THEME;
  const input = raw as Record<string, unknown>;

  const accent =
    typeof input.accent === 'string' && /^#[0-9a-f]{6}$/i.test(input.accent)
      ? input.accent
      : DEFAULT_THEME.accent;

  const number = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : fallback;

  const sections = (input.sections ?? {}) as Record<string, unknown>;

  return {
    mode: input.mode === 'dark' ? 'dark' : 'light',
    accent,
    opacity: number(input.opacity, DEFAULT_THEME.opacity, 0.3, 1),
    blur: number(input.blur, DEFAULT_THEME.blur, 0, 60),
    layout: LAYOUTS.includes(input.layout as NavLayout)
      ? (input.layout as NavLayout)
      : DEFAULT_THEME.layout,
    wallpaper: imageOrNull(input.wallpaper),
    chatBg: imageOrNull(input.chatBg),
    sections: {
      mail: sections.mail !== false,
      music: sections.music !== false,
      notes: sections.notes !== false,
    },
  };
}
