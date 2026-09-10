import { NextRequest } from "next/server";
import { z } from "zod";

import { idParam, jsonBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { setSeriesEnabled } from "@/lib/domain/series";
import { checkRate, perMinute } from "@/lib/rate-limit";

const schema = z.object({ enabled: z.boolean() });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const account = await requireStaff();
    checkRate("admin", account.id, perMinute(60));
    const id = await idParam(params);
    const { enabled } = await jsonBody(request, schema);
    return setSeriesEnabled(id, enabled);
  });
}
