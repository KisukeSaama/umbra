import Link from "next/link";

import { Poster } from "@/components/poster";
import { Rail } from "@/components/rail";
import { SectionHeading } from "@/components/section";
import type { CastCard } from "@/lib/domain/people";
import { getTranslator } from "@/lib/i18n/server";

/**
 * The people in a title, each one a way into everything else they did.
 *
 * Shaped like a shelf so the page reads as one rhythm: a portrait is a 2:3
 * frame like a poster, and a face nobody has a photo of keeps the name in the
 * frame the same way a title without artwork does. It removes itself when the
 * provider names nobody.
 */
export async function CastRail({ cast }: { cast: CastCard[] }) {
  if (cast.length === 0) return null;
  const t = await getTranslator();

  return (
    <section className="umbra-fade">
      <SectionHeading title={t("title.cast")} />
      <Rail name={t("title.cast")}>
        {cast.map((member) => {
          const role = member.voice
            ? member.character
              ? t("cast.voice", { character: member.character })
              : t("cast.voiceOnly")
            : member.character;
          return (
            <div
              key={member.personId}
              className="w-28 shrink-0 snap-start sm:w-32"
            >
              <Link
                href={`/person/${member.personId}`}
                className="group focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-3"
              >
                <Poster
                  src={member.photoUrl}
                  alt={member.name}
                  captioned
                  sizes="8rem"
                />
                <p
                  className="mt-2 truncate text-sm font-medium group-hover:underline"
                  title={member.name}
                >
                  {member.name}
                </p>
                {role ? (
                  <p
                    className="text-muted-foreground truncate text-xs"
                    title={role}
                  >
                    {role}
                  </p>
                ) : null}
              </Link>
            </div>
          );
        })}
      </Rail>
    </section>
  );
}
