import "server-only";

import { env } from "@/lib/env";
import { RateLimitedError, UpstreamError } from "@/lib/errors";

/**
 * Single client to the Janus gateway (see `JANUS.md`).
 *
 * Every third-party API call goes through here. The two identifying headers are
 * set once, never at a call site.
 *
 * What Janus already does, and we therefore do not reimplement: response cache,
 * retries and backoff, circuit breaking, quotas, secret storage, OAuth2 tokens.
 */

/** Janus waits 30 s upstream, so the client must wait longer than that. */
const CLIENT_TIMEOUT_MS = 40_000;

type JanusRequest = {
  slug: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  /**
   * Refuse an answer served from the gateway cache. Set on calls that carry a
   * member's own credential: a cached answer there may belong to someone else.
   */
  refuseCached?: boolean;
};

export async function janus<T = unknown>({
  slug,
  path,
  query,
  headers,
  method = "GET",
  refuseCached = false,
}: JanusRequest): Promise<T> {
  const config = env();
  const url = new URL(
    `${config.JANUS_URL.replace(/\/$/, "")}/gateway/${slug}${path}`,
  );
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      // A call site's headers come first, so nothing it sends can stand in
      // for the two that identify this service.
      headers: {
        Accept: "application/json",
        ...headers,
        "X-Janus-Application-Id": config.JANUS_APPLICATION_ID,
        "X-Janus-Api-Key": config.JANUS_API_KEY,
      },
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      // Janus holds the cache; Next's would duplicate it and hide the gateway
      // headers we log.
      cache: "no-store",
    });
  } catch (cause) {
    console.error(`[janus] network failure slug=${slug} path=${path}`, cause);
    const reason =
      cause instanceof Error && cause.name === "TimeoutError"
        ? `no answer within ${CLIENT_TIMEOUT_MS / 1000} s`
        : "network failure";
    throw new UpstreamError(slug, `${reason} on ${path}`, {
      origin: "network",
    });
  }

  const correlationId = response.headers.get("X-Janus-Correlation-Id") ?? "";
  const isGatewayRefusal = (
    response.headers.get("Content-Type") ?? ""
  ).startsWith("application/problem+json");

  if (response.ok) {
    const cache = (response.headers.get("X-Janus-Cache") ?? "").toUpperCase();
    if (refuseCached && (cache === "HIT" || cache === "STALE")) {
      console.error(
        `[janus] cached answer refused slug=${slug} path=${path} cache=${cache} ` +
          `correlationId=${correlationId}`,
      );
      throw new UpstreamError(slug, `cached answer refused on ${path}`);
    }
    try {
      return (await response.json()) as T;
    } catch (cause) {
      console.error(
        `[janus] unreadable response slug=${slug} path=${path}`,
        cause,
      );
      throw new UpstreamError(slug, `unreadable response on ${path}`);
    }
  }

  const payload = await response.text().catch(() => "");
  const detail = isGatewayRefusal
    ? (safeJson(payload)?.detail ?? "gateway refusal")
    : payload.slice(0, 300);
  console.warn(
    `[janus] call refused slug=${slug} path=${path} status=${response.status} ` +
      `gateway=${isGatewayRefusal} correlationId=${correlationId} detail=${detail}`,
  );

  if (response.status === 429) {
    throw new RateLimitedError(
      response.headers.get("Retry-After") ?? undefined,
    );
  }
  /*
   * A refusal from the gateway carries its reason in `detail`, and that reason
   * is what tells an operator which record to fix: a grant missing, a path
   * outside what was given, a key rotated. So it is recorded with the error,
   * not only logged. An answer from the API itself keeps to its status: its
   * body is the provider's, and can say anything.
   */
  if (isGatewayRefusal) {
    const reason =
      response.status === 404
        ? `no API at slug "${slug}", or its record is disabled`
        : `status ${response.status} on ${path}`;
    throw new UpstreamError(
      slug,
      `${reason}: ${String(detail).slice(0, 200)}`,
      {
        origin: "gateway",
        status: response.status,
      },
    );
  }
  throw new UpstreamError(slug, `status ${response.status} on ${path}`, {
    origin: "upstream",
    status: response.status,
  });
}

function safeJson(raw: string): { detail?: string } | null {
  try {
    return JSON.parse(raw) as { detail?: string };
  } catch {
    return null;
  }
}
