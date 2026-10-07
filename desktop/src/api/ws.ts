import { LIMITS, type ServerEvent } from '@bmf/shared';
import { API_BASE, loadSession } from './client.js';

type Listener = (event: ServerEvent) => void;

/** The last moment this window saw a person do anything. */
let lastInput = Date.now();

for (const name of ['pointerdown', 'keydown', 'wheel', 'focus'] as const) {
  window.addEventListener(name, () => {
    lastInput = Date.now();
  });
}

/**
 * How long the machine has been untouched, for the automatic status.
 *
 * Electron answers from the operating system, which is the real question: a
 * person writing an email in another window is not away. In a browser there is
 * no such reading, so the window's own input is the best available guess — it
 * over-reports idleness, and the server treats it as a claim either way.
 */
async function idleSeconds(): Promise<number> {
  const fromShell = await window.bmf?.idleSeconds().catch(() => undefined);
  if (typeof fromShell === 'number') return fromShell;

  return Math.round((Date.now() - lastInput) / 1000);
}

/**
 * One socket for the app. Reconnects with exponential backoff, and every
 * successful reconnect is followed by a REST catch-up — the socket is for
 * events only and may have missed some (hard rule 8).
 */
export class EventStream {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private onReconnect: (() => void) | null = null;
  private onStatus: ((online: boolean) => void) | null = null;
  private attempt = 0;
  private timer: number | null = null;
  private heartbeat: number | null = null;
  private closed = false;

  connect(onReconnect: () => void, onStatus?: (online: boolean) => void): void {
    this.onReconnect = onReconnect;
    this.onStatus = onStatus ?? null;
    this.closed = false;
    this.open();
  }

  private open(): void {
    const session = loadSession();
    if (!session || this.closed) return;

    const url = `${API_BASE.replace(/^http/, 'ws')}/ws`;
    const socket = new WebSocket(url, [`bearer.${session.accessToken}`]);
    this.socket = socket;

    socket.onopen = () => {
      const wasRetrying = this.attempt > 0;
      this.attempt = 0;
      this.onStatus?.(true);
      this.startHeartbeat();
      // Only catch up after an actual gap; the first connect has nothing to miss.
      if (wasRetrying) this.onReconnect?.();
    };

    socket.onmessage = (event) => {
      try {
        const batch = JSON.parse(event.data as string) as ServerEvent[];
        for (const item of batch) for (const listener of this.listeners) listener(item);
      } catch {
        // A frame we cannot parse is not worth tearing the connection down for.
      }
    };

    socket.onclose = () => {
      this.socket = null;
      this.stopHeartbeat();
      this.onStatus?.(false);
      if (!this.closed) this.scheduleRetry();
    };

    socket.onerror = () => socket.close();
  }

  /**
   * Keeps the account marked present. The server also pings at the protocol
   * level, but a browser answers those without the page being involved — this
   * is the client saying it is still there, which is what presence means.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = window.setInterval(() => {
      void idleSeconds().then((seconds) =>
        this.send({ type: 'presence.ping', payload: { idleSeconds: seconds } }),
      );
    }, LIMITS.wsHeartbeatMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private scheduleRetry(): void {
    if (this.timer !== null) return;

    // 1s, 2s, 4s … capped at 30s, so a server restart does not become a storm.
    const delay = Math.min(1000 * 2 ** this.attempt, 30_000);
    this.attempt += 1;

    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.open();
    }, delay);
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  close(): void {
    this.closed = true;
    this.stopHeartbeat();
    this.onStatus?.(false);
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.socket?.close();
    this.socket = null;
  }
}

export const stream = new EventStream();
