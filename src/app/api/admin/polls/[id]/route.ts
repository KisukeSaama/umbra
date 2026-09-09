import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { deletePoll, setPollActive } from "@/lib/domain/polls";

const schema = z.object({ active: z.boolean() });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    await requireStaff();
    const { id } = await params;
    const { active } = await jsonBody(request, schema);
    return setPollActive(id, active);
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    await requireStaff();
    const { id } = await params;
    return deletePoll(id);
  });
}
