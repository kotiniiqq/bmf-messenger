# 2. Opaque refresh tokens with rotation and reuse detection

## Context
`BMF-SPEC.md` fixes access at 15 minutes and refresh at 30 days, with one independently
revocable session per device, but does not say what a refresh token is made of. The schema
already stores `refresh_token_hash`, which allows either a JWT or an opaque string.

## Decision
Refresh tokens are 32 random bytes, not JWTs. The database stores
`HMAC-SHA256(JWT_REFRESH_SECRET, token)`, so a stolen dump yields nothing usable. Every refresh
rotates the pair and keeps the previous hash. A token matching the previous hash more than ten
seconds after rotation is treated as theft: the device is revoked and the event is audited.
Inside ten seconds it is treated as one client racing itself and answered with `409`.

Access tokens stay stateless JWTs and carry no premium or role claim, because hard rule 3 puts
the server in charge of those and a claim would be stale for up to fifteen minutes. Revocation
is a Redis denylist keyed by device id with a TTL equal to the access lifetime, so logging out
kills a token at once instead of leaving it valid for the rest of its life.

## Consequences
Refresh tokens carry no readable claims, so nothing can accidentally depend on their contents,
and revocation is a database fact rather than a signature question. Reuse detection catches the
common theft pattern without a full token-history table. The ten-second window is a deliberate
trade: an attacker replaying inside it gets a `409` rather than being locked out, which is worth
avoiding spurious logouts on flaky connections. Every authenticated request costs one Redis
`EXISTS`, which is cheaper than the database round trip a stateful session would need.
