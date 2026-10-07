/** Hard limits shared by client and server. The server enforces them; the client only hints. */
export const LIMITS = {
  messageLength: 8000,
  displayNameLength: 64,
  statusTextLength: 40,
  usernameMinLength: 3,
  usernameMaxLength: 32,
  passwordMinLength: 10,
  /** argon2 handles long input fine; the cap only stops absurd payloads. */
  passwordMaxLength: 200,
  chatTitleLength: 128,
  attachmentsPerMessage: 10,
  attachmentSizeBytes: 100 * 1024 * 1024,
  avatarSizeBytes: 5 * 1024 * 1024,
  pageSize: 50,
  maxPageSize: 100,
  /** Anti-spam: fresh accounts are throttled until the account is trusted. */
  mailPerHourNewAccount: 20,
  mailPerHourTrusted: 200,
  wsHeartbeatMs: 20_000,
  wsEventBatchMs: 50,
  /** Anti-bruteforce: failed logins per (ip, login) pair. */
  loginAttemptsPer15Min: 10,
  /** Blanket ceiling for every /auth route, per IP. */
  authRequestsPerMinute: 30,
} as const;
