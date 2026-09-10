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

/**
 * Does the token holder currently have this server shared with them?
 *
 * `/api/v2/resources` is the visitor's own list of servers, so it answers for
 * the person signing in and it answers now: a share taken back on plex.tv is
 * gone from that list immediately. The token used is the one already in hand
 * during the PIN flow, which is why this needs no owner credential and keeps
 * nothing.
 */
export async function hasServerAccess(
  authToken: string,
  machineIdentifier: string,
): Promise<boolean> {
  const body = await janus<unknown>({
    slug: env().JANUS_PLEX_TV_SLUG,
    path: "/api/v2/resources",
    query: { includeHttps: "1" },
    headers: { ...headers(), "X-Plex-Token": authToken },
  });
  return listsServer(body, machineIdentifier);
}

/**
 * Reads the resource list.
 *
 * plex.tv answers with a bare array here, but the same payload converted from
 * XML arrives wrapped and with prefixed attributes, so both shapes are read
 * rather than one being bet on.
 */
export function listsServer(body: unknown, machineIdentifier: string): boolean {
  return resourceRows(body).some((row) => {
    const id = field(row, "clientIdentifier");
    if (id !== machineIdentifier) return false;
    const provides = field(row, "provides");
    return provides === null || provides.split(",").includes("server");
  });
}

function resourceRows(body: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(body)
    ? body
    : isObject(body)
      ? ((isObject(body.MediaContainer) ? body.MediaContainer.Device : null) ??
        body.Device ??
        body.resources)
      : null;
  if (Array.isArray(rows)) return rows.filter(isObject);
  if (isObject(rows)) return [rows];
  return [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The Plex account ids the server is currently shared with.
 *
 * Read with the owner's own credential, which Janus holds under a slug of its
 * own (`JANUS_PLEX_OWNER_SLUG`): it never enters this repository, and the slug
 * used by the sign-in flow stays unauthenticated. The owner is not in this
 * list, since a server is not shared with the person who owns it.
 */
export async function sharedAccountIds(
  ownerSlug: string,
  machineIdentifier: string,
): Promise<Set<string>> {
  if (!/^[0-9a-f]{16,64}$/i.test(machineIdentifier))
    throw new BadRequestError("error.badRequest");

  const body = await janus<unknown>({
    slug: ownerSlug,
    path: `/api/servers/${machineIdentifier}/shared_servers`,
    headers: headers(),
  });
  return new Set(sharedIdsFrom(body));
}

/** Reads the share list, whichever shape the XML conversion produced. */
export function sharedIdsFrom(body: unknown): string[] {
  return rowsUnder(body, "SharedServer")
    .map((row) => field(row, "userID") ?? field(row, "userId"))
    .filter((id): id is string => id !== null);
}

function rowsUnder(body: unknown, key: string): Record<string, unknown>[] {
  if (!isObject(body)) return [];
  const container = isObject(body.MediaContainer) ? body.MediaContainer : body;
  const rows = container[key];
  if (Array.isArray(rows)) return rows.filter(isObject);
  if (isObject(rows)) return [rows];
  return [];
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
