import { RateLimitedError } from "@/lib/errors";

/**
 * In-memory fixed-window rate limiting.
 *
 * Umbra runs as a single instance, so a map is enough and saves a dependency.
 * It guards writes (requests, votes, sign-in pins), not reads.
 */

export type Quota = { max: number; windowMs: number };

export const perMinute = (max: number): Quota => ({ max, windowMs: 60_000 });

type Window = { startedAt: number; count: number };

const windows = new Map<string, Window>();

export function checkRate(
  bucket: string,
  key: string,
  quota: Quota,
  now = Date.now(),
) {
  // Opportunistic purge: the map stays the size of recent traffic.
  const ttl = Math.max(quota.windowMs * 4, 60_000);
  for (const [entryKey, window] of windows) {
    if (now - window.startedAt > ttl) windows.delete(entryKey);
  }

  const mapKey = `${bucket}:${key}`;
  const window = windows.get(mapKey);
  if (!window || now - window.startedAt >= quota.windowMs) {
    windows.set(mapKey, { startedAt: now, count: 1 });
    return;
  }

  window.count += 1;
  if (window.count > quota.max) throw new RateLimitedError();
}

/**
 * Address behind an anonymous request, for the buckets keyed on it.
 *
 * Umbra sits behind Cloudflare and Traefik. Cloudflare names the visitor in
 * `CF-Connecting-IP`, which nothing upstream of it can forge; Traefik names its
 * own peer in `X-Real-IP`. `X-Forwarded-For` comes last: its first entry is
 * whatever the visitor chose to send, so it is only a hint, never the key on
 * its own. The anonymous buckets pair it with a global quota for that reason.
 */
export function clientAddress(headers: Pick<Headers, "get">): string {
  const direct =
    headers.get("cf-connecting-ip")?.trim() || headers.get("x-real-ip")?.trim();
  if (direct) return direct;

  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}

/** Test-only. */
export function resetRateLimits() {
  windows.clear();
}
