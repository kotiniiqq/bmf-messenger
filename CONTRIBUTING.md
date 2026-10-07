# CONTRIBUTING.md — how to work on this project

Read this before changing anything. Keep it accurate: if a decision changes,
update this file in the same PR.

---

## Project in one paragraph

BMF Messenger is a desktop messenger (Windows + Linux) that also contains a mail client with our
own mail service, a local music player, notes and an AI assistant. Its selling points are deep
customization (themes and skins as declarative configs, a marketplace) and user control over data
(own AI key, own mailbox, per-chat privacy mode). Mobile clients are planned later, so the protocol
is designed for them already.

Full spec: `docs/BMF-SPEC.md`. UI reference: `docs/ui-prototype.html` (clickable prototype — it is
the source of truth for layout and interaction behaviour, not for code).

---

## Repositories

- `bmf-app` — monorepo (`server/`, `desktop/`, `shared/`). You are here.
- `bmf-releases` — **public**, binaries + update metadata only. Never push source here.
- `bmf-infra` — compose files, service configs, deploy scripts (`infra/` in this public copy).

---

## Stack (do not substitute without an ADR)

Node.js 22 + TypeScript + Fastify · PostgreSQL 16 · Redis 7 · MinIO · LiveKit + coturn ·
Stalwart Mail · Electron + React + Zustand + Vite · Sentry / Prometheus / Grafana.

---

## Hard rules

1. **English only** in code, comments, commits, branches, docs. UI strings are Russian but live in
   i18n dictionaries — never hardcode them in components.
2. **No secrets in the repo.** Config comes from env, validated at boot; missing vars fail fast.
3. **Server is the authority.** Permissions, roles and premium status are checked server-side.
   Client-side checks only hide buttons.
4. **Never hand-roll crypto.** E2E uses libsignal. Passwords use argon2id.
5. **Migrations are reversible** and never edited after merge — add a new one instead.
6. **Idempotent writes.** Message send requires `client_msg_id`; repeats return the existing row.
7. **Cursor pagination** everywhere. No `OFFSET` in message or mail lists.
8. **REST for request/response, WebSocket for events.** Any state reachable only through WS is a bug:
   a client that reconnects must be able to catch up via `GET /sync`.
9. **Theme configs are data, not code.** Parse against a whitelist, ignore unknown keys, reject
   external URLs. `Ctrl+Alt+R` (appearance reset) is handled before user config is applied and must
   never be interceptable by a theme.
10. **Deleting an account really deletes** — messages, files, mail, keys, sessions.

---

## Layout conventions

- Domain logic lives in `server/src/modules/<name>/`: `router.ts`, `service.ts`, `repo.ts`, `types.ts`.
  Routers never touch the database directly.
- Shared contracts live in `shared/src/protocol/`. If the client and server disagree about a type,
  the fix belongs in `shared`, not in a cast.
- Electron main-process code stays in `desktop/electron/` and exposes a narrow, typed preload API.
  Renderer never gets `nodeIntegration`.
- Background jobs go to `server/src/jobs/` and are registered in one place.

---

## Working agreements

- One PR per logical change, CI must be green (lint, typecheck, tests, build).
- The integration tests wipe the database they run against. Point `DATABASE_URL`
  at `bmf_test`, never at the `bmf` database the local dev server uses.
- The UI is ported from `docs/ui-prototype.html`, not written in its style: port the screen's own
  markup first and wire the backend to it second. `npm run lint` fails on a class name no
  stylesheet defines, which is what inventing markup looks like from the outside.
- Any architectural decision that deviates from `BMF-SPEC.md` gets an ADR in `docs/decisions/`
  with context, decision and consequences. Short is fine — three paragraphs.
- When touching mail: never test bulk sending against real providers from the production IP.
  Domain reputation is slow to build and fast to lose.
- When touching calls: test behind at least two different NATs; a call that works on localhost
  proves nothing.
- Prefer boring solutions. This project already has enough moving parts.

---

## Releasing

Bump `desktop/package.json`, merge, then push a tag: `git tag v0.2.6 && git push origin v0.2.6`.
CI builds every target and publishes them to `bmf-releases`, which is where the client looks
for updates. A manual run of the workflow only builds; nothing is offered to anyone.

The build refuses a tag that disagrees with `desktop/package.json`. Keep it that way: a release
whose metadata names a version different from the binary inside is what makes clients install
an update that changes nothing, over and over.

Publishing needs the `RELEASES_TOKEN` secret — a fine-grained PAT with `contents: write` on
`bmf-releases` alone. The workflow's own token cannot write to another repository.

## Environment the server needs beyond the basics

`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `TURN_SECRET`, `TURN_HOST` for calls;
`MAIL_SECRET` (32+ chars) for mailbox credentials. All optional at boot on purpose: a machine
without them runs everything else and reports the feature unavailable, rather than failing at
the moment somebody dials or connects a mailbox. Rotating `MAIL_SECRET` makes every stored
mailbox password unreadable — that is the revocation path, not an accident.

---

## Current stage

Update this section as stages complete — it is the fastest way for a newcomer to orient.

- [x] Stage 0 — foundation (monorepo, compose, CI, DNS/mail warm-up started)
- [x] Stage 1 — messenger core: auth, chats, messages, WebSocket, search, media, user
      directory, forwarding, replies, editing, pinned messages, chat folders,
      group and channel creation with roles, the member list behind the chat
      header, deleting a chat for yourself
      (`docs/decisions/0006-deleting-a-chat-is-per-member.md`), statuses,
      presence, scheduled messages, the React client, and the E2E privacy mode.
      Privacy mode: libsignal in the Electron main process, key bundles on the
      server, offered and accepted inside a direct chat, and a session bound to
      the two devices that agreed — see `docs/decisions/0005-privacy-mode-between-two-devices.md`.
      Verified by a real libsignal round trip over the on-disk store
      (`desktop/test/e2e.test.ts`); not yet verified between two machines.
- [x] Stage 2 — desktop shell: a frameless window carrying the prototype's own title
      bar (drag region and the three `.wc-wind` buttons), tray with unread badge,
      hide-to-tray, single instance, system notifications, global shortcuts,
      autostart, NSIS + portable + AppImage + deb built and published by CI, and
      auto-update that can be asked on demand, shows progress, and installs on a
      restart instead of running the installer's wizard.
      Verified on Windows end to end: 0.2.4 found 0.2.5, downloaded it, installed
      silently and came back as 0.2.5 — and then reported itself up to date.
      Still true: no code-signing certificate, and the only machine it has ever
      been installed on is a development one.
- [~] Stage 3 — mail: the server reads real mailboxes over IMAP — connect with the
      password verified first, encrypted at rest under `MAIL_SECRET`, synced by a
      job that claims a mailbox before fetching and keys messages by
      (account, folder, uid) so repeats update rather than duplicate.
      Not done: the interface still draws mock mail, sending, rules, the
      anti-spam freeze, and receiving at `@bmf.ink`, which needs inbound 25 this
      host will not give. Sending is now unblocked at the network level — see the
      port note below, 587 and 465 opened on 2026-08-02 — so it is the next
      thing to build rather than the thing that cannot be built.
- [~] Stage 4 — calls: LiveKit and coturn on the beta host, the API that decides
      who may join, and a client where the call gets its own window and folds
      into a pill when closed. Screen sharing with its own source picker and a
      system-audio choice, a floating control block while sharing, camera
      aspect-ratio fit with a fit/fill toggle, separate tiles for a camera and a
      shared screen, call history on real data, the relay-or-direct setting
      (`docs/decisions/0004-calls-relay-by-default.md`), and calls that end
      themselves when nobody answers.
      Verified live on one machine: ICE over UDP, microphone published, 742 ms to
      connect. **Still not verified, and this is what closes the stage:** two
      people on two different networks, which is what proves TURN, and a
      four-person group holding for ten minutes.
- [~] Stage 5 — notes are done: a private-to-one-person module with folders, cursor
      paging and search, and the prototype's own `#notesView` on real data.
      Not done: the AI assistant, music on a real local folder (the player is
      still a mock list), sound schemes, the marketplace and the billing base.

The interface is ported ahead of the backend in places: mail and music are the prototype's
screens on mock data, and the marketplace, sound schemes, AI and mail rules are laid out but
inert. Every such control says which stage it belongs to, in the row itself — if you wire one
up, delete that note in the same change.

## Server (beta)

Single host for the whole beta stack: `app.bmf.ink` (a VPS with 2 vCPU / 8 GB / 60 GB,
Ubuntu 24.04; the address and provider are left out of the public copy). SSH key auth only — password login is disabled.

**Credentials never live in this repository, in documents, or in chat.** They belong in the
team password manager. A secret that reaches git history is compromised permanently: rotate it
instead of trying to remove it.

## Known constraints

- No code-signing certificate yet: Windows SmartScreen will warn on install. Documented, not a bug.
- The portable Windows build and the `.deb` cannot replace themselves — the installer runs and
  the running executable stays what it was. Both say so on the updates screen instead of
  offering a button that does nothing.
- Linux system-audio capture during screen share works only on Wayland/PipeWire, not X11.
- `.ink` is a young TLD with weaker mail reputation; a `.com` mail domain will be added later.
  The code already supports multiple mail domains — keep it that way.
- Single VPS hosts everything for now. Mail must stay portable to its own machine (config, not code).
- **Outbound 587 and 465 are open; 25 is still blocked.** Re-measured 2026-08-02 at 16:33 UTC
  from the beta host: 587 and 465 complete a real SMTP handshake against Gmail, Yandex, Mailgun
  and Brevo (STARTTLS on 587, implicit TLS on 465 — Gmail greets us by our own IP). Port 25
  times out to every one of them, and 2525 works only where the provider offers it. So sending
  through a provider's relay now works from this host and nodemailer over 587 is back on the
  table; a provider's HTTP API is a choice rather than the only option.
  What has not changed: delivering straight to recipient MX servers needs outbound 25, and
  receiving at `@bmf.ink` needs inbound 25. Both remain impossible here. Real mail on our own
  domain still needs a host that does not filter 25 — keep the mail module portable, as the
  spec already requires.
- 2 vCPU and a 100 Mbit/s port: fine for ~20 testers, roughly five concurrent group calls max.
- 60 GB disk is the first thing that will run out. Docker log rotation, mailbox quotas and a
  75% disk alert are mandatory, not optional.
- Password reset does not exist yet. The reason it could not exist is gone — 587 is open, so a
  provider's relay can carry a reset mail — and it is now an unbuilt feature rather than a
  blocked one. Account recovery during the beta is still manual.
- A privacy-mode chat is readable only on the two devices that agreed to it, and its history
  cannot be recovered from anywhere. That is the design, not a gap; do not add a "restore" path.
- The GeoIP database used by the session list is ~126 MB, lives outside git, and is fetched with
  `npm run geoip -w server`. Without it sessions simply have no city.
