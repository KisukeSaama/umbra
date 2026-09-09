import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { REQUEST_STATUSES } from "@/lib/db/schema";
import { updateRequestStatus } from "@/lib/domain/requests";

const schema = z.object({
  status: z.enum(REQUEST_STATUSES),
  adminNote: z.string().max(500).nullish(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    await requireAdmin();
    const { id } = await params;
    const { status, adminNote } = await jsonBody(request, schema);
    return updateRequestStatus(id, status, adminNote);
  });
}
