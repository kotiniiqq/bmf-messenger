// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { Attachment, ChatListItem, User } from '@bmf/shared';

/**
 * Defect #24: nothing about the person you were talking to was reachable — not
 * their picture, not when they were last online, not the photos you had
 * exchanged. This is that screen.
 */

const chatMedia = vi.fn();

vi.mock('../src/api/client.js', () => ({
  loadSession: () => ({ userId: 'u1', deviceId: 'd1' }),
  clearSession: vi.fn(),
  api: {
    chatMedia,
    mediaBlob: vi.fn().mockResolvedValue(new Blob(['bytes'], { type: 'image/png' })),
  },
}));

const { UserProfile } = await import('../src/components/UserProfile.js');
const { useApp } = await import('../src/store/app.js');

const PEER: User = {
  id: 'u2',
  username: 'maria',
  displayName: 'Мария',
  avatarUrl: null,
  statusId: 'on',
  statusText: null,
  statusAuto: false,
  showLastSeen: true,
  isPro: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const CHAT: ChatListItem = {
  id: 'c1',
  type: 'dm',
  title: 'Мария',
  peerId: PEER.id,
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

const PHOTO: Attachment = {
  id: 'a1',
  name: 'снимок.png',
  mime: 'image/png',
  size: 1024,
  width: 100,
  height: 100,
};

/** An hour ago: recent enough to be interesting, old enough to be a time. */
const HOUR_AGO = new Date(Date.now() - 65 * 60_000).toISOString();

beforeEach(() => {
  chatMedia.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  useApp.setState({ presence: {}, messages: {}, chats: [CHAT] });
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

const open = (user = PEER, chat: ChatListItem | null = CHAT) =>
  render(<UserProfile user={user} chat={chat} onClose={vi.fn()} />);

describe('somebody else’s profile', () => {
  it('shows the name and the handle', () => {
    open();

    expect(screen.getByText('Мария')).toBeTruthy();
    expect(screen.getByText('@maria')).toBeTruthy();
  });

  it('says when they were last online', () => {
    useApp.setState({ presence: { u2: { userId: 'u2', online: false, lastSeenAt: HOUR_AGO, statusId: null } } });
    open();

    expect(screen.getByText('был(а) сегодня')).toBeTruthy();
  });

  /**
   * The server already withholds the timestamp from someone who switched the
   * setting off; the screen must not invent one from a stale value either.
   */
  it('says nothing about the time when the person hid it', () => {
    useApp.setState({ presence: { u2: { userId: 'u2', online: false, lastSeenAt: HOUR_AGO, statusId: null } } });
    open({ ...PEER, showLastSeen: false });

    expect(screen.getByText('не в сети')).toBeTruthy();
    expect(screen.queryByText('был(а) сегодня')).toBeNull();
  });

  it('asks the server for the shared pictures', async () => {
    open();
    await waitFor(() => expect(chatMedia).toHaveBeenCalledWith(CHAT.id));
  });

  it('counts the pictures and draws a tile for each', async () => {
    chatMedia.mockResolvedValue({ items: [PHOTO, { ...PHOTO, id: 'a2' }], nextCursor: null });
    open();

    await waitFor(() => expect(screen.getByText('Фотографии · 2')).toBeTruthy());
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('says so plainly when there are none', async () => {
    open();
    await waitFor(() => expect(screen.getByText('Общих фотографий пока нет')).toBeTruthy());
  });

  /** Opened from a place with no chat behind it, there is nothing to gallery. */
  it('asks for no gallery without a chat', () => {
    open(PEER, null);
    expect(chatMedia).not.toHaveBeenCalled();
  });
});
