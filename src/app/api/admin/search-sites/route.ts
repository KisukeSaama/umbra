import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { createSearchSite } from "@/lib/domain/search-sites";
import { checkRate, perMinute } from "@/lib/rate-limit";

const param = z.object({
  key: z.string().min(1).max(60),
  value: z.string().max(200),
});

const schema = z.object({
  name: z.string().min(1).max(60),
  url: z.string().min(1).max(500),
  queryParam: z.string().min(1).max(60),
  queryTemplate: z.string().min(1).max(200),
  params: z.array(param).max(20).default([]),
  position: z.number().int().min(0).max(999).default(0),
  enabled: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  return route(async () => {
    const account = await requireStaff();
    checkRate("admin", account.id, perMinute(30));
    return createSearchSite(await jsonBody(request, schema));
  });
}
