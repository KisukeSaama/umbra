import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { FUNDING_STATUSES } from "@/lib/db/schema";
import { updateGoal } from "@/lib/domain/funding";

const schema = z.object({
  title: z.string().min(2).max(120).optional(),
  description: z.string().max(1000).nullish(),
  targetAmountCents: z.number().int().positive().optional(),
  status: z.enum(FUNDING_STATUSES).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    await requireAdmin();
    const { id } = await params;
    const input = await jsonBody(request, schema);
    return updateGoal(id, {
      ...input,
      description: input.description ?? undefined,
    });
  });
}
