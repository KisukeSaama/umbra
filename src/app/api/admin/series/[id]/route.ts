import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { setSeriesEnabled } from "@/lib/domain/series";

const schema = z.object({ enabled: z.boolean() });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    await requireAdmin();
    const { id } = await params;
    const { enabled } = await jsonBody(request, schema);
    return setSeriesEnabled(id, enabled);
  });
}
