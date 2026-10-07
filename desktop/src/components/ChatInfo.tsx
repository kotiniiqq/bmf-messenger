import { useEffect, useState } from 'react';
import type { ChatListItem, MemberRole, User } from '@bmf/shared';
import { t, type MessageKey } from '../i18n/index.js';
import { dotStyle, presenceTitle } from '../status.js';
import { useApp } from '../store/app.js';
import { Avatar } from './Avatar.js';
import { EditChat } from './EditChat.js';
import { LeftPanel, colourOf } from './LeftPanel.js';
import { UserProfile } from './UserProfile.js';

/**
 * The prototype's chat-info panel (`lpMode === 'chatinfo'`), reachable by
 * clicking the avatar or the title in the chat header.
 *
 * For a group or a channel it is the only place the client shows who is in the
 * room: until it existed, an incoming message named nobody and there was no
 * list to look the person up in.
 */

const ROLE_LABELS: Record<MemberRole, MessageKey> = {
  owner: 'chat.info.roleOwner',
  admin: 'chat.info.roleAdmin',
  member: 'chat.info.roleMember',
};

function initials(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '·';
}

export function ChatInfo({ chat, onClose }: { chat: ChatListItem; onClose: () => void }) {
  const members = useApp((s) => s.members[chat.id]);
  const presence = useApp((s) => s.presence);
  const loadMembers = useApp((s) => s.loadMembers);
  const myUserId = useApp((s) => s.user?.id);
  const [viewing, setViewing] = useState<User | null>(null);
  const [editing, setEditing] = useState(false);

  /** The button is hidden for a plain member; the server refuses them anyway. */
  const canManage = members?.some(
    (member) => member.userId === myUserId && member.role !== 'member',
  );

  const isDm = chat.type === 'dm';

  // The roster is what turns a peer id into a person, so a direct chat needs it
  // too — it is how this panel knows whose profile to open.
  useEffect(() => {
    void loadMembers(chat.id);
  }, [chat.id, loadMembers]);

  const title = isDm
    ? t('chat.info.titleDm')
    : chat.type === 'channel'
      ? t('chat.info.titleChannel')
      : t('chat.info.titleGroup');

  const peer = chat.peerId ? presence[chat.peerId] : undefined;
  const peerUser = members?.find((member) => member.userId === chat.peerId)?.user;

  // In a direct chat "information about this chat" is information about the
  // other person, so the panel steps aside for their profile rather than
  // drawing a thinner copy of it.
  if (isDm && peerUser) {
    return <UserProfile user={peerUser} chat={chat} onClose={onClose} />;
  }

  return (
    <LeftPanel title={title} onClose={onClose}>
      {viewing && (
        <UserProfile user={viewing} chat={chat} onClose={() => setViewing(null)} />
      )}

      {/* The prototype styles this block inline rather than through a class;
          copied as it is, because a class here would be one this stylesheet
          does not define. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '14px 0 6px',
        }}
      >
        <div
          className="av"
          style={{ background: colourOf(chat.id), width: 76, height: 76, fontSize: 28 }}
        >
          {initials(chat.title || '·')}
        </div>
        <div
          style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', marginTop: 10 }}
        >
          {chat.title || t('chat.dmFallback')}
        </div>
        <div className="ct-sub">
          {isDm
            ? peer?.online
              ? t('chat.presence.online')
              : t('chat.presence.offline')
            : t('chat.presence.members', {
                count: members?.length ?? 0,
                word: t(
                  chat.type === 'channel'
                    ? 'chat.presence.subscriberWord.many'
                    : 'chat.presence.memberWord.many',
                ),
              })}
        </div>
      </div>

      {chat.description && (
        <div className="ct-sub" style={{ padding: '0 14px 6px', textAlign: 'center' }}>
          {chat.description}
        </div>
      )}

      {!isDm && canManage && (
        <button className="sub-btn" style={{ margin: '4px auto' }} onClick={() => setEditing(true)}>
          {t('editChat.edit')}
        </button>
      )}

      {editing && <EditChat chat={chat} onClose={() => setEditing(false)} />}

      {!isDm && (
        <>
          <div className="wz-lbl">
            {chat.type === 'channel' ? t('chat.info.admins') : t('chat.info.members')}
          </div>

          {members === undefined ? (
            <div className="ct-sub" style={{ padding: '10px 4px' }}>
              {t('chat.info.loading')}
            </div>
          ) : (
            members.map((member) => (
              <div
                className="ct-row"
                key={member.userId}
                style={{ cursor: 'pointer' }}
                onClick={() => member.userId !== myUserId && setViewing(member.user)}
              >
                <Avatar
                  userId={member.userId}
                  avatarUrl={member.user.avatarUrl}
                  name={member.user.displayName}
                  online={presence[member.userId]?.online}
                  style={dotStyle(presence[member.userId])}
                />
                <div className="ct-mid">
                  <div className="ct-name">
                    {member.user.displayName}
                    {member.userId === myUserId && ` (${t('chat.info.you')})`}
                  </div>
                  <div className="ct-sub">
                    {presenceTitle(presence[member.userId]) ?? t(ROLE_LABELS[member.role])}
                  </div>
                </div>
                {member.role !== 'member' && (
                  <span className="mf-count">{t('chat.info.adminBadge')}</span>
                )}
              </div>
            ))
          )}
        </>
      )}
    </LeftPanel>
  );
}
