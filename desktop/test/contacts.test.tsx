// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Contact, User } from '@bmf/shared';

/**
 * Defect #25: a person could be added to contacts only from the panel that is
 * the one place you are not while talking to them, and there was no way to
 * write your own name for anybody.
 *
 * What matters here is that the name follows the person: writing it in one
 * screen and seeing their handle in another would be two names for one человек.
 */

const saveContact = vi.fn();
const removeContact = vi.fn();

vi.mock('../src/api/client.js', () => ({
  loadSession: () => ({ userId: 'u1', deviceId: 'd1' }),
  clearSession: vi.fn(),
  api: {
    chatMedia: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    mediaBlob: vi.fn().mockResolvedValue(new Blob(['bytes'], { type: 'image/png' })),
    saveContact,
    removeContact,
  },
}));

const { UserProfile } = await import('../src/components/UserProfile.js');
const { useApp } = await import('../src/store/app.js');
const { nameFor, titleFor } = await import('../src/contacts.js');

const PEER: User = {
  id: 'u2',
  username: 'maria',
  displayName: 'Мария Иванова',
  avatarUrl: null,
  statusId: 'on',
  statusText: null,
  statusAuto: false,
  showLastSeen: true,
  isPro: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const CONTACT: Contact = {
  user: PEER,
  localName: 'Маша с курса',
  addedAt: '2026-02-01T00:00:00.000Z',
};

beforeEach(() => {
  saveContact.mockReset().mockResolvedValue(CONTACT);
  removeContact.mockReset().mockResolvedValue(undefined);
  useApp.setState({ presence: {}, messages: {}, chats: [], contacts: {} });
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

describe('the name resolver', () => {
  it('prefers the name this account wrote', () => {
    expect(nameFor(PEER, { u2: CONTACT })).toBe('Маша с курса');
  });

  it('falls back to the name they chose, then to their handle', () => {
    expect(nameFor(PEER, {})).toBe('Мария Иванова');
    expect(nameFor({ ...PEER, displayName: '' }, {})).toBe('maria');
  });

  /** A blank local name is not a name; it must not blank out the row. */
  it('ignores a local name that is only spaces', () => {
    expect(nameFor(PEER, { u2: { ...CONTACT, localName: '   ' } })).toBe('Мария Иванова');
  });

  it('renames a direct chat and leaves a group alone', () => {
    const dm = { id: 'c1', type: 'dm', title: 'Мария Иванова', peerId: 'u2' } as never;
    const group = { id: 'c2', type: 'group', title: 'Команда', peerId: null } as never;

    expect(titleFor(dm, { u2: CONTACT })).toBe('Маша с курса');
    expect(titleFor(group, { u2: CONTACT })).toBe('Команда');
  });
});

describe('adding somebody from the conversation', () => {
  it('offers to add a person who is not a contact yet', () => {
    render(<UserProfile user={PEER} chat={null} onClose={vi.fn()} />);

    expect(screen.getByText('Добавить в контакты')).toBeTruthy();
    expect(screen.queryByText('Убрать из контактов')).toBeNull();
  });

  it('saves the name that was typed', async () => {
    render(<UserProfile user={PEER} chat={null} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Добавить в контакты'));
    fireEvent.change(screen.getByPlaceholderText('Мария Иванова'), {
      target: { value: 'Маша с курса' },
    });
    fireEvent.click(screen.getByText('Сохранить'));

    await waitFor(() => expect(saveContact).toHaveBeenCalledWith('u2', 'Маша с курса'));
  });

  it('shows the local name over the one they chose, not instead of it', () => {
    useApp.setState({ contacts: { u2: CONTACT } });
    render(<UserProfile user={PEER} chat={null} onClose={vi.fn()} />);

    expect(screen.getByText('Маша с курса')).toBeTruthy();
    expect(screen.getByText('Мария Иванова')).toBeTruthy();
    expect(screen.getByText('Изменить имя')).toBeTruthy();
  });

  it('removes a contact when asked', async () => {
    useApp.setState({ contacts: { u2: CONTACT } });
    render(<UserProfile user={PEER} chat={null} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Убрать из контактов'));

    await waitFor(() => expect(removeContact).toHaveBeenCalledWith('u2'));
  });
});
