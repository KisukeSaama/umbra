/**
 * Application errors. Technical detail stays in the logs: the client only ever
 * receives a stable code and a short message.
 */

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "upstream_unavailable"
  | "internal_error";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    /** Translation key resolved by the client, or a plain fallback message. */
    readonly messageKey: string,
    options?: { cause?: unknown },
  ) {
    super(messageKey, options);
    this.name = "AppError";
  }
}

export class BadRequestError extends AppError {
  constructor(messageKey = "error.badRequest") {
    super("bad_request", 400, messageKey);
  }
}

export class UnauthorizedError extends AppError {
  constructor(messageKey = "error.unauthorized") {
    super("unauthorized", 401, messageKey);
  }
}

export class ForbiddenError extends AppError {
  constructor(messageKey = "error.forbidden") {
    super("forbidden", 403, messageKey);
  }
}

export class NotFoundError extends AppError {
  constructor(messageKey = "error.notFound") {
    super("not_found", 404, messageKey);
  }
}

export class ConflictError extends AppError {
  constructor(messageKey = "error.conflict") {
    super("conflict", 409, messageKey);
  }
}

export class RateLimitedError extends AppError {
  constructor(readonly retryAfter?: string) {
    super("rate_limited", 429, "error.rateLimited");
  }
}

/** A third-party API reached through Janus did not answer correctly. */
export class UpstreamError extends AppError {
  constructor(
    readonly slug: string,
    /** Detail kept for the logs only. */
    readonly detail?: string,
  ) {
    super("upstream_unavailable", 502, "error.upstream");
  }
}
