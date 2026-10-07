// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ChatListItem } from '@bmf/shared';

/**
 * Deleting a chat from the list.
 *
 * The dangerous half is that clearing a direct chat cannot be undone from
 * anywhere, so these check the two guards around it: the menu does not act by
 * itself, and the confirmation says which of the two things will happen.
 */

const removeChat = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/api/client.js', () => ({
  loadSession: () => ({ userId: 'u1', deviceId: 'd1' }),
  clearSession: vi.fn(),
  api: { search: vi.fn().mockResolvedValue({ items: [] }) },
}));

const { ChatsSidebar } = await import('../src/screens/Messenger.js');
const { useApp } = await import('../src/store/app.js');

const DM: ChatListItem = {
  id: 'c1',
  type: 'dm',
  title: 'Мария',
  peerId: 'u2',
  avatarUrl: null,
  accent: null,
  isE2E: false,
  description: '',
  unreadCount: 0,
  pinnedMessageIds: [],
  folder: null,
  isLater: false,
  draft: null,
  updatedAt: '2026-01-03T00:00:00.000Z',
  lastMessage: null,
};

const GROUP: ChatListItem = { ...DM, id: 'c2', type: 'group', title: 'Команда', peerId: null };

function seed(chats: ChatListItem[]) {
  useApp.setState({
    chats,
    activeChatId: null,
    messages: {},
    members: {},
    presence: {},
    typing: {},
    removeChat,
  });
}

beforeEach(() => {
  removeChat.mockClear();
  seed([DM]);
});
afterEach(cleanup);

/** Right-click the row, then click the only item in the menu that appears. */
function openMenuOn(title: string) {
  fireEvent.contextMenu(screen.getByText(title));
}

describe('the chat list context menu', () => {
  it('offers deleting the chat under the right mouse button', () => {
    render(<ChatsSidebar />);
    expect(screen.queryByText('Удалить чат')).toBeNull();

    openMenuOn('Мария');

    expect(screen.getByText('Удалить чат')).toBeTruthy();
  });

  /** Leaving is what deletion means for a room, and the wording has to say so. */
  it('calls it leaving, for a group', () => {
    seed([GROUP]);
    render(<ChatsSidebar />);

    openMenuOn('Команда');

    expect(screen.getByText('Выйти и удалить')).toBeTruthy();
  });

  it('asks before doing anything', () => {
    render(<ChatsSidebar />);
    openMenuOn('Мария');

    fireEvent.click(screen.getByText('Удалить чат'));

    expect(screen.getByText('Удалить чат?')).toBeTruthy();
    expect(removeChat).not.toHaveBeenCalled();
  });

  it('deletes once the confirmation is answered', () => {
    render(<ChatsSidebar />);
    openMenuOn('Мария');
    fireEvent.click(screen.getByText('Удалить чат'));

    // The panel's call-to-action, not the menu item that opened it.
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(removeChat).toHaveBeenCalledWith(DM.id);
  });

  /**
   * The two outcomes differ in a way the user cannot take back, so the
   * confirmation spells out which one they are getting.
   */
  it('explains that the other side keeps their copy', () => {
    render(<ChatsSidebar />);
    openMenuOn('Мария');
    fireEvent.click(screen.getByText('Удалить чат'));

    expect(screen.getByText(/копия останется/)).toBeTruthy();
  });

  it('explains that a group keeps what you wrote in it', () => {
    seed([GROUP]);
    render(<ChatsSidebar />);
    openMenuOn('Команда');
    fireEvent.click(screen.getByText('Выйти и удалить'));

    expect(screen.getByText(/останется у остальных участников/)).toBeTruthy();
  });
});
