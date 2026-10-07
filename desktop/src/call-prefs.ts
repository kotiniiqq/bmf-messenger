/**
 * How this machine connects to a call.
 *
 * The spec (§7) asks for relaying through the server by default and a direct
 * path as a setting, with a plain warning attached. The stack it is implemented
 * on shifts what the warning is about: LiveKit is an SFU, so the media always
 * terminates on our server and the other participant never sees your address in
 * either mode. What the setting actually decides is whether your address is
 * visible to the LiveKit host as well, or only to the TURN relay in front of it
 * — see docs/decisions/0004-calls-relay-by-default.md.
 *
 * Relay stays the default. It costs a few dozen milliseconds and some of the
 * server's bandwidth, and it is the option that surprises nobody.
 */

const STORAGE_KEY = 'bmf.calls';

export interface CallPrefs {
  /** False sends everything through coturn, which is the default. */
  allowDirect: boolean;
}

const DEFAULTS: CallPrefs = { allowDirect: false };

export function getCallPrefs(): CallPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULTS;

    // Read one known key rather than trusting the shape: this is stored data,
    // and stored data outlives the code that wrote it.
    const allowDirect = (parsed as Partial<CallPrefs>).allowDirect;
    return { allowDirect: allowDirect === true };
  } catch {
    return DEFAULTS;
  }
}

export function setCallPrefs(next: CallPrefs): CallPrefs {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A machine that cannot store a preference still has to be able to call.
  }
  return next;
}

/**
 * What goes into `RTCConfiguration`. `relay` refuses every candidate that is not
 * a TURN allocation; `all` lets ICE try the direct paths first and fall back on
 * its own, which is the two-seconds-then-relay behaviour the spec describes.
 */
export function iceTransportPolicy(prefs: CallPrefs): RTCIceTransportPolicy {
  return prefs.allowDirect ? 'all' : 'relay';
}
