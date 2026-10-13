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

/**
 * Who answered, when a call through Janus went wrong.
 *
 * - `gateway`: Janus refused (`application/problem+json`): a grant, a key, a
 *   slug, a quota of its own. Nothing sent to that slug will fare better.
 * - `upstream`: the API itself answered, and not with what was asked for: a
 *   status of its own, or a payload Umbra cannot read.
 * - `network`: nobody answered in time, or at all.
 */
export type UpstreamOrigin = "gateway" | "upstream" | "network";

/** A third-party API reached through Janus did not answer correctly. */
export class UpstreamError extends AppError {
  readonly origin: UpstreamOrigin;
  /** The HTTP status that came back, when one did. */
  readonly upstreamStatus?: number;

  constructor(
    readonly slug: string,
    /**
     * Detail for the logs and the administration's run history, never for a
     * member: it names a gateway slug and a path.
     */
    readonly detail?: string,
    options: { origin?: UpstreamOrigin; status?: number } = {},
  ) {
    super("upstream_unavailable", 502, "error.upstream");
    this.origin = options.origin ?? "upstream";
    this.upstreamStatus = options.status;
  }
}

/**
 * Would the next call to the same service fail the same way?
 *
 * What a loop over many titles asks before it moves on to the next one. A
 * title the provider does not know, or answers for in a shape Umbra cannot
 * read, is that title's own trouble, and the loop goes on without it. A quota
 * reached, a gateway refusing, a provider down or out of reach, or a provider
 * rejecting the credential Janus presents, is everyone's: going on would spend
 * the rest of the quota, ignore the `Retry-After` the gateway asked to be
 * honoured, or wait out the client timeout once per title.
 */
export function isServiceWideFailure(error: unknown): boolean {
  if (error instanceof RateLimitedError) return true;
  if (!(error instanceof UpstreamError)) return false;
  if (error.origin !== "upstream") return true;
  const status = error.upstreamStatus;
  if (status === undefined) return false;
  return status === 401 || status === 403 || status === 408 || status >= 500;
}
