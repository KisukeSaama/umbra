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
};

export async function janus<T = unknown>({
  slug,
  path,
  query,
  headers,
  method = "GET",
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
      headers: {
        "X-Janus-Application-Id": config.JANUS_APPLICATION_ID,
        "X-Janus-Api-Key": config.JANUS_API_KEY,
        Accept: "application/json",
        ...headers,
      },
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      // Janus holds the cache; Next's would duplicate it and hide the gateway
      // headers we log.
      cache: "no-store",
    });
  } catch (cause) {
    console.error(`[janus] network failure slug=${slug} path=${path}`, cause);
    throw new UpstreamError(slug);
  }

  const correlationId = response.headers.get("X-Janus-Correlation-Id") ?? "";
  const isGatewayRefusal = (
    response.headers.get("Content-Type") ?? ""
  ).startsWith("application/problem+json");

  if (response.ok) {
    try {
      return (await response.json()) as T;
    } catch (cause) {
      console.error(
        `[janus] unreadable response slug=${slug} path=${path}`,
        cause,
      );
      throw new UpstreamError(slug);
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
  if (response.status === 404 && isGatewayRefusal) {
    throw new UpstreamError(slug, `no API registered under slug "${slug}"`);
  }
  throw new UpstreamError(slug);
}

function safeJson(raw: string): { detail?: string } | null {
  try {
    return JSON.parse(raw) as { detail?: string };
  } catch {
    return null;
  }
}
