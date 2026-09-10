import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { safeEquals } from "@/lib/auth/compare";
import { db } from "@/lib/db";
import {
  accounts,
  sessions,
  type AccountRole,
  type AccountStatus,
} from "@/lib/db/schema";
import { env, isProduction } from "@/lib/env";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import type { PlexAccount } from "@/lib/providers/plex-tv";

export const SESSION_COOKIE = "umbra_session";

export type CurrentAccount = {
  id: string;
  username: string;
  role: AccountRole;
  status: AccountStatus;
};

/**
 * The session token lives in an `HttpOnly` cookie; the database only keeps its
 * digest, so a database leak cannot be replayed as a session.
 */
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * How many sessions one account keeps.
 *
 * A person is a handful of devices: a desktop, a phone, a tablet, a browser
 * they signed in with once. Nothing used to bound the list, so every sign-in
 * added a cookie that stayed valid for a month, and one of them lost with an
 * old device stayed valid too. Signing in again therefore lets the oldest go.
 */
const MAX_SESSIONS_PER_ACCOUNT = 8;

export async function createSession(accountId: string) {
  const token = randomBytes(32).toString("base64url");
  const ttlMs = env().SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);

  await db()
    .insert(sessions)
    .values({ tokenHash: hashToken(token), accountId, expiresAt });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    expires: expiresAt,
  });

  // Opportunistic cleanup: expired sessions do not deserve a dedicated job.
  await db().delete(sessions).where(lt(sessions.expiresAt, new Date()));

  // Everything past the newest few, which includes the one just written.
  await db().execute(sql`
    DELETE FROM session
     WHERE account_id = ${accountId}::uuid
       AND id NOT IN (
             SELECT id FROM session
              WHERE account_id = ${accountId}::uuid
              ORDER BY created_at DESC
              LIMIT ${MAX_SESSIONS_PER_ACCOUNT}
           )
  `);

  return { token, expiresAt };
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db()
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

/**
 * Account behind the current request, or `null`. Memoised for the render pass
 * so several components can ask without multiplying queries.
 */
export const currentAccount = cache(
  async (): Promise<CurrentAccount | null> => {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const [row] = await db()
      .select({
        id: accounts.id,
        username: accounts.username,
        role: accounts.role,
        status: accounts.status,
      })
      .from(sessions)
      .innerJoin(accounts, eq(accounts.id, sessions.accountId))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return row ?? null;
  },
);

/** Approved member. Everything on the community side goes through this. */
export async function requireMember(): Promise<CurrentAccount> {
  const account = await currentAccount();
  if (!account) throw new UnauthorizedError();
  if (account.status !== "approved")
    throw new ForbiddenError("error.accountPending");
  return account;
}

/**
 * The administration side, which the administrator shares with the assistants
 * they named. Everything under `/admin` goes through this, except the pages and
 * routes that hand out access: those are the administrator's alone.
 */
export async function requireStaff(): Promise<CurrentAccount> {
  const account = await requireMember();
  if (account.role === "member") throw new ForbiddenError();
  return account;
}

/** The single administrator. Naming an assistant is not delegated. */
export async function requireAdmin(): Promise<CurrentAccount> {
  const account = await requireMember();
  if (account.role !== "admin") throw new ForbiddenError();
  return account;
}

/**
 * Page-side guards.
 *
 * A layout does not stop the page under it from rendering, and it is not
 * re-run on a client-side navigation between sibling pages. Every page
 * therefore checks for itself, and answers with a redirect rather than an
 * error: on a page, "not signed in" is a place to go, not a fault.
 */
export async function requireMemberPage(): Promise<CurrentAccount> {
  const account = await currentAccount();
  if (!account) redirect("/sign-in");
  if (account.status !== "approved") redirect("/pending");
  return account;
}

export async function requireStaffPage(): Promise<CurrentAccount> {
  const account = await requireMemberPage();
  if (account.role === "member") redirect("/");
  return account;
}

export async function requireAdminPage(): Promise<CurrentAccount> {
  const account = await requireMemberPage();
  if (account.role !== "admin") redirect("/admin");
  return account;
}

/**
 * The account the development sign-in stands in for.
 *
 * Lives here rather than in the route because it writes to `account`, and no
 * route holds SQL (see `docs/architecture.md`). The route above it is what
 * decides whether the door is open at all: this is only the row behind it.
 */
export async function upsertDevAccount(
  username: string,
  role: AccountRole,
): Promise<CurrentAccount> {
  const plexAccountId = `dev:${username}`;
  const values = {
    plexAccountId,
    username,
    role,
    status: "approved" as const,
  };

  // There is room for one administrator, so the previous one steps aside
  // rather than the insert failing on the unique index.
  if (role === "admin") {
    await db()
      .update(accounts)
      .set({ role: "assistant" })
      .where(
        and(
          eq(accounts.role, "admin"),
          ne(accounts.plexAccountId, plexAccountId),
        ),
      );
  }

  const [account] = await db()
    .insert(accounts)
    .values(values)
    .onConflictDoUpdate({ target: accounts.plexAccountId, set: values })
    .returning({
      id: accounts.id,
      username: accounts.username,
      role: accounts.role,
      status: accounts.status,
    });

  return account;
}

/**
 * Ends every session of an account. Called when access is withdrawn, so a
 * blocked or demoted account does not keep a working cookie until it expires.
 */
export async function revokeSessions(accountId: string) {
  await db().delete(sessions).where(eq(sessions.accountId, accountId));
}

/**
 * Creates or refreshes the local account matching a Plex account.
 *
 * The account named by `ADMIN_PLEX_ACCOUNT_ID` becomes the administrator, and
 * any previous one steps down to assistant. Others land as pending unless
 * `AUTO_APPROVE_MEMBERS` is set, and keep the role they already had: an
 * assistant stays an assistant across sign-ins.
 */
export async function upsertAccountFromPlex(
  plexAccount: PlexAccount,
): Promise<CurrentAccount> {
  const config = env();
  const isDesignatedAdmin =
    config.ADMIN_PLEX_ACCOUNT_ID !== undefined &&
    safeEquals(config.ADMIN_PLEX_ACCOUNT_ID, plexAccount.id);

  // There is room for one administrator only, and the database says so. If the
  // configuration now names someone else, the previous administrator steps down
  // to assistant instead of every sign-in failing on the unique index.
  if (isDesignatedAdmin) {
    await db()
      .update(accounts)
      .set({ role: "assistant" })
      .where(
        and(
          eq(accounts.role, "admin"),
          ne(accounts.plexAccountId, plexAccount.id),
        ),
      );
  }

  const columns = {
    id: accounts.id,
    username: accounts.username,
    role: accounts.role,
    status: accounts.status,
  };

  const approveOnSight = isDesignatedAdmin || config.AUTO_APPROVE_MEMBERS;

  /*
   * One statement, because a sign-in is not a conversation.
   *
   * Read first and written after, two browsers finishing the same first
   * sign-in in the same instant both saw no account and both inserted one: the
   * second was refused by the unique index and the person was shown a server
   * error on the way in. What is being said here is unchanged, only said in
   * SQL: an account keeps the role it already had unless the configuration
   * names it as the administrator, and a blocked account stays blocked
   * whatever the configuration says.
   */
  const [account] = await db()
    .insert(accounts)
    .values({
      plexAccountId: plexAccount.id,
      username: plexAccount.username,
      role: isDesignatedAdmin ? "admin" : "member",
      status: approveOnSight ? "approved" : "pending",
    })
    .onConflictDoUpdate({
      target: accounts.plexAccountId,
      set: {
        username: plexAccount.username,
        lastSeenAt: new Date(),
        role: isDesignatedAdmin ? sql`'admin'` : sql`${accounts.role}`,
        status: sql`CASE
          WHEN ${accounts.status} = 'blocked' THEN 'blocked'
          WHEN ${approveOnSight} THEN 'approved'
          ELSE ${accounts.status}
        END`,
      },
    })
    .returning(columns);

  return account;
}
