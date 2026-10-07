# bmf-infra

Compose files, service configuration and deploy scripts for BMF Messenger.

- `compose/dev.yml` — local dependencies only (Postgres, Redis, MinIO)
- `compose/prod.yml` — full VPS stack
- `configs/` — Caddy, LiveKit, coturn, mail server configuration

## Rules

- **No secrets in this repository.** `.env.prod` lives only on the server; commit `.env.example`.
- Backups: nightly `pg_dump` + MinIO snapshot, kept 14 days.
  **Restore is verified monthly** — a backup that has never been restored does not exist.
- Logs are retained 30 days, then deleted.

## Before the first deploy

1. Confirm with the VPS provider that **port 25 is open** and that a **reverse DNS record**
   can be set for the IP. Do this before paying — it is the usual blocker.
2. Publish mail DNS records: A, MX, SPF, DKIM, DMARC.
3. Register the domain in Google Postmaster Tools.

Domain reputation accrues over calendar time, so start these on day one, in parallel with
development — not when the mail code is ready.
