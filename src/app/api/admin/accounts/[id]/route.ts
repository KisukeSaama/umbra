import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { ACCOUNT_ROLES, ACCOUNT_STATUSES } from "@/lib/db/schema";
import { updateAccount } from "@/lib/domain/accounts";

const schema = z.object({
  status: z.enum(ACCOUNT_STATUSES).optional(),
  role: z.enum(ACCOUNT_ROLES).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    return updateAccount(id, await jsonBody(request, schema), admin.id);
  });
}
