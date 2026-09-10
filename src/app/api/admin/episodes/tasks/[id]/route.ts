import { NextRequest } from "next/server";
import { z } from "zod";

import { idParam, jsonBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { closeEpisodeTask } from "@/lib/domain/series";
import { checkRate, perMinute } from "@/lib/rate-limit";

const schema = z.object({ status: z.enum(["done", "dismissed"]) });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const account = await requireStaff();
    checkRate("admin", account.id, perMinute(60));
    const id = await idParam(params);
    const { status } = await jsonBody(request, schema);
    return closeEpisodeTask(id, status);
  });
}
