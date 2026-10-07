import type { Device, StatusId, User } from '@bmf/shared';

/** Shapes as they come back from postgres.js, which camel-cases column names. */
export interface UserRow {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  displayName: string;
  avatarUrl: string | null;
  statusId: StatusId;
  statusText: string | null;
  statusAuto: boolean;
  showLastSeen: boolean;
  isPro: boolean;
  createdAt: Date;
  deletedAt: Date | null;
  emailVerifiedAt: Date | null;
}

export interface DeviceRow {
  id: string;
  userId: string;
  name: string;
  platform: Device['platform'];
  refreshTokenHash: string;
  prevRefreshTokenHash: string | null;
  refreshRotatedAt: Date | null;
  refreshExpiresAt: Date | null;
  lastSeenAt: Date;
  lastIp: string | null;
  lastCity: string | null;
  createdAt: Date;
  revokedAt: Date | null;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    statusId: row.statusId,
    statusText: row.statusText,
    statusAuto: row.statusAuto,
    showLastSeen: row.showLastSeen,
    isPro: row.isPro,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toDevice(row: DeviceRow, currentDeviceId: string | null): Device {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    lastSeenAt: row.lastSeenAt.toISOString(),
    city: row.lastCity,
    current: row.id === currentDeviceId,
  };
}
