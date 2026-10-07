# 3. Storing IP and city on device sessions

## Context
`BMF-SPEC.md` section 10 commits to minimisation: "we collect only the login, the email and the
password". The prototype's settings screen nonetheless shows sessions as "Windows · Antalya",
and a session list without a location is much weaker at answering the only question it exists
to answer — "was that me?".

## Decision
`devices` stores `last_ip` and `last_city` for active sessions. Both are overwritten rather than
accumulated, so there is no location history, and both are cleared when the session is revoked.
The city is resolved from a local DB-IP City Lite database read in-process through `maxmind`; no
address is ever sent to a third-party service. When the database file is absent the field is
simply null and everything else works.

## Consequences
This is a real deviation from minimisation and is recorded as one. In exchange, a user can
recognise an unfamiliar session, which is what makes the revoke button meaningful. Because the
lookup is local, this adds no outbound dependency and leaks no addresses to a vendor. The
database is roughly 126 MB, is not in the repository, and is refreshed with
`npm run geoip -w server` — that size counts against the 60 GB disk budget and belongs in the
deployment checklist. DB-IP City Lite is CC BY 4.0, so attribution belongs in the about screen.
