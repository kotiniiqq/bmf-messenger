import { useObjectUrl } from '../media.js';
import { colourOf } from './LeftPanel.js';

/**
 * A person's picture, or the coloured initials that stand in for one.
 *
 * The picture is an attachment like any other and needs an authorised fetch, so
 * it goes through the same blob-URL cache as images in a chat — an avatar shown
 * in twenty rows of a list is downloaded once.
 */
export function Avatar({
  userId,
  avatarUrl,
  name,
  className = 'av',
  online,
  style,
}: {
  userId: string;
  /** The attachment id the server holds for this person, if any. */
  avatarUrl: string | null;
  name: string;
  className?: string;
  online?: boolean;
  style?: React.CSSProperties;
}) {
  const url = useObjectUrl(avatarUrl);
  const classes = `${className}${online ? ' ol' : ''}`;

  // Until the bytes land, the initials hold the space. Swapping them for a
  // spinner would make every list flicker on every open.
  if (!url) {
    return (
      <div className={classes} style={{ background: colourOf(userId), ...style }}>
        {initialsOf(name)}
      </div>
    );
  }

  return (
    <div
      className={classes}
      style={{ background: `url('${url}') center/cover`, ...style }}
      role="img"
      aria-label={name}
    />
  );
}

export function initialsOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : '··';
}
