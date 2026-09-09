import { Badge } from "@/components/ui/badge";
import { Poster } from "@/components/poster";
import { SeasonList } from "@/components/season-list";
import { TitleActions } from "@/components/title-actions";
import type { TitleDetail } from "@/lib/domain/catalog";
import { isSeriesIncomplete } from "@/lib/domain/seasons";
import { getTranslator } from "@/lib/i18n/server";

/**
 * One title, given the room to be looked at.
 *
 * The banner is the only picture in Umbra allowed to fill a width. Nothing is
 * read over it, so it is shown rather than washed out, and it dissolves only at
 * its foot into the surface carrying it. It bleeds through the container
 * padding without reaching for the top of the page, because the way back sits
 * above it.
 */
export async function TitleView({ detail }: { detail: TitleDetail }) {
  const t = await getTranslator();

  return (
    <article className="space-y-6">
      {detail.backdropUrl ? (
        <div
          className="umbra-banner relative -mx-4 -mb-2 h-36 overflow-hidden sm:-mx-6 sm:h-52"
          aria-hidden
        >
          {/* Decoration, so it is a background rather than an image with a
              caption nobody needs. */}
          <div
            className="h-full w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${detail.backdropUrl})` }}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="w-32 shrink-0 sm:w-40">
          <Poster src={detail.posterUrl} alt={detail.title} sizes="10rem" />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            {/* The serif has taller ascenders than the line box a size
                utility gives it, so the tops of the capitals are shaved
                without a roomier leading. */}
            <h1 className="text-2xl leading-snug tracking-tight sm:text-3xl">
              {detail.title}
            </h1>
            {detail.year ? (
              <span className="text-muted-foreground">{detail.year}</span>
            ) : null}
            <Badge variant="outline">
              {detail.kind === "movie" ? t("common.movie") : t("common.series")}
            </Badge>
          </div>

          {detail.originalTitle ? (
            <p className="text-muted-foreground text-sm">
              {detail.originalTitle}
            </p>
          ) : null}

          {detail.overview ? (
            <p className="max-w-prose text-sm leading-relaxed">
              {detail.overview}
            </p>
          ) : null}

          <TitleActions
            kind={detail.kind}
            providerId={detail.providerId}
            title={detail.title}
            availability={detail.availability}
            incomplete={isSeriesIncomplete(detail.seasons)}
          />
        </div>
      </div>

      {/* A series is never one thing you either have or do not: the answer is
          per season, and then per episode. */}
      {detail.kind === "tv" ? (
        <SeasonList
          providerId={detail.providerId}
          seasons={detail.seasons}
          availability={detail.availability}
        />
      ) : null}
    </article>
  );
}
