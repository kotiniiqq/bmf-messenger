# 4. Calls relay by default, and there is no peer-to-peer mode

Date: 2026-08-02

## Context

`BMF-SPEC.md` §7 asks for calls to be relayed through the server by default,
with peer-to-peer available as a setting carrying a plain warning that the other
side will see your IP address.

That description assumes the two clients negotiate a connection with each other.
The stack does not work that way. LiveKit is a selective forwarding unit: every
participant sends its media to the server and receives everyone else's from the
server. There is no code path in which two clients exchange packets directly,
and so no configuration in which the other participant learns your address. The
warning the spec asks for would describe a risk that does not exist here, and
the setting it belongs to would toggle nothing.

The choice of LiveKit is fixed by CONTRIBUTING.md and is not what is being revisited.

## Decision

The setting stays, the meaning changes, and the interface says the new meaning
out loud.

`allowDirect` maps to `RTCConfiguration.iceTransportPolicy`:

- off (the default) → `relay`. Every candidate is a TURN allocation on coturn.
  The LiveKit host sees the relay's address; nobody sees the client's.
- on → `all`. ICE tries host and server-reflexive candidates first and falls
  back to the relay by itself when they fail, which is the "try direct, then
  fall back silently" behaviour the spec describes. The media server sees the
  client's address.

The text under the toggle states exactly that, including the part that does not
change: the person on the other end of the call never sees your address in
either mode.

## Consequences

Relaying everything is the default, so the beta's bandwidth budget assumes every
call passes through coturn twice — which is what the 100 Mbit/s port and the
"roughly five concurrent group calls" estimate in CONTRIBUTING.md already assume.

Nothing in the product promises peer-to-peer. If it is ever wanted for real, it
means a second media path next to LiveKit rather than a flag on this one, and
that is a new decision rather than a change to this one.

The spec keeps its wording; this record is what explains why the implementation
reads differently.
