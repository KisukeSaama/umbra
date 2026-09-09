import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { REPORT_STATUSES } from "@/lib/db/schema";
import { setReportNote, updateReportStatus } from "@/lib/domain/reports";

/**
 * Moves a report, or rewrites the word left on it.
 *
 * The legal moves live in `src/lib/reports/reasons.ts` and are checked in the
 * domain, so an illegal one is a conflict rather than a silent write, whether
 * it came from the interface or from a stale tab.
 *
 * A body without a status changes nothing but the note, which is what lets a
 * word written while taking the report up be corrected later without pretending
 * the report moved.
 */
const schema = z.object({
  status: z.enum(REPORT_STATUSES).optional(),
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
      ? setReportNote(id, adminNote ?? null)
      : updateReportStatus(id, status, adminNote);
  });
}
