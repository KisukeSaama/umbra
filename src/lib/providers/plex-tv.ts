import "server-only";

import { env } from "@/lib/env";
import { BadRequestError, UpstreamError } from "@/lib/errors";
import { janus } from "@/lib/janus";

/**
 * Plex PIN sign-in flow (plex.tv), through Janus (slug `plex-tv`).
 *
 * Umbra never keeps the visitor's Plex token: it is used once to read their
 * account id, then dropped.
 *
 * Until the operator registers `plex.tv` in Janus and subscribes Umbra to that
 * slug, these calls are refused with 404/403 by the gateway. That is the
 * expected behaviour, not a fault to work around (see `JANUS.md`).
 */

const AUTH_APP_URL = "https://app.plex.tv/auth#";

export type PlexPin = { id: string; code: string };
export type PlexAccount = { id: string; username: string };

function headers() {
  return {
    "X-Plex-Product": env().PLEX_PRODUCT,
    "X-Plex-Client-Identifier": env().PLEX_CLIENT_ID,
  };
}

/** Opens a PIN. A POST is never replayed, so a failure surfaces as is. */
export async function createPin(): Promise<PlexPin> {
  const body = await janus<Record<string, unknown>>({
    slug: env().JANUS_PLEX_TV_SLUG,
    path: "/api/v2/pins",
    method: "POST",
    query: { strong: "true" },
    headers: headers(),
  });

  const id = field(body, "id");
  const code = field(body, "code");
  if (!id || !code)
    throw new UpstreamError(env().JANUS_PLEX_TV_SLUG, "incomplete plex.tv pin");
  return { id, code };
}

/** Page where the visitor confirms the PIN. */
export function authorizeUrl(code: string) {
  const params = new URLSearchParams({
    clientID: env().PLEX_CLIENT_ID,
    code,
    "context[device][product]": env().PLEX_PRODUCT,
  });
  return `${AUTH_APP_URL}?${params.toString()}`;
}

/** `null` until the visitor confirms the PIN. */
export async function pollPin(pinId: string): Promise<string | null> {
  if (!/^\d+$/.test(pinId)) throw new BadRequestError("error.invalidPin");
  const body = await janus<Record<string, unknown>>({
    slug: env().JANUS_PLEX_TV_SLUG,
    path: `/api/v2/pins/${pinId}`,
    headers: headers(),
  });
  return field(body, "authToken");
}

/** Identifies the token holder. The token is neither logged nor stored. */
export async function accountOf(authToken: string): Promise<PlexAccount> {
  const body = await janus<Record<string, unknown>>({
    slug: env().JANUS_PLEX_TV_SLUG,
    path: "/api/v2/user",
    headers: { ...headers(), "X-Plex-Token": authToken },
  });

  const id = field(body, "id");
  if (!id)
    throw new UpstreamError(
      env().JANUS_PLEX_TV_SLUG,
      "plex.tv account without id",
    );
  return {
    id,
    username: field(body, "username") ?? field(body, "title") ?? "member",
  };
}

export function field(
  body: Record<string, unknown>,
  key: string,
): string | null {
  const raw = body[key] ?? body[`@${key}`];
  if (typeof raw === "string") return raw.length > 0 ? raw : null;
  if (typeof raw === "number") return String(raw);
  return null;
}
