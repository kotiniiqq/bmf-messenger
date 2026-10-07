import { useEffect, useState } from 'react';
import type { Attachment } from '@bmf/shared';
import { api } from './api/client.js';

/**
 * Attachment bytes, turned into something the DOM will accept.
 *
 * `GET /media/:id` needs an Authorization header and `<img src>` cannot send
 * one, so every image is fetched here and published as a blob URL. The cache is
 * what makes that bearable: a chat scrolled up and down would otherwise
 * re-download every picture it passes.
 */

const urls = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

/** Roughly the images of a long chat. Past it, the oldest URL is revoked. */
const LIMIT = 60;

export function objectUrl(attachmentId: string): Promise<string> {
  const ready = urls.get(attachmentId);
  if (ready) return Promise.resolve(ready);

  const pending = inFlight.get(attachmentId);
  if (pending) return pending;

  const load = api
    .mediaBlob(attachmentId)
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      urls.set(attachmentId, url);
      evict();
      return url;
    })
    .finally(() => inFlight.delete(attachmentId));

  inFlight.set(attachmentId, load);
  return load;
}

/**
 * A blob URL holds its bytes until revoked, so an unbounded cache is a memory
 * leak with a friendly name. Insertion order is age here — `Map` keeps it.
 */
function evict() {
  while (urls.size > LIMIT) {
    const oldest = urls.keys().next();
    if (oldest.done) return;
    URL.revokeObjectURL(urls.get(oldest.value) as string);
    urls.delete(oldest.value);
  }
}

/** Drops everything. Used on sign-out: the next person is not entitled to these. */
export function forgetMedia(): void {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  inFlight.clear();
}

export function isImage(attachment: Attachment): boolean {
  return attachment.mime.startsWith('image/');
}

/** `undefined` while loading, `null` when it could not be fetched. */
export function useObjectUrl(attachmentId: string | null): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(
    attachmentId ? urls.get(attachmentId) : null,
  );

  useEffect(() => {
    if (!attachmentId) {
      setUrl(null);
      return;
    }

    let alive = true;
    setUrl(urls.get(attachmentId));
    void objectUrl(attachmentId)
      .then((value) => alive && setUrl(value))
      .catch(() => alive && setUrl(null));

    return () => {
      alive = false;
    };
  }, [attachmentId]);

  return url;
}

/** "1,4 МБ" — the size as a person reads it, not as a byte count. */
export function humanSize(bytes: number, units: [string, string, string]): string {
  if (bytes < 1024) return `${bytes} ${units[0]}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ${units[1]}`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${units[2]}`;
}

/** The badge on a file card: "PDF", "ZIP". Falls back to the generic label. */
export function extensionOf(name: string, fallback: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return fallback;
  return name.slice(dot + 1).toUpperCase().slice(0, 4);
}
