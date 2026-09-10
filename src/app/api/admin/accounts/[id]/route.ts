import { NextRequest } from "next/server";
import { z } from "zod";

import { idParam, jsonBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { ASSIGNABLE_ROLES } from "@/lib/db/schema";
import { updateAccountRole } from "@/lib/domain/accounts";
import { checkRate, perMinute } from "@/lib/rate-limit";

const schema = z.object({ role: z.enum(ASSIGNABLE_ROLES) });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const admin = await requireAdmin();
    checkRate("admin", admin.id, perMinute(30));
    const id = await idParam(params);
    const { role } = await jsonBody(request, schema);
    return updateAccountRole(id, role, admin.id);
  });
}
