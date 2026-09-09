import { NextRequest } from "next/server";

import { route } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import { withdrawReport } from "@/lib/domain/reports";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * Leaves a report. A report can be shared, so this removes the member from it
 * and only deletes the report itself when nothing has been done to it and
 * nobody else is waiting on it. That rule lives in the domain.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const account = await requireMember();
    checkRate("reports", account.id, perMinute(5));

    const { id } = await params;
    return withdrawReport(id, account.id);
  });
}
