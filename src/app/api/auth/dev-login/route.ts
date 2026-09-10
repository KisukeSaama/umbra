import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { createSession, upsertDevAccount } from "@/lib/auth/session";
import { ACCOUNT_ROLES } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { NotFoundError } from "@/lib/errors";

const schema = z.object({
  username: z.string().min(2).max(40).default("dev"),
  admin: z.boolean().default(true),
  /** Overrides `admin`, so an assistant can be signed in locally too. */
  role: z.enum(ACCOUNT_ROLES).optional(),
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

    const body = await jsonBody(request, schema);
    const role = body.role ?? (body.admin ? "admin" : "member");
    const account = await upsertDevAccount(body.username, role);

    await createSession(account.id);
    return {
      account: {
        id: account.id,
        username: account.username,
        role: account.role,
      },
    };
  });
}
