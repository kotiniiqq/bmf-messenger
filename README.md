# BMF Messenger

Desktop messenger with built-in mail, music player, notes and an AI assistant.
Windows and Linux. Mobile clients are planned; the protocol is designed for them already.

> Public copy of a personal product, built solo. The private repository has
> 110 commits (31 Jul – 4 Aug 2026, 35 merged pull requests); this copy starts with a single
> commit and leaves out the production server's address. A beta ran with a small group of friends.

**TypeScript monorepo, ~28k lines, 363 tests** (unit, integration against a real Postgres, and
client smoke tests), all run in CI together with lint, typecheck, migrations and the desktop build.

- Full specification: [`docs/BMF-SPEC.md`](docs/BMF-SPEC.md)
- Working agreements, hard rules and current status: [`CONTRIBUTING.md`](CONTRIBUTING.md);
  architecture decisions in [`docs/decisions/`](docs/decisions)
- UI reference: [`docs/ui-prototype.html`](docs/ui-prototype.html)

## What works, and what does not yet

The honest status lives in [`CONTRIBUTING.md` → Current stage](CONTRIBUTING.md#current-stage). In short:

- **Messenger core, done**: auth with rotating refresh tokens and per-device sessions, chats,
  groups and channels with roles, WebSocket events with a `GET /sync` catch-up, search, media,
  forwarding, replies, editing, pins, folders, presence, scheduled messages, and an end-to-end
  encrypted privacy mode on libsignal between two devices.
- **Desktop shell, done**: frameless Electron window, tray, notifications, global shortcuts,
  installers for Windows and Linux built by CI, auto-update verified end to end on Windows.
  No code-signing certificate yet.
- **In progress**: mail (IMAP sync works; the UI still shows mock mail, sending is next), calls
  (LiveKit + coturn, verified on one machine; two networks and a four-person call still to prove),
  notes done but the AI assistant, music and the marketplace not started.

## Layout

```
shared/   types and protocol contracts used by both sides
server/   Fastify API, WebSocket layer, jobs (PostgreSQL, Redis, MinIO)
desktop/  Electron shell + React UI
infra/    compose files, Caddy, LiveKit and coturn configs, host scripts
```

## Getting started

```bash
cp server/.env.example server/.env      # fill in secrets
docker compose -f infra/compose/dev.yml up -d
npm ci
npm run db:migrate
npm run dev
```

Health checks: `GET /health/live`, `GET /health/ready`.

Tests wipe the database they run against: point `DATABASE_URL` at a separate `bmf_test` database
(see `.github/workflows/ci.yml` for the full environment), then `npm test`.

## Auth

```
POST   /api/v1/auth/register     username, email, password, device, consents -> user + tokens
POST   /api/v1/auth/login        login (username or email), password, device -> user + tokens
POST   /api/v1/auth/refresh      refreshToken -> new pair
POST   /api/v1/auth/logout       revokes the calling device
GET    /api/v1/auth/devices      active sessions
DELETE /api/v1/auth/devices/:id  revokes one session
```

Access tokens last 15 minutes and are stateless; refresh tokens are opaque, rotate on every use
and last 30 days. Revoking a session takes effect immediately, not when the access token expires.

Optional: `npm run geoip -w server` downloads the city database shown in the session list.
