// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ChatListItem, ChatMemberView, Message, User } from '@bmf/shared';

/**
 * Names in a group.
 *
 * The prototype audit found that an incoming group message carried no author at
 * all, and that there was no member list to look one up in — a group of more
 * than two was unusable. These tests hold that shut: they render the real chat
 * screen over a seeded store and insist the name is on the bubble.
 */

const ME = 'a0000000-0000-4000-8000-000000000001';
const HER = 'a0000000-0000-4000-8000-000000000002';

vi.mock('../src/api/client.js', () => ({
  loadSession: () => ({ userId: ME, deviceId: 'd1' }),
  clearSession: vi.fn(),
  api: { search: vi.fn().mockResolvedValue({ items: [] }) },
}));

const { ChatInfo } = await import('../src/components/ChatInfo.js');
const { ChatView } = await import('../src/screens/Messenger.js');
const { useApp } = await import('../src/store/app.js');

function user(id: string, displayName: string): User {
  return {
    id,
    username: displayName.toLowerCase(),
    displayName,
    avatarUrl: null,
    statusId: 'on',
    statusText: null,
    statusAuto: false,
    showLastSeen: true,
    isPro: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const ROSTER: ChatMemberView[] = [
  { userId: ME, role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z', user: user(ME, 'Иван') },
  { userId: HER, role: 'member', joinedAt: '2026-01-02T00:00:00.000Z', user: user(HER, 'Мария') },
];

const GROUP: ChatListItem = {
  id: 'c1',
  type: 'group',
  title: 'Команда',
  peerId: null,
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

function message(id: string, senderId: string, body: string): Message {
  return {
    id,
    chatId: GROUP.id,
    senderId,
    clientMsgId: id,
    kind: 'text',
    body,
    envelope: null,
    meta: {},
    replyTo: null,
    forwardedFrom: null,
    reactions: {},
    scheduledAt: null,
    editedAt: null,
    createdAt: '2026-01-03T10:00:00.000Z',
  };
}

/** Seeds the store, and neuters the roster fetch so no test touches the network. */
function seed(patch: Partial<Parameters<typeof useApp.setState>[0]> = {}) {
  useApp.setState({
    user: user(ME, 'Иван'),
    chats: [GROUP],
    activeChatId: GROUP.id,
    messages: { [GROUP.id]: [message('m1', HER, 'Привет всем')] },
    members: { [GROUP.id]: ROSTER },
    presence: {},
    typing: {},
    privacy: {},
    plaintext: {},
    nextCursor: {},
    loadMembers: vi.fn(),
    ...patch,
  });
}

beforeEach(seed);
afterEach(cleanup);

describe('a message in a group', () => {
  it('carries the name of whoever wrote it', () => {
    render(<ChatView />);

    expect(screen.getByText('Мария')).toBeTruthy();
  });

  /** Your own bubble is on your side of the screen; a name over it is noise. */
  it('does not name you above your own message', () => {
    seed({ messages: { [GROUP.id]: [message('m1', ME, 'Моё сообщение')] } });
    render(<ChatView />);

    expect(screen.queryByText('Иван')).toBeNull();
  });

  /**
   * Colour is what makes a wall of names readable at a glance, and it is keyed
   * to the id rather than the name so that renaming somebody does not recolour
   * their entire history.
   */
  it('tints the name deterministically', () => {
    const { container } = render(<ChatView />);
    const first = container.querySelector('.m-from')?.getAttribute('style');

    cleanup();
    seed();
    const second = render(<ChatView />)
      .container.querySelector('.m-from')
      ?.getAttribute('style');

    expect(first).toBeTruthy();
    expect(first).toBe(second);
  });

  /** A DM has one other person in it; naming them over every bubble is clutter. */
  it('stays anonymous in a direct chat', () => {
    seed({
      chats: [{ ...GROUP, type: 'dm', title: 'Мария', peerId: HER }],
    });
    const { container } = render(<ChatView />);

    expect(container.querySelector('.m-from')).toBeNull();
  });

  /**
   * Somebody who left the group is no longer on the roster. Showing their raw
   * id would be worse than the anonymous bubble this whole change is fixing.
   */
  it('shows nothing rather than an id for a member who has left', () => {
    seed({ members: { [GROUP.id]: [ROSTER[0] as ChatMemberView] } });
    const { container } = render(<ChatView />);

    expect(container.querySelector('.m-from')).toBeNull();
    expect(screen.getByText('Привет всем')).toBeTruthy();
  });
});

describe('the chat header', () => {
  it('counts the people instead of saying "группа"', () => {
    render(<ChatView />);

    expect(screen.getByText('2 участника')).toBeTruthy();
  });

  it('counts who is online when anybody is', () => {
    seed({
      presence: {
        [HER]: { userId: HER, online: true, lastSeenAt: '2026-01-03T10:00:00.000Z' },
      },
    });
    render(<ChatView />);

    expect(screen.getByText('2 участника, 1 в сети')).toBeTruthy();
  });

  it('opens the chat-info panel when the title is clicked', () => {
    render(<ChatView />);

    fireEvent.click(screen.getByText('Команда'));

    // The panel repeats the title, so finding two of them means it opened.
    expect(screen.getAllByText('Команда').length).toBe(2);
    expect(screen.getByText('Участники')).toBeTruthy();
  });
});

describe('the chat-info panel', () => {
  it('lists every member with their role', () => {
    render(<ChatInfo chat={GROUP} onClose={vi.fn()} />);

    expect(screen.getByText('Иван (ты)')).toBeTruthy();
    expect(screen.getByText('Мария')).toBeTruthy();
    expect(screen.getByText('Участник')).toBeTruthy();
    expect(screen.getByText('админ')).toBeTruthy();
  });

  it('asks for the roster when it does not have one', () => {
    const loadMembers = vi.fn();
    seed({ members: {}, loadMembers });

    render(<ChatInfo chat={GROUP} onClose={vi.fn()} />);

    expect(loadMembers).toHaveBeenCalledWith(GROUP.id);
  });
});
