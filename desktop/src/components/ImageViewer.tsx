import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Attachment } from '@bmf/shared';
import { t } from '../i18n/index.js';
import { useObjectUrl } from '../media.js';
import { toast } from './Toast.js';

/**
 * A picture at full size.
 *
 * The prototype has no plain viewer — clicking an image there opens the
 * screenshot editor, which is a whole feature of its own and not built yet. So
 * this borrows that overlay's `.ann-ov` box and puts nothing in it but the
 * image and two buttons; when the editor lands, it fills the same frame.
 */
export function ImageViewer({
  file,
  onClose,
}: {
  file: Attachment;
  onClose: () => void;
}) {
  const url = useObjectUrl(file.id);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * Saving goes through an anchor rather than a preload call: the bytes are
   * already a blob URL in this process, and Chromium's own download path both
   * picks the folder and names the file. A channel through the main process
   * would move the same bytes twice to end up in the same place.
   */
  function save() {
    if (!url) return;

    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    toast(t('chat.viewer.saving'));
  }

  return createPortal(
    <div className="ann-ov show" onClick={onClose}>
      {url && (
        <img
          src={url}
          alt={file.name}
          style={{ maxWidth: '86vw', maxHeight: '78vh', borderRadius: 12 }}
          onClick={(event) => event.stopPropagation()}
        />
      )}

      <div className="ann-tools" onClick={(event) => event.stopPropagation()}>
        <button className="ann-t" title={t('chat.viewer.save')} onClick={save}>
          <svg viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <button className="ann-t" title={t('common.close')} onClick={onClose}>
          <svg viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  );
}
