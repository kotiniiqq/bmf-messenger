/** Typed error codes. Never send raw strings to the client. */
export const ERROR = {
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  VALIDATION: 'validation_failed',
  RATE_LIMITED: 'rate_limited',
  CONFLICT: 'conflict',
  MAIL_FROZEN: 'mail_frozen',
  PREMIUM_REQUIRED: 'premium_required',
  /** A feature this deployment has not been configured for, e.g. calls without LiveKit. */
  UNAVAILABLE: 'unavailable',
  INTERNAL: 'internal_error',
} as const;

export type ErrorCode = (typeof ERROR)[keyof typeof ERROR];

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
