import Image from "next/image";

import { CutIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Poster } from "@/components/poster";
import { SeasonList } from "@/components/season-list";
import { TitleActions } from "@/components/title-actions";
import type { TitleDetail } from "@/lib/domain/catalog";
import { openAsksFor } from "@/lib/domain/reports";
import { settledAsksFor } from "@/lib/domain/settled";
import { getTranslator } from "@/lib/i18n/server";
import { NOTHING_SETTLED } from "@/lib/reports/reasons";

/**
 * One title, given the room to be looked at.
 *
 * The banner is the only picture in Umbra allowed to fill a width. Nothing is
 * read over it, so it is shown rather than washed out, and it dissolves on
 * every edge into the surface carrying it rather than being cut square. It
 * bleeds through the container padding without reaching for the top of the
 * page, because the way back sits above it, and the title rises into its foot
 * instead of waiting under a band.
 */
export async function TitleView({ detail }: { detail: TitleDetail }) {
  const t = await getTranslator();
  /*
   * What has already been asked about this series, so a season never offers an
   * ask a second time, and what the administration has just answered, which the
   * index will only show at the next scan. Read here rather than in
   * `titleDetail`, because they say what the buttons may do and not what the
   * title is.
   *
   * A re-cut is the whole story under another numbering, so it has no ladder
   * and nothing to ask for: neither is read at all.
   */
  const [openAsks, settled] =
    detail.kind === "tv" && !detail.alternateCut
      ? await Promise.all([
          openAsksFor(detail.kind, detail.providerId),
          settledAsksFor(detail.kind, detail.providerId),
        ])
      : [[], NOTHING_SETTLED];

  return (
    <article className="space-y-6">
      {detail.backdropUrl ? (
        <div
          className="umbra-banner relative -mx-4 -mb-6 h-44 overflow-hidden sm:-mx-6 sm:h-64 lg:-mx-10"
          aria-hidden
        >
          {/* Decoration, so it carries no alternative text: it is a
              background rather than an image with a caption nobody needs. It
              still goes through the optimiser, because a CSS background asks
              every phone for the original the provider stores. */}
          <Image
            src={detail.backdropUrl}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ) : null}

      {/* The banner is positioned, so it would paint over anything static that
          follows it: the row rises into its foot only if it is positioned too,
          which is what the poster already did on its own. */}
      <div className="relative flex flex-col gap-5 sm:flex-row">
        <div className="w-32 shrink-0 sm:w-40">
          <Poster
            src={detail.posterUrl}
            alt={detail.title}
            captioned
            sizes="10rem"
          />
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
            {/* The cut sits with the year and the kind, because it is what the
                title is here rather than something the server is late on. */}
            {detail.alternateCut ? (
              <Badge variant="secondary">
                <CutIcon />
                {t("title.cut", { cut: t(`cut.${detail.alternateCut}`) })}
              </Badge>
            ) : null}
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

          {detail.alternateCut ? (
            <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
              {t("title.cut.note")}
            </p>
          ) : null}

          <TitleActions
            kind={detail.kind}
            providerId={detail.providerId}
            title={detail.title}
            availability={detail.availability}
            alternateCut={detail.alternateCut}
          />
        </div>
      </div>

      {/* A series is never one thing you either have or do not: the answer is
          per season, and then per episode. */}
      {detail.kind === "tv" && !detail.alternateCut ? (
        <SeasonList
          providerId={detail.providerId}
          seasons={detail.seasons}
          availability={detail.availability}
          openAsks={openAsks}
          settled={settled}
        />
      ) : null}
    </article>
  );
}
