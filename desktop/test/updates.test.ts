import { describe, expect, it } from 'vitest';
import {
  acceptCandidate,
  blankMemory,
  compareVersions,
  readMemory,
  readReleases,
  reconcile,
  rememberPending,
  updateSupport,
} from '../electron/updates.js';

/**
 * The update path is the one part of the shell that runs unattended on someone
 * else's machine, so every decision it makes lives here rather than inside the
 * Electron plumbing where it could only be tested by shipping a release.
 */
describe('compareVersions', () => {
  it('orders release numbers', () => {
    expect(compareVersions('0.2.3', '0.2.4')).toBe(-1);
    expect(compareVersions('0.3.0', '0.2.9')).toBe(1);
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.2.3', '0.2.3')).toBe(0);
  });

  it('does not compare by string, where 0.2.10 loses to 0.2.9', () => {
    expect(compareVersions('0.2.9', '0.2.10')).toBe(-1);
  });

  it('ranks a release above its own pre-releases', () => {
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBe(1);
    expect(compareVersions('1.0.0-beta.1', '1.0.0-beta.2')).toBe(-1);
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.10')).toBe(-1);
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
  });

  it('tolerates a leading v and build metadata', () => {
    expect(compareVersions('v0.2.3', '0.2.3')).toBe(0);
    expect(compareVersions('0.2.3+build.7', '0.2.3')).toBe(0);
  });

  it('refuses to guess at anything that is not a version', () => {
    expect(compareVersions('0.2', '0.2.3')).toBeNull();
    expect(compareVersions('', '0.2.3')).toBeNull();
    expect(compareVersions('latest', '0.2.3')).toBeNull();
  });
});

describe('acceptCandidate', () => {
  const memory = blankMemory();

  it('takes a newer version', () => {
    expect(acceptCandidate('0.2.3', '0.2.4', memory)).toEqual({ accept: true });
  });

  /**
   * The failure this exists for: a release whose metadata names the version the
   * user is already running. Without the check the app downloads it, restarts,
   * finds the same version again and loops forever.
   */
  it('refuses the version already running', () => {
    expect(acceptCandidate('0.2.3', '0.2.3', memory)).toEqual({
      accept: false,
      reason: 'same',
    });
  });

  it('refuses a downgrade', () => {
    expect(acceptCandidate('0.2.3', '0.1.2', memory)).toEqual({
      accept: false,
      reason: 'older',
    });
  });

  it('refuses a version it cannot parse', () => {
    expect(acceptCandidate('0.2.3', 'nightly', memory)).toEqual({
      accept: false,
      reason: 'invalid',
    });
  });

  it('refuses a version that already failed to install', () => {
    const blocked = { pendingVersion: undefined, blockedVersions: ['0.2.4'] };
    expect(acceptCandidate('0.2.3', '0.2.4', blocked)).toEqual({
      accept: false,
      reason: 'blocked',
    });
  });

  it('still takes a newer version than the blocked one', () => {
    const blocked = { pendingVersion: undefined, blockedVersions: ['0.2.4'] };
    expect(acceptCandidate('0.2.3', '0.2.5', blocked)).toEqual({ accept: true });
  });

  /**
   * The beta channel (defect #12). A pre-release must reach the people who asked
   * for one and nobody else — the updater is told the same thing, but a setting
   * on a library is not where this decision should be provable.
   */
  it('keeps pre-releases away from the plain channel', () => {
    expect(acceptCandidate('0.3.1', '0.4.0-beta.1', memory)).toEqual({
      accept: false,
      reason: 'prerelease',
    });
  });

  it('offers a pre-release to a tester who joined the beta', () => {
    expect(acceptCandidate('0.3.1', '0.4.0-beta.1', memory, 'beta')).toEqual({ accept: true });
  });

  it('offers a plain release on the beta channel too', () => {
    expect(acceptCandidate('0.3.1', '0.3.2', memory, 'beta')).toEqual({ accept: true });
  });

  /** Leaving the beta must not drag anybody backwards from the build they have. */
  it('does not offer a release older than the beta already installed', () => {
    expect(acceptCandidate('0.4.0-beta.2', '0.4.0-beta.1', memory, 'beta')).toEqual({
      accept: false,
      reason: 'older',
    });
  });
});

describe('reconcile', () => {
  it('clears the note when the install worked', () => {
    const after = reconcile('0.2.4', { pendingVersion: '0.2.4', blockedVersions: [] });
    expect(after.memory).toEqual({ pendingVersion: undefined, blockedVersions: [] });
    expect(after.failed).toBeUndefined();
  });

  /**
   * A portable build restarts from the old executable, so the installer runs and
   * changes nothing. Blocking the version stops the app from offering the same
   * useless update on every launch.
   */
  it('blocks a version that installed and changed nothing', () => {
    const after = reconcile('0.2.3', { pendingVersion: '0.2.4', blockedVersions: [] });
    expect(after.failed).toBe('0.2.4');
    expect(after.memory.blockedVersions).toEqual(['0.2.4']);
    expect(after.memory.pendingVersion).toBeUndefined();
  });

  it('does not record the same failure twice', () => {
    const after = reconcile('0.2.3', {
      pendingVersion: '0.2.4',
      blockedVersions: ['0.2.4'],
    });
    expect(after.memory.blockedVersions).toEqual(['0.2.4']);
  });

  it('leaves a clean memory alone', () => {
    const after = reconcile('0.2.3', blankMemory());
    expect(after.memory).toEqual(blankMemory());
    expect(after.failed).toBeUndefined();
  });

  it('forgets blocked versions the running build has caught up with', () => {
    const after = reconcile('0.3.0', { pendingVersion: undefined, blockedVersions: ['0.2.4'] });
    expect(after.memory.blockedVersions).toEqual([]);
  });

  /**
   * Defect #14, and the reason it stayed on screen: 0.3.0 was handed to the
   * installer and never ran, then 0.3.1 was installed by hand. Coming back as a
   * *later* version is not a failed install — the old rule compared for equality
   * and so reported one, blocking a version nobody would be offered anyway and
   * leaving the warning up.
   */
  it('treats a later running version as a successful install', () => {
    const after = reconcile('0.3.1', { pendingVersion: '0.3.0', blockedVersions: [] });
    expect(after.failed).toBeUndefined();
    expect(after.memory.blockedVersions).toEqual([]);
    expect(after.memory.pendingVersion).toBeUndefined();
  });

  it('still blocks the version that left an older build running', () => {
    const after = reconcile('0.3.0', { pendingVersion: '0.3.1', blockedVersions: [] });
    expect(after.failed).toBe('0.3.1');
  });

  /** A memory that cannot be read is not evidence of a failure. */
  it('does not invent a failure from an unreadable pair', () => {
    const after = reconcile('nightly', { pendingVersion: '0.3.1', blockedVersions: [] });
    expect(after.failed).toBeUndefined();
  });
});

describe('readReleases', () => {
  const payload = [
    {
      tag_name: 'v0.3.1',
      name: '0.3.1',
      body: 'Исправляет запуск.',
      published_at: '2026-08-02T21:10:27Z',
      prerelease: false,
    },
    {
      tag_name: 'v0.4.0-beta.1',
      name: '0.4.0 beta',
      body: '',
      published_at: '2026-08-04T10:00:00Z',
      prerelease: true,
    },
    { tag_name: 'v0.2.8', name: '', body: 'Ремарки.', published_at: '', prerelease: false },
  ];

  it('reads the fields the panel shows', () => {
    const [first] = readReleases(payload);
    expect(first).toEqual({
      version: '0.4.0-beta.1',
      name: '0.4.0 beta',
      publishedAt: '2026-08-04T10:00:00Z',
      notes: '',
      prerelease: true,
    });
  });

  it('sorts newest first by version, not by the order it arrived in', () => {
    expect(readReleases(payload).map((r) => r.version)).toEqual([
      '0.4.0-beta.1',
      '0.3.1',
      '0.2.8',
    ]);
  });

  it('falls back to the version when a release has no name', () => {
    expect(readReleases(payload)[2]?.name).toBe('0.2.8');
  });

  /** A draft is visible only to whoever can see it, and must not be advertised. */
  it('drops drafts and anything it cannot make sense of', () => {
    const raw = [
      { tag_name: 'v0.9.0', draft: true },
      { tag_name: 'nightly' },
      null,
      'nonsense',
      { name: 'no tag at all' },
    ];
    expect(readReleases(raw)).toEqual([]);
  });

  it('survives a payload that is not a list', () => {
    expect(readReleases(null)).toEqual([]);
    expect(readReleases({ message: 'Not Found' })).toEqual([]);
  });
});

describe('rememberPending', () => {
  it('records what is about to be installed', () => {
    expect(rememberPending('0.2.4', blankMemory())).toEqual({
      pendingVersion: '0.2.4',
      blockedVersions: [],
    });
  });
});

describe('readMemory', () => {
  it('reads what it wrote', () => {
    const stored = { pendingVersion: '0.2.4', blockedVersions: ['0.2.2'] };
    expect(readMemory(stored)).toEqual(stored);
  });

  /**
   * The file sits in userData, where anything could have happened to it. A bad
   * read must never be the reason the app fails to start.
   */
  it('falls back to an empty memory on junk', () => {
    expect(readMemory(null)).toEqual(blankMemory());
    expect(readMemory('nonsense')).toEqual(blankMemory());
    expect(readMemory({ blockedVersions: 'not-an-array' })).toEqual(blankMemory());
    expect(readMemory({ pendingVersion: 42, blockedVersions: [] })).toEqual(blankMemory());
  });

  it('drops entries that are not versions', () => {
    expect(readMemory({ blockedVersions: ['0.2.4', 7, 'latest'] })).toEqual({
      pendingVersion: undefined,
      blockedVersions: ['0.2.4'],
    });
  });
});

describe('updateSupport', () => {
  it('accepts an installed Windows build', () => {
    expect(updateSupport({ platform: 'win32', packaged: true })).toEqual({ supported: true });
  });

  it('accepts an AppImage', () => {
    expect(
      updateSupport({ platform: 'linux', packaged: true, appImage: '/tmp/BMF.AppImage' }),
    ).toEqual({ supported: true });
  });

  it('rejects a portable Windows build, which cannot replace itself', () => {
    expect(
      updateSupport({ platform: 'win32', packaged: true, portableDir: 'C:\\Users\\x\\Desktop' }),
    ).toEqual({ supported: false, reason: 'portable' });
  });

  it('rejects a deb install, which belongs to the package manager', () => {
    expect(updateSupport({ platform: 'linux', packaged: true })).toEqual({
      supported: false,
      reason: 'deb',
    });
  });

  it('rejects a development run', () => {
    expect(updateSupport({ platform: 'win32', packaged: false })).toEqual({
      supported: false,
      reason: 'unpackaged',
    });
  });
});
