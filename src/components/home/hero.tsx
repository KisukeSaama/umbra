import Image from "next/image";
import Link from "next/link";

import { UmbraFigure } from "@/components/brand";
import { CommandPalette } from "@/components/command-palette";
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
  const wall = posters.filter((item) => item.posterUrl).slice(0, 10);

  return (
    <section className="border-border/60 relative isolate overflow-hidden border-b">
      {wall.length > 0 ? (
        <div className="umbra-backdrop absolute inset-0 -z-10" aria-hidden>
          <div className="flex h-full scale-110 gap-2 opacity-45 blur-2xl">
            {wall.map((item) => (
              <div key={item.ratingKey} className="relative h-full flex-1">
                <Image
                  src={item.posterUrl as string}
                  alt=""
                  fill
                  sizes="20vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
          <div className="umbra-grain absolute inset-0 opacity-40" />
        </div>
      ) : null}

      <div className="umbra-glow absolute inset-0 -z-10" aria-hidden />

      <div className="umbra-container flex flex-col items-center py-16 text-center sm:py-24">
        <UmbraFigure
          alt={t("brand.alt")}
          preload
          sizes="(min-width: 640px) 9rem, 7rem"
          className="mb-6 w-28 sm:w-36"
        />
        <p className="text-muted-foreground text-sm">
          {t(`home.greeting.${partOfDay()}` as TranslationKey)}
        </p>
        <h1 className="mt-3 mb-8 text-4xl tracking-tight text-balance sm:text-6xl">
          {t("home.title")}
        </h1>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            className="rounded-full px-6"
            render={<Link href="/discover" />}
          >
            <SparkleIcon />
            {t("picker.open")}
          </Button>
          {/* The same palette as the header, given a field you can read: on
              arrival the question is usually "is this already here", and the
              answer should not need a destination. */}
          <CommandPalette variant="hero" />
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
