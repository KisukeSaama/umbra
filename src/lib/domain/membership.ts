import "server-only";

import { inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, sessions, tasteProfiles } from "@/lib/db/schema";
import { latestMetric, setMetric } from "@/lib/domain/analytics";
import { env } from "@/lib/env";
import { UpstreamError } from "@/lib/errors";
import { plexLibrary } from "@/lib/providers/plex";
import { sharedAccountIds } from "@/lib/providers/plex-tv";

/**
 * Who the media server is currently shared with.
 *
 * Umbra keeps no list of members: plex.tv holds it, and this reads it. Access
 * is decided at sign-in from the visitor's own view of their servers (see
 * `docs/adr/0014-only-members-of-the-server.md`); what is read here is the
 * owner's view, which is what lets the scheduled sweep act between two
 * sign-ins, and what gives the community a real size.
 */

/** The share list, or a failure. Used where an incomplete answer must stop. */
async function shares(): Promise<{ slug: string; ids: Set<string> }> {
  const slug = env().JANUS_PLEX_OWNER_SLUG;
  if (!slug) throw new UpstreamError("plex-tv-owner", "no owner slug set");

  const machineIdentifier = await plexLibrary.machineIdentifier();
  return { slug, ids: await sharedAccountIds(slug, machineIdentifier) };
}

/**
 * The same list, or `null` when it cannot be had.
 *
 * A page that shows who is still on the server must render without it, and a
 * job that only refines its own work must keep working without it. Nothing
 * that withdraws access uses this: refusing on silence is the sweep's job.
 */
export async function serverMembersOrNull(): Promise<Set<string> | null> {
  if (!env().JANUS_PLEX_OWNER_SLUG) return null;
  try {
    const { ids } = await shares();
    return ids.size > 0 ? ids : null;
  } catch (error) {
    console.warn("[membership] share list unavailable", error);
    return null;
  }
}

/**
 * How many people have the server, as the last sweep counted them.
 *
 * Read from the daily counters rather than from plex.tv, so a page never waits
 * on the gateway to draw a number. `null` until a sweep has run.
 */
export async function serverMemberCount(): Promise<number | null> {
  return latestMetric("server_members");
}

/**
 * Ends the sessions of everyone the server is no longer shared with, and
 * forgets what was aggregated about them.
 *
 * The sign-in gate already refuses them, but a cookie handed out before the
 * share was taken back would keep working until it expired. This is what closes
 * that window, and it needs the owner's view of the shares, so it does nothing
 * at all until `JANUS_PLEX_OWNER_SLUG` is configured.
 *
 * The account itself is left alone on purpose: nothing here decides anything,
 * it only withdraws what plex.tv has already withdrawn. Sharing the server
 * again is therefore enough to let somebody back in, with the role they had. Their
 * taste profile is not kept for that day: it is rebuilt from a rolling window
 * on every sync anyway, and keeping it for somebody who left would be keeping
 * more than the minimum (see `docs/adr/0007-aggregated-taste-profile.md`).
 */
export async function revokeDepartedMembers(): Promise<number> {
  const config = env();
  if (!config.JANUS_PLEX_OWNER_SLUG) return 0;

  const { slug, ids } = await shares();

  /*
   * An empty list is refused rather than acted upon.
   *
   * A server is always shared with somebody here, so nothing is the shape of a
   * failed or truncated answer, and acting on it would sign every member out
   * at once. Same reasoning as the library sweep in `plex.ts`.
   */
  if (ids.size === 0)
    throw new UpstreamError(slug, "empty share list, sweep refused");

  await setMetric("server_members", ids.size);

  const known = await db()
    .select({ id: accounts.id, plexAccountId: accounts.plexAccountId })
    .from(accounts);

  const departed = known.filter((account) => isDeparted(account, ids, config));
  if (departed.length === 0) return 0;

  const accountIds = departed.map((account) => account.id);
  await db().delete(sessions).where(inArray(sessions.accountId, accountIds));
  await db()
    .delete(tasteProfiles)
    .where(inArray(tasteProfiles.accountId, accountIds));
  return departed.length;
}

/**
 * A development account has no Plex identity to compare, and the owner is never
 * in a list of the people their own server is shared with.
 */
function isDeparted(
  account: { plexAccountId: string },
  shared: Set<string>,
  config: { ADMIN_PLEX_ACCOUNT_ID?: string },
): boolean {
  if (!/^\d+$/.test(account.plexAccountId)) return false;
  if (account.plexAccountId === config.ADMIN_PLEX_ACCOUNT_ID) return false;
  return !shared.has(account.plexAccountId);
}

/** Whether one account still has the server, when the list can be had. */
export function stillOnServer(
  plexAccountId: string,
  shared: Set<string> | null,
  adminPlexAccountId = env().ADMIN_PLEX_ACCOUNT_ID,
): boolean | null {
  if (!shared) return null;
  if (!/^\d+$/.test(plexAccountId)) return null;
  if (plexAccountId === adminPlexAccountId) return true;
  return shared.has(plexAccountId);
}
