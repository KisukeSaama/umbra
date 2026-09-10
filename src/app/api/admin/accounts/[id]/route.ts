import { NextRequest } from "next/server";
import { z } from "zod";

import { idParam, jsonBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { ACCOUNT_STATUSES, ASSIGNABLE_ROLES } from "@/lib/db/schema";
import { updateAccount } from "@/lib/domain/accounts";
import { checkRate, perMinute } from "@/lib/rate-limit";

const schema = z.object({
  status: z.enum(ACCOUNT_STATUSES).optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const admin = await requireAdmin();
    checkRate("admin", admin.id, perMinute(30));
    const id = await idParam(params);
    return updateAccount(id, await jsonBody(request, schema), admin.id);
  });
}
