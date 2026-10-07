import { useState } from 'react';
import { exportTheme, importTheme, patchTheme, type ThemeConfig } from '../theme.js';
import { t, type MessageKey } from '../i18n/index.js';
import { LeftPanel } from './LeftPanel.js';
import { toast } from './Toast.js';

/**
 * The prototype's `lpMode === 'market'`. A theme is a config, not code — there
 * is nowhere in the format for behaviour to live, which is why applying one
 * needs no permission screen and a plugin does (spec section 8).
 */
interface MarketTheme {
  name: string;
  author: string;
  downloads: string;
  background: string;
  accent: string;
  bubble: string;
  dots: string[];
  config: Pick<ThemeConfig, 'mode' | 'accent'>;
}

const THEMES: MarketTheme[] = [
  {
    name: 'Aurora',
    author: '@bmf.team',
    downloads: '12.4k',
    background: 'linear-gradient(135deg,#101233,#071a2e)',
    accent: '#7c6cf8',
    bubble: 'rgba(255,255,255,.16)',
    dots: ['#7c6cf8', '#06b6d4', '#ec4899'],
    config: { mode: 'dark', accent: '#7c6cf8' },
  },
  {
    name: 'Mint',
    author: '@kir',
    downloads: '5.1k',
    background: 'linear-gradient(135deg,#0d1f1b,#08302a)',
    accent: '#10b981',
    bubble: 'rgba(255,255,255,.14)',
    dots: ['#10b981', '#34d399', '#065f46'],
    config: { mode: 'dark', accent: '#10b981' },
  },
  {
    name: 'Sakura',
    author: '@nastya',
    downloads: '4.3k',
    background: 'linear-gradient(135deg,#fdf0f4,#f7dfe8)',
    accent: '#ec4899',
    bubble: 'rgba(0,0,0,.08)',
    dots: ['#ec4899', '#f472b6', '#831843'],
    config: { mode: 'light', accent: '#ec4899' },
  },
  {
    name: 'Deep Ocean',
    author: '@denis.dev',
    downloads: '3.8k',
    background: 'linear-gradient(135deg,#04121f,#062a3d)',
    accent: '#06b6d4',
    bubble: 'rgba(255,255,255,.13)',
    dots: ['#06b6d4', '#0891b2', '#164e63'],
    config: { mode: 'dark', accent: '#06b6d4' },
  },
  {
    name: 'Amber',
    author: '@maria.s',
    downloads: '2.6k',
    background: 'linear-gradient(135deg,#1c1408,#2b1d09)',
    accent: '#f59e0b',
    bubble: 'rgba(255,255,255,.13)',
    dots: ['#f59e0b', '#fbbf24', '#78350f'],
    config: { mode: 'dark', accent: '#f59e0b' },
  },
  {
    name: 'Indigo',
    author: '@bmf.team',
    downloads: '1.9k',
    background: 'linear-gradient(135deg,#12132b,#1b1240)',
    accent: '#6366f1',
    bubble: 'rgba(255,255,255,.15)',
    dots: ['#6366f1', '#818cf8', '#312e81'],
    config: { mode: 'dark', accent: '#6366f1' },
  },
];

const SKINS: { icon: string; name: string; author: string; about: MessageKey }[] = [
  { icon: '⬛', name: 'Square', author: '@kir', about: 'market.skin.square' },
  { icon: '🫧', name: 'Bubble', author: '@nastya', about: 'market.skin.bubble' },
  { icon: '📐', name: 'Compact', author: '@denis.dev', about: 'market.skin.compact' },
  { icon: '🎈', name: 'Playful', author: '@maria.s', about: 'market.skin.playful' },
];

const PLUGINS: { icon: string; name: MessageKey; author: string; network: boolean }[] = [
  { icon: '📓', name: 'market.plugin.notion', author: '@bmf.team', network: true },
  { icon: '✅', name: 'market.plugin.todoist', author: '@kir', network: true },
  { icon: '🔤', name: 'market.plugin.wordCount', author: '@nastya', network: false },
  { icon: '🌐', name: 'market.plugin.translate', author: '@denis.dev', network: true },
];

const TABS = [
  { key: 'themes', title: 'market.tabThemes' },
  { key: 'skins', title: 'market.tabSkins' },
  { key: 'plugins', title: 'market.tabPlugins' },
] as const;

type Tab = (typeof TABS)[number]['key'];

export function Market({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('themes');
  const [permissionsFor, setPermissionsFor] = useState<string | null>(null);

  if (permissionsFor) {
    return (
      <LeftPanel
        title={t('market.permsTitle')}
        onClose={onClose}
        onBack={() => setPermissionsFor(null)}
        footer={{
          label: t('market.permsInstall'),
          enabled: false,
          onClick: () => undefined,
        }}
      >
        <div className="ct-sub" style={{ padding: '0 4px 10px' }}>
          <b style={{ color: 'var(--txt)' }}>{permissionsFor}</b> {t('market.permsAsks')}
        </div>
        <div className="sub-row">
          <div>
            <div className="sub-row-label">{t('market.permMessage')}</div>
            <div className="sub-row-desc">{t('market.permMessageHint')}</div>
          </div>
          <span className="mf-count">{t('market.permsNeeded')}</span>
        </div>
        <div className="sub-row">
          <div>
            <div className="sub-row-label">{t('market.permNetwork')}</div>
            <div className="sub-row-desc">{t('market.permNetworkHint')}</div>
          </div>
          <span className="mf-count">{t('market.permsNeeded')}</span>
        </div>
        <div className="sp-div" />
        <div style={{ fontSize: 12.5, lineHeight: 1.75, color: 'var(--txt2)', padding: '2px 4px' }}>
          {t('market.permsDeniedBefore')}
          <b style={{ color: 'var(--txt)' }}>{t('market.permsDeniedBold')}</b>
          {t('market.permsDeniedAfter')}
          <br />
          <br />
          {t('market.permsStage')}
        </div>
      </LeftPanel>
    );
  }

  const tabs = (
    <div className="chip-row" style={{ paddingBottom: 8 }}>
      {TABS.map((item) => (
        <button
          key={item.key}
          className={`chip${tab === item.key ? ' on' : ''}`}
          onClick={() => setTab(item.key)}
        >
          {t(item.title)}
        </button>
      ))}
    </div>
  );

  if (tab === 'skins') {
    return (
      <LeftPanel title={t('market.title')} onClose={onClose}>
        {tabs}
        <div className="ct-sub" style={{ padding: '0 4px 10px' }}>
          {t('market.skinsHint')}
        </div>
        {SKINS.map((skin) => (
          <div className="pack" key={skin.name}>
            <div className="pack-prev" style={{ fontSize: 19 }}>
              {skin.icon}
            </div>
            <div className="pack-mid">
              <div className="pack-n">{skin.name}</div>
              <div className="pack-x">
                {skin.author} · {t(skin.about)}
              </div>
            </div>
            <button className="sub-btn" disabled title={t('market.stage5')}>
              {t('market.apply')}
            </button>
          </div>
        ))}
        <div className="sp-div" />
        <div
          className="pro-card"
          style={{ background: 'linear-gradient(135deg,rgba(34,197,94,.14),rgba(6,182,212,.12))' }}
        >
          <div className="pro-card-t">
            <svg viewBox="0 0 24 24" style={{ stroke: '#22c55e' }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            {t('market.offlineTitle')}
          </div>
          <div className="pro-card-x">{t('market.offlineHint')}</div>
        </div>
      </LeftPanel>
    );
  }

  if (tab === 'plugins') {
    return (
      <LeftPanel title={t('market.title')} onClose={onClose}>
        {tabs}
        <div className="ct-sub" style={{ padding: '0 4px 10px' }}>
          {t('market.pluginsHint')}
        </div>
        {PLUGINS.map((plugin) => (
          <div className="pack" key={plugin.name}>
            <div className="pack-prev" style={{ fontSize: 19 }}>
              {plugin.icon}
            </div>
            <div className="pack-mid">
              <div className="pack-n">{t(plugin.name)}</div>
              <div className="pack-x">
                {plugin.author} ·{' '}
                {plugin.network ? t('market.pluginNetwork') : t('market.pluginOffline')}
              </div>
            </div>
            <button className="sub-btn" onClick={() => setPermissionsFor(t(plugin.name))}>
              {t('market.install')}
            </button>
          </div>
        ))}
      </LeftPanel>
    );
  }

  return (
    <LeftPanel title={t('market.title')} onClose={onClose}>
      {tabs}
      <div className="ct-sub" style={{ padding: '0 4px 10px' }}>
        {t('market.themesHint')}
      </div>

      <div className="mk-grid">
        {THEMES.map((theme) => (
          <div
            className="mk-card"
            key={theme.name}
            onClick={() => {
              patchTheme(theme.config);
              toast(t('market.themeApplied', { name: theme.name }));
            }}
          >
            <div className="mk-prev" style={{ background: theme.background }}>
              <div className="mk-bubble" style={{ background: theme.accent }} />
              <div className="mk-bubble b2" style={{ background: theme.bubble }} />
              <div className="mk-prev-b">
                {theme.dots.map((dot) => (
                  <span className="mk-dot" key={dot} style={{ background: dot }} />
                ))}
              </div>
            </div>
            <div className="mk-meta">
              <div className="mk-n">{theme.name}</div>
              <div className="mk-a">
                <svg viewBox="0 0 24 24">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
                {theme.author} · {theme.downloads}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="sp-div" />

      <div className="rescue">
        <svg viewBox="0 0 24 24">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div>
          <b>{t('market.brokeTitle')}</b>
          <br />
          {t('market.brokeBefore')}
          <span className="kbd">Ctrl</span>
          <span className="kbd">Alt</span>
          <span className="kbd">R</span>
          {t('market.brokeAfter')}
        </div>
      </div>

      <div className="sub-row">
        <div>
          <div className="sub-row-label">{t('market.importTitle')}</div>
          <div className="sub-row-desc">{t('market.importHint')}</div>
        </div>
        <button
          className="sub-btn"
          onClick={() => {
            void navigator.clipboard
              ?.readText()
              .then((text) =>
                toast(importTheme(text) ? t('market.imported') : t('market.importEmpty')),
              )
              .catch(() => toast(t('market.clipboardDenied')));
          }}
        >
          {t('market.importAction')}
        </button>
      </div>

      <div className="sub-row">
        <div>
          <div className="sub-row-label">{t('market.exportTitle')}</div>
          <div className="sub-row-desc">{t('market.exportHint')}</div>
        </div>
        <button
          className="sub-btn"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(exportTheme())
              .then(() => toast(t('market.exported')))
              .catch(() => toast(t('common.copyUnavailable')));
          }}
        >
          {t('market.exportAction')}
        </button>
      </div>
    </LeftPanel>
  );
}
