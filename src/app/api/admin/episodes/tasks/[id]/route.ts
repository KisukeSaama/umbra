import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { closeEpisodeTask } from "@/lib/domain/series";

const schema = z.object({ status: z.enum(["done", "dismissed"]) });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    await requireStaff();
    const { id } = await params;
    const { status } = await jsonBody(request, schema);
    return closeEpisodeTask(id, status);
  });
}
