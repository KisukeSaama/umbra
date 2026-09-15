import { NextRequest } from "next/server";
import { z } from "zod";

import { idParam, jsonBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { deleteSearchSite, updateSearchSite } from "@/lib/domain/search-sites";
import { checkRate, perMinute } from "@/lib/rate-limit";

const param = z.object({
  key: z.string().min(1).max(60),
  value: z.string().max(200),
});

const schema = z.object({
  name: z.string().min(1).max(60).optional(),
  url: z.string().min(1).max(500).optional(),
  queryParam: z.string().min(1).max(60).optional(),
  queryTemplate: z.string().min(1).max(200).optional(),
  params: z.array(param).max(20).optional(),
  position: z.number().int().min(0).max(999).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const account = await requireStaff();
    checkRate("admin", account.id, perMinute(60));
    const id = await idParam(params);
    return updateSearchSite(id, await jsonBody(request, schema));
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
    return deleteSearchSite(id);
  });
}
