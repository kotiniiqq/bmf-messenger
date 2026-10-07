# 5. The privacy mode binds two devices, not two people

Date: 2026-08-02

## Context

`BMF-SPEC.md` §5 asks for a per-chat privacy mode: one side offers it, the other
confirms, and from then on the chat is end-to-end encrypted through libsignal.
It also says, in the same paragraph, that an E2E chat's history does not
synchronise between devices and cannot be recovered.

Those two sentences decide more than they appear to. Signal's session is between
two *devices*, and multi-device support in Signal's own products works by
encrypting every message once per recipient device and syncing the sender's own
copies to its other devices. That is a large mechanism, and the spec explicitly
does not want its outcome.

## Decision

The agreement records a pair of device ids. The proposing device is stored when
the offer is made; the accepting device is added when it is answered. Messages in
that chat are encrypted between exactly those two, and the server refuses an
envelope from any other device in the chat.

Consequences follow directly, and the interface states each of them:

- A third device of either person cannot read the chat. It shows the messages as
  unavailable rather than as missing or broken.
- The sender cannot re-read its own messages from the ciphertext, because that
  ciphertext was addressed to the other device. The plaintext of what this
  device sent is kept locally, and goes when the app does.
- Groups are not offered at all. Group E2E needs sender keys and a re-key on
  every membership change; half of that would be worse than none, and the button
  is absent in a group rather than present and failing.

The keys live in the Electron main process, in a file under the app's user data,
encrypted with `safeStorage` where the OS provides it. The renderer has no call
that returns a key — it sends text and receives an envelope, or the reverse.

## Consequences

Signing in on a second machine gives that machine a new identity and no history.
This is the spec's intent stated as a mechanism, and the chat says so before
anybody agrees to the mode rather than after.

Losing the key file — a reinstall, a rotated OS keychain — makes past messages in
those chats permanently unreadable. There is no recovery path by design, so
there is also no support request that can undo it.

`@signalapp/libsignal-client` is a native module. It is the one thing the main
process does not bundle: it loads its compiled library by looking next to its own
package, so the build copies the package beside the bundle and electron-builder
unpacks it from the asar. See `desktop/scripts/build-electron.mjs`.
