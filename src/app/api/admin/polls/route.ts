import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { createPoll } from "@/lib/domain/polls";

const schema = z.object({
  question: z.string().min(2).max(200),
  options: z.array(z.string().min(1).max(80)).min(2).max(8),
  active: z.boolean().default(false),
  endsAt: z.coerce.date().nullish(),
});

export async function POST(request: NextRequest) {
  return route(async () => {
    await requireStaff();
    const input = await jsonBody(request, schema);
    return createPoll({ ...input, endsAt: input.endsAt ?? null });
  });
}
