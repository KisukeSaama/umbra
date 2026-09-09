import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { REQUEST_STATUSES } from "@/lib/db/schema";
import { setRequestNote, updateRequestStatus } from "@/lib/domain/requests";

/**
 * Moves a request, or rewrites the word left on it.
 *
 * Both live on the same route because they are the same edit seen from the
 * administration: a body without a status changes nothing but the note, which
 * is what lets a word written when taking the ask in hand be corrected later
 * without pretending the request moved.
 */
const schema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  adminNote: z.string().max(500).nullish(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    await requireStaff();
    const { id } = await params;
    const { status, adminNote } = await jsonBody(request, schema);
    return status === undefined
      ? setRequestNote(id, adminNote ?? null)
      : updateRequestStatus(id, status, adminNote);
  });
}
