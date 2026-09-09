import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { revokeSessions } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  accounts,
  type AccountRole,
  type AccountStatus,
} from "@/lib/db/schema";
import { BadRequestError, NotFoundError } from "@/lib/errors";

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

export async function listAccounts(): Promise<AccountRow[]> {
  return db()
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
