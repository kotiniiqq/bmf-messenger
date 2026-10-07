import type { Contact, StatusId } from '@bmf/shared';

/** A contact row with the person behind it, as postgres.js camel-cases it. */
export interface ContactWithUserRow {
  userId: string;
  localName: string | null;
  createdAt: Date;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  statusId: StatusId;
  statusText: string | null;
  statusAuto: boolean;
  showLastSeen: boolean;
  isPro: boolean;
  /** The account's own creation date, aliased so it survives the join. */
  userCreatedAt: Date;
}

export function toContact(row: ContactWithUserRow): Contact {
  return {
    localName: row.localName,
    addedAt: row.createdAt.toISOString(),
    user: {
      id: row.userId,
      username: row.username,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      statusId: row.statusId,
      statusText: row.statusText,
      statusAuto: row.statusAuto,
      showLastSeen: row.showLastSeen,
      isPro: row.isPro,
      createdAt: row.userCreatedAt.toISOString(),
    },
  };
}
