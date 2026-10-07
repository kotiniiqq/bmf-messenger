import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, parseThemeConfig } from '../src/theme-config.js';

/**
 * Hard rule 9: a theme is data read against a whitelist. These cases are the
 * rule written down — a config is a thing strangers hand you, and the parser is
 * the only place that decides what it is allowed to say.
 */
describe('parseThemeConfig', () => {
  it('keeps a well-formed config', () => {
    const config = parseThemeConfig({
      mode: 'dark',
      accent: '#10b981',
      opacity: 0.5,
      blur: 12,
      layout: 'rail',
      sections: { mail: false, music: true },
    });

    expect(config).toEqual({
      mode: 'dark',
      accent: '#10b981',
      opacity: 0.5,
      blur: 12,
      layout: 'rail',
      wallpaper: null,
      chatBg: null,
      sections: { mail: false, music: true, notes: true },
    });
  });

  it('drops keys it does not know instead of merging them', () => {
    const config = parseThemeConfig({
      accent: '#10b981',
      onLoad: 'alert(1)',
      script: 'https://example.com/theme.js',
      __proto__: { polluted: true },
    });

    expect(Object.keys(config).sort()).toEqual([
      'accent',
      'blur',
      'chatBg',
      'layout',
      'mode',
      'opacity',
      'sections',
      'wallpaper',
    ]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('refuses images that point outside the config', () => {
    for (const wallpaper of [
      'https://example.com/tracker.png',
      'http://example.com/tracker.png',
      '//example.com/tracker.png',
      'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Lz48L3N2Zz4=',
      'javascript:alert(1)',
    ]) {
      expect(parseThemeConfig({ wallpaper }).wallpaper).toBeNull();
    }
  });

  it('keeps an inline raster image', () => {
    const wallpaper = 'data:image/png;base64,iVBORw0KGgo=';
    expect(parseThemeConfig({ wallpaper }).wallpaper).toBe(wallpaper);
  });

  it('clamps numbers into the range the sliders offer', () => {
    expect(parseThemeConfig({ opacity: 9, blur: 9000 })).toMatchObject({
      opacity: 1,
      blur: 60,
    });
    expect(parseThemeConfig({ opacity: -3, blur: -3 })).toMatchObject({
      opacity: 0.3,
      blur: 0,
    });
  });

  it('falls back on values of the wrong shape', () => {
    expect(
      parseThemeConfig({
        mode: 'neon',
        accent: 'red',
        opacity: '0.5',
        blur: null,
        layout: 'floating',
      }),
    ).toEqual(DEFAULT_THEME);
  });

  it('treats anything that is not an object as no config at all', () => {
    for (const raw of [null, undefined, 'theme', 42, true]) {
      expect(parseThemeConfig(raw)).toEqual(DEFAULT_THEME);
    }
  });
});
