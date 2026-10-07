// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Attachment, ChatListItem, Message } from '@bmf/shared';

/**
 * Pictures in a chat — defect #1, the one testers hit first.
 *
 * Sending an image used to produce a card with the word "Вложение" and a MIME
 * type on it. These check the two halves of the fix: an image is an image, and
 * anything else finally says what it is called and how big it is.
 */

const mediaBlob = vi.fn().mockResolvedValue(new Blob(['bytes'], { type: 'image/png' }));

vi.mock('../src/api/client.js', () => ({
  loadSession: () => ({ userId: 'u1', deviceId: 'd1' }),
  clearSession: vi.fn(),
  api: { search: vi.fn().mockResolvedValue({ items: [] }), mediaBlob },
}));

const { ChatView } = await import('../src/screens/Messenger.js');
const { useApp } = await import('../src/store/app.js');
const { forgetMedia } = await import('../src/media.js');

const CHAT: ChatListItem = {
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

const PICTURE: Attachment = {
  id: 'a1',
  name: 'схема.png',
  mime: 'image/png',
  size: 2048,
  width: 800,
  height: 600,
};

const DOCUMENT: Attachment = {
  id: 'a2',
  name: 'отчёт.pdf',
  mime: 'application/pdf',
  size: 3_500_000,
  width: null,
  height: null,
};

function withAttachment(file: Attachment, body = file.name): Message {
  return {
    id: 'm1',
    chatId: CHAT.id,
    senderId: 'u2',
    clientMsgId: 'm1',
    kind: 'text',
    body,
    envelope: null,
    meta: { attachments: [file] },
    replyTo: null,
    forwardedFrom: null,
    reactions: {},
    scheduledAt: null,
    editedAt: null,
    createdAt: '2026-01-03T10:00:00.000Z',
  };
}

function seed(message: Message) {
  useApp.setState({
    user: null,
    chats: [CHAT],
    activeChatId: CHAT.id,
    messages: { [CHAT.id]: [message] },
    members: {},
    presence: {},
    typing: {},
    privacy: {},
    plaintext: {},
    nextCursor: {},
  });
}

beforeEach(() => {
  mediaBlob.mockClear();
  forgetMedia();
  // jsdom has no blob URLs; the component only ever passes the string along.
  URL.createObjectURL = vi.fn(() => 'blob:fake-url');
  URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

describe('an image in a message', () => {
  it('renders as a picture rather than a file card', async () => {
    seed(withAttachment(PICTURE));
    const { container } = render(<ChatView />);

    await waitFor(() =>
      expect(container.querySelector('.m-img')?.getAttribute('src')).toBe('blob:fake-url'),
    );
    expect(container.querySelector('.m-file')).toBeNull();
  });

  /**
   * The bytes need an Authorization header, which `<img src>` cannot send, so
   * they are fetched and republished as a blob URL. If this stops happening the
   * picture silently becomes a broken-image icon.
   */
  it('fetches the bytes through the authorised client', async () => {
    seed(withAttachment(PICTURE));
    render(<ChatView />);

    await waitFor(() => expect(mediaBlob).toHaveBeenCalledWith(PICTURE.id));
  });

  /** The same picture twice in a chat is one download, not two. */
  it('does not re-download a picture it already holds', async () => {
    seed(withAttachment(PICTURE));
    const first = render(<ChatView />);
    await waitFor(() => expect(mediaBlob).toHaveBeenCalledTimes(1));

    first.unmount();
    seed(withAttachment(PICTURE));
    render(<ChatView />);

    await waitFor(() => expect(screen.getAllByRole('img').length).toBeGreaterThan(0));
    expect(mediaBlob).toHaveBeenCalledTimes(1);
  });

  /**
   * The client sends the file name as the body so the chat list has a preview.
   * Printing it in the bubble as well reads as a caption the sender never wrote.
   */
  it('does not repeat the file name as a caption', async () => {
    seed(withAttachment(PICTURE));
    render(<ChatView />);

    await waitFor(() => expect(mediaBlob).toHaveBeenCalled());
    expect(screen.queryByText(PICTURE.name)).toBeNull();
  });

  it('keeps a real caption', async () => {
    seed(withAttachment(PICTURE, 'посмотри на это'));
    render(<ChatView />);

    expect(screen.getByText('посмотри на это')).toBeTruthy();
  });

  it('opens the viewer when clicked', async () => {
    seed(withAttachment(PICTURE));
    const { container } = render(<ChatView />);

    await waitFor(() => expect(container.querySelector('.m-img')).toBeTruthy());
    fireEvent.click(container.querySelector('.m-img') as Element);

    expect(document.querySelector('.ann-ov')).toBeTruthy();
  });
});

describe('any other file', () => {
  it('says what it is called and how big it is', () => {
    seed(withAttachment(DOCUMENT));
    const { container } = render(<ChatView />);

    expect(screen.getByText('отчёт.pdf')).toBeTruthy();
    expect(screen.getByText('3.3 МБ')).toBeTruthy();
    // The badge, where the word "Вложение" used to be.
    expect(container.querySelector('.m-file-ico')?.textContent).toBe('PDF');
  });

  it('is not fetched until somebody asks for it', () => {
    seed(withAttachment(DOCUMENT));
    render(<ChatView />);

    expect(mediaBlob).not.toHaveBeenCalled();
  });
});
