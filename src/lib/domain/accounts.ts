import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, type AccountRole } from "@/lib/db/schema";
import { serverMembersOrNull, stillOnServer } from "@/lib/domain/membership";
import { BadRequestError, NotFoundError } from "@/lib/errors";

/**
 * Accounts.
 *
 * An account is a Plex identity plus a role. There is no profile, no e-mail, no
 * public presence and no status: it exists because plex.tv confirmed the server
 * is shared with that person, and that is all it takes to be a member. What
 * accounts are for is keeping the place private and counting one vote per
 * person.
 */

export type AccountRow = {
  id: string;
  username: string;
  role: AccountRole;
  createdAt: Date;
  lastSeenAt: Date;
  /**
   * Whether the media server is still shared with this person, or `null` when
   * the share list cannot be had and the question stays unanswered.
   *
   * The Plex id it is computed from stays here: the administration is shown an
   * answer, never an identifier it has no use for.
   */
  onServer: boolean | null;
};

export async function listAccounts(
  /** The slice to read, when the caller pages. Everything, when it does not. */
  window?: { limit: number; offset: number },
): Promise<AccountRow[]> {
  const query = db()
    .select({
      id: accounts.id,
      plexAccountId: accounts.plexAccountId,
      username: accounts.username,
      role: accounts.role,
      createdAt: accounts.createdAt,
      lastSeenAt: accounts.lastSeenAt,
    })
    .from(accounts)
    .orderBy(desc(accounts.createdAt));

  const [rows, shared] = await Promise.all([
    window ? query.limit(window.limit).offset(window.offset) : query,
    serverMembersOrNull(),
  ]);

  return rows.map(({ plexAccountId, ...row }) => ({
    ...row,
    onServer: stillOnServer(plexAccountId, shared),
  }));
}

/**
 * How many accounts there are: the pager above the list, and the denominator
 * of a participation rate.
 *
 * Not the number of people the server is shared with, which is larger and
 * always will be: having the server does not mean having opened Umbra, and a
 * question is only asked of those who did.
 */
export async function countAccounts(): Promise<number> {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(accounts);
  return row?.count ?? 0;
}

/**
 * Names an assistant, or unnames one.
 *
 * The administrator is not a role this hands out: there is one, decided by
 * `ADMIN_PLEX_ACCOUNT_ID` and enforced by the database. What can be granted here
 * is help, `member` to `assistant` and back. Access itself is not decided here
 * at all: it follows the share on plex.tv.
 */
export async function updateAccountRole(
  accountId: string,
  role: AccountRole,
  actingAccountId: string,
) {
  if (accountId === actingAccountId) {
    throw new BadRequestError("error.badRequest");
  }

  // The administrator is designated by configuration, never promoted from a
  // list, and never demoted from one either.
  if (role === "admin") throw new BadRequestError("error.badRequest");

  const [target] = await db()
    .select({ role: accounts.role })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!target) throw new NotFoundError("error.notFound");
  if (target.role === "admin") throw new BadRequestError("error.badRequest");

  // A role change ends no session: the role is read on every request.
  const [row] = await db()
    .update(accounts)
    .set({ role })
    .where(eq(accounts.id, accountId))
    .returning({ id: accounts.id, role: accounts.role });
  if (!row) throw new NotFoundError("error.notFound");

  return row;
}
