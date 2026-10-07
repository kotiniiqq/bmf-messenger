import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The prototype's `.toast` — the one-line confirmation almost every action ends
 * with. Exposed as a plain function so callers do not have to be components.
 */
let show: ((text: string) => void) | null = null;

export function toast(text: string): void {
  show?.(text);
}

export function Toaster() {
  const [text, setText] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer = 0;

    show = (next: string) => {
      setText(next);
      setVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(false), 2200);
    };

    return () => {
      window.clearTimeout(timer);
      show = null;
    };
  }, []);

  return createPortal(
    <div className={`toast${visible ? ' show' : ''}`}>{text}</div>,
    document.body,
  );
}
