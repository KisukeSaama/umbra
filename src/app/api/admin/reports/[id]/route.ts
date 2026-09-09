import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { REPORT_STATUSES } from "@/lib/db/schema";
import { updateReportStatus } from "@/lib/domain/reports";

/**
 * Moves a report.
 *
 * The legal moves live in `src/lib/reports/reasons.ts` and are checked in the
 * domain, so an illegal one is a conflict rather than a silent write, whether
 * it came from the interface or from a stale tab.
 */
const schema = z.object({ status: z.enum(REPORT_STATUSES) });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    await requireAdmin();
    const { id } = await params;
    const { status } = await jsonBody(request, schema);
    return updateReportStatus(id, status);
  });
}
