import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { ANNOUNCEMENT_CATEGORIES } from "@/lib/db/schema";
import { createAnnouncement } from "@/lib/domain/announcements";

const schema = z.object({
  title: z.string().min(2).max(120),
  content: z.string().min(2).max(4000),
  category: z.enum(ANNOUNCEMENT_CATEGORIES),
  published: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  return route(async () => {
    await requireAdmin();
    return createAnnouncement(await jsonBody(request, schema));
  });
}
