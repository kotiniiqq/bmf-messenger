// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { User } from '@bmf/shared';
import { CheatSheet } from '../src/components/CheatSheet.js';
import { Drawer, type DrawerAction } from '../src/components/Drawer.js';
import { Nav } from '../src/components/Nav.js';
import { WindowControls } from '../src/components/WindowControls.js';
import { t } from '../src/i18n/index.js';
import { SHORTCUTS } from '../src/shortcuts.js';

/**
 * Smoke tests for the shell.
 *
 * Half of the defects found by hand on 0.3.1 were "the button does nothing":
 * a control that renders and is wired to no handler. That is invisible in
 * review and obvious to a test, so these assert the wiring rather than the
 * looks — every control is clicked, and the callback behind it has to fire.
 *
 * They deliberately cover the presentational shell, which needs no server: the
 * screens that talk to the API are worth testing too, but not at the price of
 * a mock that drifts from the real client.
 */

afterEach(cleanup);

const USER: User = {
  id: 'u1',
  username: 'ivan',
  displayName: 'Иван Петров',
  statusId: 'on',
  statusText: null,
  statusAuto: false,
} as User;

describe('Drawer', () => {
  /** Every row in the menu, and the action it is supposed to raise. */
  const ROWS: [string, DrawerAction][] = [
    [t('drawer.profile'), 'profile'],
    [t('drawer.contacts'), 'contacts'],
    [t('drawer.calls'), 'calls'],
    [t('drawer.newGroup'), 'group'],
    [t('drawer.newChannel'), 'channel'],
    [t('drawer.updates'), 'updates'],
    [t('drawer.settings'), 'settings'],
  ];

  it.each(ROWS)('«%s» raises its action and closes the drawer', (label, action) => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    render(<Drawer user={USER} onClose={onClose} onAction={onAction} />);

    fireEvent.click(screen.getByText(label));

    expect(onAction).toHaveBeenCalledWith(action);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the display name and the username', () => {
    render(<Drawer user={USER} onClose={vi.fn()} onAction={vi.fn()} />);

    expect(screen.getByText(USER.displayName)).toBeTruthy();
    expect(screen.getByText(`@${USER.username}`)).toBeTruthy();
  });
});

describe('Nav', () => {
  const props = {
    place: 'rail' as const,
    section: 'chats' as const,
    onSelect: vi.fn(),
    onMenu: vi.fn(),
    onProfile: vi.fn(),
    visible: { mail: true, music: true, notes: true },
    badges: {},
    initial: 'И',
  };

  it('selects a section when its button is clicked', () => {
    const onSelect = vi.fn();
    render(<Nav {...props} onSelect={onSelect} />);

    fireEvent.click(screen.getByTitle(t('nav.mail')));

    expect(onSelect).toHaveBeenCalledWith('mail');
  });

  it('opens the menu and the profile', () => {
    const onMenu = vi.fn();
    const onProfile = vi.fn();
    render(<Nav {...props} onMenu={onMenu} onProfile={onProfile} />);

    fireEvent.click(screen.getByTitle(t('nav.menu')));
    fireEvent.click(screen.getByTitle(t('nav.profile')));

    expect(onMenu).toHaveBeenCalled();
    expect(onProfile).toHaveBeenCalled();
  });

  /**
   * A section switched off in the appearance settings must not leave its button
   * behind — the button is the only way into a section, so a stale one is a
   * dead control.
   */
  it('hides a section the user switched off', () => {
    render(<Nav {...props} visible={{ mail: false, music: true, notes: true }} />);

    expect(screen.queryByTitle(t('nav.mail'))).toBeNull();
    expect(screen.queryByTitle(t('nav.music'))).toBeTruthy();
  });

  it('draws an unread badge only when there is something unread', () => {
    const { rerender } = render(<Nav {...props} badges={{ chats: 3 }} />);
    expect(screen.getByText('3')).toBeTruthy();

    rerender(<Nav {...props} badges={{ chats: 0 }} />);
    expect(screen.queryByText('0')).toBeNull();
  });
});

describe('WindowControls', () => {
  afterEach(() => {
    delete (window as { bmf?: unknown }).bmf;
  });

  it('drives the three window buttons', () => {
    const shell = {
      minimizeWindow: vi.fn(),
      toggleMaximizeWindow: vi.fn(),
      closeWindow: vi.fn(),
    };
    (window as { bmf?: unknown }).bmf = shell;

    render(<WindowControls />);

    fireEvent.click(screen.getByTitle(t('window.minimise')));
    fireEvent.click(screen.getByTitle(t('window.maximise')));
    fireEvent.click(screen.getByTitle(t('window.tray')));

    expect(shell.minimizeWindow).toHaveBeenCalled();
    expect(shell.toggleMaximizeWindow).toHaveBeenCalled();
    expect(shell.closeWindow).toHaveBeenCalled();
  });

  /** In a browser there is no window to drive; three dead circles read as broken. */
  it('renders nothing without the Electron shell', () => {
    const { container } = render(<WindowControls />);
    expect(container.firstChild).toBeNull();
  });
});

describe('CheatSheet', () => {
  it('lists every shortcut the app actually binds', () => {
    render(<CheatSheet onClose={vi.fn()} />);

    for (const shortcut of SHORTCUTS) {
      expect(screen.getByText(t(shortcut.title))).toBeTruthy();
    }
  });
});
