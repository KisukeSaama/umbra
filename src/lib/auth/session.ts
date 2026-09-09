import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, lt, ne } from "drizzle-orm";
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

  const [existing] = await db()
    .select()
    .from(accounts)
    .where(eq(accounts.plexAccountId, plexAccount.id))
    .limit(1);

  const columns = {
    id: accounts.id,
    username: accounts.username,
    role: accounts.role,
    status: accounts.status,
  };

  if (existing) {
    const role: AccountRole = isDesignatedAdmin ? "admin" : existing.role;
    // A blocked account stays blocked, whatever the configuration says.
    const status: AccountStatus =
      existing.status === "blocked"
        ? "blocked"
        : isDesignatedAdmin || config.AUTO_APPROVE_MEMBERS
          ? "approved"
          : existing.status;

    const [updated] = await db()
      .update(accounts)
      .set({
        username: plexAccount.username,
        role,
        status,
        lastSeenAt: new Date(),
      })
      .where(eq(accounts.id, existing.id))
      .returning(columns);
    return updated;
  }

  const [created] = await db()
    .insert(accounts)
    .values({
      plexAccountId: plexAccount.id,
      username: plexAccount.username,
      role: isDesignatedAdmin ? "admin" : "member",
      status:
        isDesignatedAdmin || config.AUTO_APPROVE_MEMBERS
          ? "approved"
          : "pending",
    })
    .returning(columns);
  return created;
}
