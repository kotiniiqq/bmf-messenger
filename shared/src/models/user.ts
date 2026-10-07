export type StatusId = 'on' | 'focus' | 'call' | 'away' | 'dnd' | 'off';

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  statusId: StatusId;
  /** Custom status line; replaces the preset label when set. */
  statusText: string | null;
  statusAuto: boolean;
  /**
   * Whether other people are told when this person was last online. Hides the
   * time, not the fact: reporting somebody offline while they read your message
   * would be a lie, and telling less is better than that.
   */
  showLastSeen: boolean;
  isPro: boolean;
  createdAt: string;
}

export interface Device {
  id: string;
  name: string;
  platform: 'windows' | 'linux' | 'macos' | 'android' | 'ios';
  lastSeenAt: string;
  /** Resolved from a local GeoIP database; null when it cannot be determined. */
  city: string | null;
  current: boolean;
}
