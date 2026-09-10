import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { linkSchema } from "@/app/api/admin/announcements/schema";
import { ANNOUNCEMENT_CATEGORIES } from "@/lib/db/schema";
import { createAnnouncement } from "@/lib/domain/announcements";
import { checkRate, perMinute } from "@/lib/rate-limit";

const schema = z.object({
  title: z.string().min(2).max(120),
  content: z.string().min(2).max(4000),
  category: z.enum(ANNOUNCEMENT_CATEGORIES),
  published: z.boolean().default(false),
  link: linkSchema.nullish(),
  poll: z
    .object({
      question: z.string().min(2).max(200),
      options: z.array(z.string().min(1).max(80)).min(2).max(8),
      endsAt: z.coerce.date().nullish(),
    })
    .nullish(),
});

export async function POST(request: NextRequest) {
  return route(async () => {
    const account = await requireStaff();
    checkRate("admin", account.id, perMinute(30));
    const input = await jsonBody(request, schema);
    return createAnnouncement({
      ...input,
      link: input.link ?? null,
      poll: input.poll
        ? { ...input.poll, endsAt: input.poll.endsAt ?? null }
        : null,
    });
  });
}
