import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The prototype's `.ctx` box: a menu that opens where the pointer is, pulls
 * itself back inside the window when it would hang off an edge, and closes on
 * the next click or scroll anywhere.
 *
 * Extracted from `MessageMenu` when the chat list needed a right-click menu of
 * its own. The behaviour above is the fiddly part and there is no reason for
 * two copies of it.
 */

export interface MenuAction {
  key: string;
  label: string;
  icon: JSX.Element;
  danger?: boolean;
  run: () => void;
}

export function ContextMenu({
  at,
  actions,
  header,
  onClose,
}: {
  at: { x: number; y: number };
  actions: MenuAction[];
  /** Rendered above the actions — the reaction row, where there is one. */
  header?: ReactNode;
  onClose: () => void;
}) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [place, setPlace] = useState(at);

  // Measured after mount so a menu opened near an edge is pulled back inside,
  // the way the prototype nudges it.
  useEffect(() => {
    if (!box) return;
    const rect = box.getBoundingClientRect();
    setPlace({
      x: Math.min(at.x, window.innerWidth - rect.width - 8),
      y: Math.min(at.y, window.innerHeight - rect.height - 8),
    });
  }, [box, at.x, at.y]);

  useEffect(() => {
    const dismiss = () => onClose();
    window.addEventListener('click', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('click', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={setBox}
      className="ctx show"
      style={{ left: place.x, top: place.y }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {header}

      {actions.map((action) =>
        action.key === 'sep' ? (
          <div className="ctx-sep" key={action.key} />
        ) : (
          <div
            className={`ctx-item${action.danger ? ' dgr' : ''}`}
            key={action.key}
            onClick={action.run}
          >
            {action.icon}
            {action.label}
          </div>
        ),
      )}
    </div>,
    document.body,
  );
}
