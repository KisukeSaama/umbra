import { NextRequest } from "next/server";
import { z } from "zod";

import { idParam, jsonBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { deletePoll, setPollActive } from "@/lib/domain/polls";
import { checkRate, perMinute } from "@/lib/rate-limit";

const schema = z.object({ active: z.boolean() });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const account = await requireStaff();
    checkRate("admin", account.id, perMinute(60));
    const id = await idParam(params);
    const { active } = await jsonBody(request, schema);
    return setPollActive(id, active);
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const account = await requireStaff();
    checkRate("admin", account.id, perMinute(60));
    const id = await idParam(params);
    return deletePoll(id);
  });
}
