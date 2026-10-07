import { ERROR, type ErrorCode } from '@bmf/shared';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static unauthorized(msg = 'Authentication required') {
    return new AppError(ERROR.UNAUTHORIZED, msg, 401);
  }

  static forbidden(msg = 'Not allowed') {
    return new AppError(ERROR.FORBIDDEN, msg, 403);
  }

  static notFound(msg = 'Not found') {
    return new AppError(ERROR.NOT_FOUND, msg, 404);
  }

  static premiumRequired(msg = 'Premium subscription required') {
    return new AppError(ERROR.PREMIUM_REQUIRED, msg, 402);
  }
}
