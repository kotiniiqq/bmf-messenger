/**
 * Everything the updater decides, kept free of Electron so it can be tested
 * without building a release.
 *
 * Two failures shape this file. One is an update that offers the version already
 * running — electron-updater compares against whatever the release metadata
 * claims, and a release published with a stale `latest.yml` will happily be
 * "newer" forever. The other is an update that installs and changes nothing,
 * which is what a portable build does: the installer runs, the old executable
 * restarts, and the same update is found again on the next check. Both loops end
 * the same way — the app downloads the same file every launch, for good.
 *
 * The answers here are a version comparison the app makes itself, and a memory
 * of what was installed last time, checked against what is actually running.
 */

export type UpdateStatus =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'none'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

/** Why this build cannot update itself. The renderer turns these into text. */
export type UnsupportedReason = 'unpackaged' | 'portable' | 'deb';

/** Why a candidate was turned down. Reported for the log, not for the user. */
export type RejectionReason = 'invalid' | 'same' | 'older' | 'blocked' | 'prerelease';

/** Which releases this installation is willing to be offered. */
export type UpdateChannel = 'release' | 'beta';

export interface UpdateState {
  status: UpdateStatus;
  /** The running build. */
  version: string;
  /** The version an `available`, `downloading` or `ready` state is about. */
  candidate?: string;
  /** 0–100 while downloading. */
  percent?: number;
  reason?: UnsupportedReason;
  /** Technical detail behind an `error`; shown as-is, so keep it short. */
  error?: string;
  /** Epoch ms of the last completed check. */
  checkedAt?: number;
  /** Set once when an install ran and left the same version behind. */
  failedVersion?: string;
}

export interface BuildEnvironment {
  platform: string;
  packaged: boolean;
  /** `PORTABLE_EXECUTABLE_DIR` — set only inside a portable Windows build. */
  portableDir?: string;
  /** `APPIMAGE` — set only when running from an AppImage. */
  appImage?: string;
}

export interface UpdateMemory {
  /** Version handed to the installer, cleared once the outcome is known. */
  pendingVersion: string | undefined;
  /** Versions that installed without changing the running build. */
  blockedVersions: string[];
}

export function blankMemory(): UpdateMemory {
  return { pendingVersion: undefined, blockedVersions: [] };
}

interface Parsed {
  release: [number, number, number];
  pre: string[];
}

// Build metadata is matched so it can be ignored: semver says it takes no part
// in precedence, and GitHub tags carry it often enough to matter.
const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parse(value: unknown): Parsed | null {
  if (typeof value !== 'string') return null;

  const match = SEMVER.exec(value.trim());
  if (!match) return null;

  return {
    release: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split('.') : [],
  };
}

/** True when the string is a version this module is willing to reason about. */
export function isVersion(value: unknown): value is string {
  return parse(value) !== null;
}

/** The same version without its leading `v`, or null when it is not one. */
export function normaliseVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return SEMVER.test(trimmed) ? trimmed.replace(/^v/, '') : null;
}

/**
 * -1, 0 or 1 in the manner of a comparator, or null when either side is not a
 * version. Null rather than 0: "cannot tell" and "equal" must not act alike, or
 * an unparsable release would silently count as up to date.
 */
export function compareVersions(a: string, b: string): number | null {
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return null;

  // Literal indices, so the tuple reads as numbers rather than number | undefined.
  for (const i of [0, 1, 2] as const) {
    if (left.release[i] !== right.release[i]) return left.release[i] < right.release[i] ? -1 : 1;
  }

  // A release outranks every pre-release of the same numbers (semver §11.3).
  if (!left.pre.length !== !right.pre.length) return left.pre.length ? -1 : 1;

  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i += 1) {
    const l = left.pre[i];
    const r = right.pre[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    if (l === r) continue;

    const lNumeric = /^\d+$/.test(l);
    const rNumeric = /^\d+$/.test(r);
    // Numeric identifiers compare as numbers, so beta.10 follows beta.2.
    if (lNumeric && rNumeric) return Number(l) < Number(r) ? -1 : 1;
    // A numeric identifier always ranks below an alphanumeric one.
    if (lNumeric !== rNumeric) return lNumeric ? -1 : 1;
    return l < r ? -1 : 1;
  }

  return 0;
}

export function isUpgrade(current: string, candidate: string): boolean {
  return compareVersions(candidate, current) === 1;
}

/** True for a version carrying a pre-release tail, like `0.4.0-beta.1`. */
export function isPrerelease(value: string): boolean {
  return (parse(value)?.pre.length ?? 0) > 0;
}

export type CandidateVerdict = { accept: true } | { accept: false; reason: RejectionReason };

/**
 * Decides whether a version offered by the release channel is worth installing.
 *
 * The channel is asked here as well as at the updater, which already filters
 * pre-releases when it is told to. Two gates rather than one, because the
 * updater's is a setting on a library and this one is the app's own answer: a
 * tester who leaves the beta channel must stop being offered betas even if the
 * release metadata says otherwise.
 */
export function acceptCandidate(
  current: string,
  candidate: string,
  memory: UpdateMemory,
  channel: UpdateChannel = 'release',
): CandidateVerdict {
  const order = compareVersions(candidate, current);
  if (order === null) return { accept: false, reason: 'invalid' };
  if (order === 0) return { accept: false, reason: 'same' };
  if (order === -1) return { accept: false, reason: 'older' };
  if (channel === 'release' && isPrerelease(candidate)) {
    return { accept: false, reason: 'prerelease' };
  }
  if (memory.blockedVersions.includes(candidate)) return { accept: false, reason: 'blocked' };

  return { accept: true };
}

/**
 * Called at startup, once the running version is known. If the last install did
 * not take, the version behind it is blocked so the app stops offering it.
 */
export function reconcile(
  current: string,
  memory: UpdateMemory,
): { memory: UpdateMemory; failed?: string } {
  // Anything the running build has caught up with can no longer be offered, so
  // keeping it blocked would only grow the file.
  const blockedVersions = memory.blockedVersions.filter((version) => isUpgrade(current, version));
  const pending = memory.pendingVersion;

  if (!pending) return { memory: { pendingVersion: undefined, blockedVersions } };

  // The install worked if the app came back as the version it was handed — or as
  // a later one, which is what happens when a newer build is installed by hand
  // while an old attempt is still remembered. Only a build that came back older
  // than what it was handed actually failed to install; treating "not equal" as
  // failure is what left 0.3.1 reporting 0.3.0 as failed forever (defect #14).
  // An unreadable pair counts as success too: refusing to offer a version is a
  // worse answer than one redundant download.
  const order = compareVersions(current, pending);
  if (order === null || order >= 0) {
    return { memory: { pendingVersion: undefined, blockedVersions } };
  }

  return {
    memory: {
      pendingVersion: undefined,
      blockedVersions: blockedVersions.includes(pending)
        ? blockedVersions
        : [...blockedVersions, pending],
    },
    failed: pending,
  };
}

export function rememberPending(version: string, memory: UpdateMemory): UpdateMemory {
  return { ...memory, pendingVersion: version };
}

/** One published release, as the history list needs it. */
export interface ReleaseNote {
  /** The tag without its leading `v`. */
  version: string;
  /** The release title. Usually the version again, sometimes a real name. */
  name: string;
  /** ISO timestamp of publication. */
  publishedAt: string;
  /** The body as written, empty when the release carried none. */
  notes: string;
  prerelease: boolean;
}

/**
 * Turns the releases payload into the list the history panel shows.
 *
 * The panel exists because sending someone to a browser to read what changed in
 * the app they are holding is not an answer (defect #13). What arrives is public
 * JSON from a host we do not control, so every field is checked rather than
 * trusted, and a release the app cannot make sense of is dropped instead of
 * being drawn as a blank row.
 */
export function readReleases(raw: unknown): ReleaseNote[] {
  if (!Array.isArray(raw)) return [];

  const releases: ReleaseNote[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;

    const value = item as Record<string, unknown>;
    // A draft is not published: it is visible to us only because the token that
    // fetched it could see it, and it must not be advertised to anyone.
    if (value.draft === true) continue;

    const version = normaliseVersion(value.tag_name);
    if (!version) continue;

    const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : version;
    const publishedAt = typeof value.published_at === 'string' ? value.published_at : '';
    const notes = typeof value.body === 'string' ? value.body.trim() : '';

    releases.push({ version, name, publishedAt, notes, prerelease: value.prerelease === true });
  }

  // Newest first, and by version rather than by date: a release republished
  // after a fix would otherwise jump to the top of the list.
  return releases.sort((a, b) => compareVersions(b.version, a.version) ?? 0);
}

/**
 * Reads the memory file's contents. Anything unexpected is thrown away rather
 * than repaired: the cost of starting over is one redundant update check.
 */
export function readMemory(raw: unknown): UpdateMemory {
  if (!raw || typeof raw !== 'object') return blankMemory();

  const value = raw as Record<string, unknown>;

  if (value.pendingVersion !== undefined && !isVersion(value.pendingVersion)) return blankMemory();
  if (value.blockedVersions !== undefined && !Array.isArray(value.blockedVersions)) {
    return blankMemory();
  }

  return {
    pendingVersion: value.pendingVersion as string | undefined,
    blockedVersions: ((value.blockedVersions as unknown[]) ?? []).filter(isVersion),
  };
}

/**
 * Whether this build can replace itself. A portable executable and a .deb both
 * download an update perfectly well and then fail to become it — better to say
 * so than to hand the user a button that quietly does nothing.
 */
export function updateSupport(
  env: BuildEnvironment,
): { supported: true } | { supported: false; reason: UnsupportedReason } {
  if (!env.packaged) return { supported: false, reason: 'unpackaged' };
  if (env.portableDir) return { supported: false, reason: 'portable' };
  if (env.platform === 'linux' && !env.appImage) return { supported: false, reason: 'deb' };

  return { supported: true };
}
