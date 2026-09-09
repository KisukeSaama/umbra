import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { FUNDING_STATUSES } from "@/lib/db/schema";
import { createGoal } from "@/lib/domain/funding";

const schema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(1000).nullish(),
  targetAmountCents: z.number().int().positive(),
  currency: z.string().length(3).default("EUR"),
  status: z.enum(FUNDING_STATUSES).default("draft"),
});

export async function POST(request: NextRequest) {
  return route(async () => {
    await requireAdmin();
    return createGoal(await jsonBody(request, schema));
  });
}
