import { NextRequest } from "next/server";
import { z } from "zod";

import { idParam, jsonBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { setStaffNote, STAFF_NOTE_MAX } from "@/lib/domain/accounts";
import { checkRate, perMinute } from "@/lib/rate-limit";

const schema = z.object({
  staffNote: z.string().max(STAFF_NOTE_MAX).nullish(),
});

/**
 * The staff's reminder of who an account is.
 *
 * Kept apart from the role route on purpose: that one is the administrator's
 * alone, this one is open to the assistants, who read the same list and need
 * the same reminder.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const staff = await requireStaff();
    checkRate("admin", staff.id, perMinute(30));
    const id = await idParam(params);
    const { staffNote } = await jsonBody(request, schema);
    return setStaffNote(id, staffNote ?? null);
  });
}
