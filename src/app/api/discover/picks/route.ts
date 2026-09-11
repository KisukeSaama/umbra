import { NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { requireMember } from "@/lib/auth/session";
import {
  COMMITMENTS,
  VISUAL_STYLES,
  DURATIONS,
  ERAS,
  FORMATS,
  MOODS,
  ORIGINS,
} from "@/lib/discovery/moods";
import { guidedSelection } from "@/lib/domain/discovery";
import { bumpMetric } from "@/lib/domain/analytics";
import { detectLocale } from "@/lib/i18n";
import { checkRate, perMinute } from "@/lib/rate-limit";

/**
 * The answer to "I do not know what to watch".
 *
 * Four closed answers in, a small selection out. The enums are enforced here
 * and not only offered in the interface: a closed set is only closed if the
 * boundary says so.
 */
const schema = z.object({
  moods: z.array(z.enum(MOODS)).min(1).max(MOODS.length),
  visualStyles: z.array(z.enum(VISUAL_STYLES)).min(1).max(VISUAL_STYLES.length),
  format: z.enum(FORMATS),
  duration: z.enum(DURATIONS),
  commitment: z.enum(COMMITMENTS).default("any"),
  era: z.enum(ERAS).default("any"),
  origin: z.enum(ORIGINS).default("any"),
});

export async function GET(request: NextRequest) {
  return route(async () => {
    const account = await requireMember();
    checkRate("picks", account.id, perMinute(20));

    const params = request.nextUrl.searchParams;
    const mode = z
      .enum(["guided", "surprise"])
      .parse(params.get("mode") ?? "guided");
    const choice =
      mode === "surprise"
        ? {
            moods: ["any" as const],
            visualStyles: [...VISUAL_STYLES],
            format: "either" as const,
            duration: "any" as const,
            commitment: "any" as const,
          }
        : schema.parse({
            moods: params.getAll("mood"),
            visualStyles: params.getAll("visualStyle"),
            format: params.get("format"),
            duration: params.get("duration"),
            commitment: params.get("commitment") ?? undefined,
            era: params.get("era") ?? undefined,
            origin: params.get("origin") ?? undefined,
          });

    const locale = detectLocale(request.headers.get("accept-language"));
    const excluded = new Set(
      params
        .getAll("exclude")
        .slice(0, 240)
        .filter((key) => /^(movie|tv):\d+$/.test(key)),
    );
    const selection = await guidedSelection(
      choice,
      locale,
      account.id,
      mode === "surprise",
      excluded,
    );
    await bumpMetric("discovery_rolls");
    return selection;
  });
}

export const dynamic = "force-dynamic";
