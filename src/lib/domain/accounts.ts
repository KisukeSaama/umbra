import "server-only";

import { desc, eq, inArray, sql } from "drizzle-orm";

import { revokeSessions } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  accounts,
  type AccountRole,
  type AccountStatus,
  sessions,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { BadRequestError, NotFoundError, UpstreamError } from "@/lib/errors";
import { plexLibrary } from "@/lib/providers/plex";
import { sharedAccountIds } from "@/lib/providers/plex-tv";

/**
 * Accounts.
 *
 * An account is a Plex identity plus a status. There is no profile, no e-mail
 * and no public presence: the only reason accounts exist is to keep the place
 * private and to count one vote per person.
 */

export type AccountRow = {
  id: string;
  username: string;
  role: AccountRole;
  status: AccountStatus;
  createdAt: Date;
  lastSeenAt: Date;
};

export async function listAccounts(
  /** The slice to read, when the caller pages. Everything, when it does not. */
  window?: { limit: number; offset: number },
): Promise<AccountRow[]> {
  const query = db()
    .select({
      id: accounts.id,
      username: accounts.username,
      role: accounts.role,
      status: accounts.status,
      createdAt: accounts.createdAt,
      lastSeenAt: accounts.lastSeenAt,
    })
    .from(accounts)
    .orderBy(desc(accounts.createdAt));

  return window ? query.limit(window.limit).offset(window.offset) : query;
}

/** How many accounts there are, for the pager above the list. */
export async function countAccounts(): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(accounts);
  return row?.count ?? 0;
}

export async function pendingAccountCount(): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(accounts)
    .where(eq(accounts.status, "pending"));
  return row?.count ?? 0;
}

/**
 * Approves, blocks, or names an assistant.
 *
 * The administrator is not a role this hands out: there is one, decided by
 * `ADMIN_PLEX_ACCOUNT_ID` and enforced by the database. What can be granted here
 * is help, `member` to `assistant` and back.
 */
export async function updateAccount(
  accountId: string,
  input: { status?: AccountStatus; role?: AccountRole },
  actingAccountId: string,
) {
  if (input.status === undefined && input.role === undefined) {
    throw new BadRequestError("error.badRequest");
  }

  // An administrator cannot lock themselves out of their own instance.
  if (accountId === actingAccountId) {
    throw new BadRequestError("error.badRequest");
  }

  // The administrator is designated by configuration, never promoted from a
  // list, and never demoted from one either.
  if (input.role === "admin") throw new BadRequestError("error.badRequest");

  const [target] = await db()
    .select({ role: accounts.role })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!target) throw new NotFoundError("error.notFound");
  if (target.role === "admin") throw new BadRequestError("error.badRequest");

  const [row] = await db()
    .update(accounts)
    .set(input)
    .where(eq(accounts.id, accountId))
    .returning({
      id: accounts.id,
      status: accounts.status,
      role: accounts.role,
    });
  if (!row) throw new NotFoundError("error.notFound");

  // Withdrawing access ends the sessions that carried it: the next request
  // from that browser starts from the sign-in screen, not from a stale cookie.
  // A role change needs nothing: the role is read on every request.
  if (input.status !== undefined && input.status !== "approved")
    await revokeSessions(accountId);

  return row;
}

/**
 * Ends the sessions of everyone the server is no longer shared with.
 *
 * The sign-in gate already refuses them, but a cookie handed out before the
 * share was taken back would keep working until it expired. This is what closes
 * that window, and it needs the owner's view of the shares, so it does nothing
 * at all until `JANUS_PLEX_OWNER_SLUG` is configured.
 *
 * Statuses are left alone on purpose: nothing here decides anything, it only
 * withdraws what plex.tv has already withdrawn. Re-sharing the server is
 * therefore enough to let somebody back in, with the status they had.
 */
export async function revokeDepartedMembers(): Promise<number> {
  const config = env();
  const ownerSlug = config.JANUS_PLEX_OWNER_SLUG;
  if (!ownerSlug || !config.REQUIRE_SERVER_MEMBERSHIP) return 0;

  const machineIdentifier = await plexLibrary.machineIdentifier();
  const shared = await sharedAccountIds(ownerSlug, machineIdentifier);

  /*
   * An empty list is refused rather than acted upon.
   *
   * A server is always shared with somebody here, so nothing is the shape of a
   * failed or truncated answer, and acting on it would sign every member out
   * at once. Same reasoning as the library sweep in `plex.ts`.
   */
  if (shared.size === 0)
    throw new UpstreamError(ownerSlug, "empty share list, sweep refused");

  const signedIn = await db()
    .selectDistinct({
      id: accounts.id,
      plexAccountId: accounts.plexAccountId,
    })
    .from(accounts)
    .innerJoin(sessions, eq(sessions.accountId, accounts.id));

  const departed = signedIn
    .filter((account) => {
      // A development account has no Plex identity to compare, and the owner is
      // never in a list of the people their own server is shared with.
      if (!/^\d+$/.test(account.plexAccountId)) return false;
      if (account.plexAccountId === config.ADMIN_PLEX_ACCOUNT_ID) return false;
      return !shared.has(account.plexAccountId);
    })
    .map((account) => account.id);

  if (departed.length === 0) return 0;

  await db().delete(sessions).where(inArray(sessions.accountId, departed));
  return departed.length;
}
