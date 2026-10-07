// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@bmf/shared';

/**
 * Defect #2: the profile could not be edited at all. The name row worked, the
 * username button was disabled with a "not yet" tooltip, and the avatar was two
 * letters nobody could replace.
 */

const updateMe = vi.fn();
const setAvatar = vi.fn();
const clearAvatar = vi.fn();

class FakeApiError extends Error {
  constructor(readonly status: number) {
    super('failed');
  }
}

vi.mock('../src/api/client.js', () => ({
  loadSession: () => ({ userId: 'u1', deviceId: 'd1' }),
  clearSession: vi.fn(),
  ApiError: FakeApiError,
  api: {
    updateMe,
    setAvatar,
    clearAvatar,
    mediaBlob: vi.fn().mockResolvedValue(new Blob(['bytes'], { type: 'image/png' })),
  },
}));

const { Profile } = await import('../src/components/Profile.js');

const ME: User = {
  id: 'u1',
  username: 'ivan',
  displayName: 'Иван Петров',
  avatarUrl: null,
  statusId: 'on',
  statusText: null,
  statusAuto: false,
  showLastSeen: true,
  isPro: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  updateMe.mockReset().mockResolvedValue({ ...ME, username: 'petrov' });
  setAvatar.mockReset().mockResolvedValue({ ...ME, avatarUrl: 'a1' });
  clearAvatar.mockReset().mockResolvedValue(ME);
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

function open(user: User = ME) {
  return render(<Profile user={user} onClose={vi.fn()} onEditStatus={vi.fn()} />);
}

/** The row is found by its label, then the button next to it is the one to press. */
function rowButton(label: string): HTMLElement {
  const row = screen.getByText(label).closest('.sub-row');
  return row?.querySelector('.sub-btn') as HTMLElement;
}

describe('the username', () => {
  it('can be edited, where the button used to be disabled', () => {
    open();
    expect(rowButton('Юзернейм').hasAttribute('disabled')).toBe(false);
  });

  it('saves the new handle in lower case', async () => {
    open();
    fireEvent.click(rowButton('Юзернейм'));

    const input = screen.getByDisplayValue('ivan');
    fireEvent.change(input, { target: { value: 'Petrov' } });
    fireEvent.click(rowButton('Юзернейм'));

    await waitFor(() => expect(updateMe).toHaveBeenCalledWith({ username: 'petrov' }));
  });

  /**
   * A rejected rename puts the old handle back in the box rather than leaving
   * the one that was refused sitting there looking accepted.
   */
  it('restores the old handle when the new one is taken', async () => {
    updateMe.mockRejectedValue(new FakeApiError(409));
    open();

    fireEvent.click(rowButton('Юзернейм'));
    fireEvent.change(screen.getByDisplayValue('ivan'), { target: { value: 'taken' } });
    fireEvent.click(rowButton('Юзернейм'));

    await waitFor(() => expect(screen.getByDisplayValue('ivan')).toBeTruthy());
  });

  /** Pressing edit and then save without typing must not spend a request. */
  it('does not save a handle that did not change', async () => {
    open();
    fireEvent.click(rowButton('Юзернейм'));
    fireEvent.click(rowButton('Юзернейм'));

    // Back to reading, not editing.
    await waitFor(() => expect(screen.queryByDisplayValue('ivan')).toBeNull());
    expect(updateMe).not.toHaveBeenCalled();
  });
});

describe('the avatar', () => {
  it('uploads the picked file', async () => {
    open();
    // The panel lives in a portal, so the query starts from the document.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['bytes'], 'face.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(setAvatar).toHaveBeenCalledWith(file));
  });

  /** Nothing to remove until there is one — the row would be a dead button. */
  it('offers removal only once one is set', () => {
    open();
    expect(screen.queryByText('Аватар')).toBeNull();

    cleanup();
    open({ ...ME, avatarUrl: 'a1' });
    expect(screen.getByText('Аватар')).toBeTruthy();
  });

  it('removes it when asked', async () => {
    open({ ...ME, avatarUrl: 'a1' });

    fireEvent.click(rowButton('Аватар'));

    await waitFor(() => expect(clearAvatar).toHaveBeenCalled());
  });
});
