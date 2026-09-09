import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { NotFoundError } from "@/lib/errors";

const schema = z.object({
  username: z.string().min(2).max(40).default("dev"),
  admin: z.boolean().default(true),
});

/**
 * Development sign-in.
 *
 * Plex sign-in needs `plex.tv` registered in Janus, which is an operator step.
 * Until then, and for local work in general, this route creates a session with
 * no external call.
 *
 * Closed unless `DEV_LOGIN` is on, and it answers 404 rather than 403 so its
 * existence is not advertised in production.
 */
export async function POST(request: NextRequest) {
  return route(async () => {
    if (!env().DEV_LOGIN || env().NODE_ENV === "production")
      throw new NotFoundError();

    const { username, admin } = await jsonBody(request, schema);
    const plexAccountId = `dev:${username}`;
    const values = {
      plexAccountId,
      username,
      role: admin ? ("admin" as const) : ("member" as const),
      status: "approved" as const,
    };

    const [account] = await db()
      .insert(accounts)
      .values(values)
      .onConflictDoUpdate({ target: accounts.plexAccountId, set: values })
      .returning({
        id: accounts.id,
        username: accounts.username,
        role: accounts.role,
      });

    await createSession(account.id);
    return { status: "approved" as const, account };
  });
}
