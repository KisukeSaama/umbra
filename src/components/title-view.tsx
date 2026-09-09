import { Badge } from "@/components/ui/badge";
import { Poster } from "@/components/poster";
import { SeasonList } from "@/components/season-list";
import { TitleActions } from "@/components/title-actions";
import type { TitleDetail } from "@/lib/domain/catalog";
import { getTranslator } from "@/lib/i18n/server";

/**
 * One title, given the room to be looked at.
 *
 * The same markup serves the full page and the panel that opens over a shelf,
 * because they are the same thing seen from two distances. The backdrop is the
 * only picture in Umbra allowed to fill a width, and it stays behind a wash so
 * the text over it is read rather than admired.
 */
export async function TitleView({ detail }: { detail: TitleDetail }) {
  const t = await getTranslator();

  return (
    <article className="space-y-6">
      {detail.backdropUrl ? (
        <div
          className="umbra-backdrop relative -mx-4 -mt-4 h-40 overflow-hidden sm:-mx-6 sm:h-56 md:rounded-t-xl"
          aria-hidden
        >
          {/* Decoration, so it is a background rather than an image with a
              caption nobody needs. */}
          <div
            className="h-full w-full bg-cover bg-center opacity-60 blur-[2px]"
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
            <h1 className="text-2xl tracking-tight sm:text-3xl">
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
          />
        </div>
      </div>

      {/* A series is never one thing you either have or do not: the answer is
          per season, and then per episode. */}
      {detail.kind === "tv" ? (
        <SeasonList providerId={detail.providerId} seasons={detail.seasons} />
      ) : null}
    </article>
  );
}
