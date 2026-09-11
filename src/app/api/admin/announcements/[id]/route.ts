import { NextRequest } from "next/server";
import { z } from "zod";

import { idParam, jsonBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import {
  embedSchema,
  linkSchema,
} from "@/app/api/admin/announcements/schema";
import { ANNOUNCEMENT_CATEGORIES } from "@/lib/db/schema";
import {
  deleteAnnouncement,
  updateAnnouncement,
} from "@/lib/domain/announcements";
import { checkRate, perMinute } from "@/lib/rate-limit";

const schema = z.object({
  title: z.string().min(2).max(120).optional(),
  content: z.string().min(2).max(4000).optional(),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).optional(),
  published: z.boolean().optional(),
  link: linkSchema.nullish(),
  embed: embedSchema.nullish(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const account = await requireStaff();
    checkRate("admin", account.id, perMinute(60));
    const id = await idParam(params);
    return updateAnnouncement(id, await jsonBody(request, schema));
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
    return deleteAnnouncement(id);
  });
}
