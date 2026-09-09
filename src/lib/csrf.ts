/**
 * Cross-site request forgery guard for the REST surface.
 *
 * The session cookie is `SameSite=Lax`, which already keeps it out of
 * cross-site `POST`s in every current browser. This is the second layer: a
 * browser names where a request comes from, and a mutation whose origin is not
 * this host is refused before any handler runs.
 *
 * A request without `Origin` and without `Sec-Fetch-Site` is not a browser
 * form or fetch: the sync worker and command-line tools send neither, and they
 * carry no cookie, so nothing is gained by refusing them.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafeMethod(method: string) {
  return SAFE_METHODS.has(method.toUpperCase());
}

/**
 * `true` when the request may be a forged cross-site mutation.
 *
 * `host` is the host the server believes it is serving, taken from the
 * `Host` header (or `X-Forwarded-Host` behind the reverse proxy).
 */
export function isCrossSiteMutation(
  method: string,
  headers: Pick<Headers, "get">,
): boolean {
  if (isSafeMethod(method)) return false;

  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "none") return false;
  if (fetchSite === "cross-site" || fetchSite === "same-site") return true;

  const origin = headers.get("origin");
  if (!origin) return false;

  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  return originHost.toLowerCase() !== host.split(",")[0].trim().toLowerCase();
}
