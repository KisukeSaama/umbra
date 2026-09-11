import Image from "next/image";
import Link from "next/link";

import { UmbraFigure } from "@/components/brand";
import { SearchField } from "@/components/command-palette";
import { SparkleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { RecentItem } from "@/lib/domain/library";
import type { TranslationKey } from "@/lib/i18n";
import { getTranslator } from "@/lib/i18n/server";

/**
 * The first thing anyone sees.
 *
 * The wall behind the messenger is made of the posters that actually landed on
 * the server this week, blurred back until it is weather rather than content.
 * It is not a decorative stock image and it is not a glass panel: it is the
 * library itself, out of focus, which is why the page feels different in a week
 * where a lot arrived.
 *
 * The greeting follows the hour of the machine Umbra runs on. That machine is
 * the media server, sitting in the same house as the people reading this, so it
 * is the right clock to use.
 */
export async function Hero({ posters }: { posters: RecentItem[] }) {
  const t = await getTranslator();
  // Six is as many as the wall can show once it is this far out of focus, and
  // the home page is the heaviest one there is: four fewer requests for a
  // picture nobody looks at directly.
  const wall = posters.filter((item) => item.posterUrl).slice(0, 6);

  return (
    <section
      data-umbra-hero
      className="border-border/60 relative isolate overflow-hidden border-b"
    >
      {wall.length > 0 ? (
        <div className="umbra-backdrop absolute inset-0 -z-10" aria-hidden>
          {/* Stronger after dark: the wash over it is near black then, and at
              the daytime opacity the wall disappeared into it. */}
          <div className="flex h-full scale-110 gap-2 opacity-45 blur-2xl dark:opacity-70">
            {wall.map((item) => (
              <div key={item.ratingKey} className="relative h-full flex-1">
                <Image
                  src={item.posterUrl as string}
                  alt=""
                  fill
                  sizes="10vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
          <div className="umbra-grain absolute inset-0 opacity-40" />
        </div>
      ) : null}

      <div className="umbra-glow absolute inset-0 -z-10" aria-hidden />

      {/* Shorter on a phone: the first poster should be in sight without a
          scroll, and the messenger does not need a hall to sit in. */}
      <div className="umbra-container flex flex-col items-center py-10 text-center sm:py-24">
        <UmbraFigure
          alt={t("brand.alt")}
          preload
          sizes="(min-width: 640px) 9rem, 6rem"
          className="mb-5 w-24 sm:mb-6 sm:w-36"
        />
        <p className="text-muted-foreground text-sm">
          {t(`home.greeting.${partOfDay()}` as TranslationKey)}
        </p>
        <h1 className="mt-2 mb-6 text-4xl tracking-tight text-balance sm:mt-3 sm:mb-8 sm:text-6xl">
          {t("home.title")}
        </h1>

        {/* The field first and full width, the way an app opens on its search,
            then the way in for an evening without an idea. The field opens the
            one palette the page has, in the header: two dialogs meant one
            shortcut opened both. */}
        <div className="flex w-full max-w-xl flex-col items-center gap-3">
          <SearchField />
          <Button
            size="lg"
            className="w-full rounded-full px-6 sm:w-auto"
            render={<Link href="/discover" />}
          >
            <SparkleIcon />
            {t("picker.open")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function partOfDay(): "morning" | "afternoon" | "evening" | "night" {
  const hour = new Date().getHours();
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  if (hour < 23) return "evening";
  return "night";
}
