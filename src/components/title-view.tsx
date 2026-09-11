import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";

import { formatScore } from "@/components/formatting";
import { CutIcon, StarIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Poster } from "@/components/poster";
import { SeasonList } from "@/components/season-list";
import { TitleActions } from "@/components/title-actions";
import { isOnServer } from "@/lib/domain/availability";
import type { TitleDetail } from "@/lib/domain/catalog";
import type { PersonCard } from "@/lib/domain/people";
import { openAsksFor } from "@/lib/domain/reports";
import {
  followedRequestFor,
  lastRemovedAt,
  waitingOnTitle,
} from "@/lib/domain/requests";
import { settledAsksFor } from "@/lib/domain/settled";
import { storageOutlook } from "@/lib/domain/storage";
import { formatDate } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { NOTHING_SETTLED } from "@/lib/reports/reasons";

/**
 * Below this many votes an average is a handful of opinions, not a score, and
 * printing it would read as a verdict it cannot carry.
 */
const SCORE_MIN_VOTES = 20;

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
export async function TitleView({
  detail,
  leads,
  accountId,
}: {
  detail: TitleDetail;
  /** Who signs it: the directors of a film, the creators of a show. */
  leads: PersonCard[];
  /** Who is looking, to tell "you asked for this" from "somebody did". */
  accountId: string;
}) {
  const { t, locale } = await getI18n();
  const score =
    detail.voteAverage !== null && detail.voteCount >= SCORE_MIN_VOTES
      ? formatScore(detail.voteAverage, locale)
      : null;
  // The number is out of ten either way; the label says whose it is.
  const scoreKey =
    detail.scoreSource === "myanimelist" ? "title.scoreMal" : "title.score";
  const [followed, waiting] =
    detail.availability === "requested"
      ? await Promise.all([
          followedRequestFor(detail.kind, detail.providerId, accountId),
          waitingOnTitle(detail.kind, detail.providerId),
        ])
      : [null, 0];
  /*
   * Two things a member about to ask should know, read only when there is an
   * ask to make: that the server is short of room, said where it changes
   * something rather than on every page, and that the title was here before.
   */
  const [storage, removedAt] = isOnServer(detail.availability)
    ? [null, null]
    : await Promise.all([
        storageOutlook(),
        detail.availability === "absent"
          ? lastRemovedAt(detail.kind, detail.providerId)
          : null,
      ]);
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
      {/* On a phone the poster and the title share a row, the title set at the
          poster's foot the way a film is billed, and everything read at length
          takes the full width underneath. From the small breakpoint the
          poster stands in its own column beside all of it. */}
      <div className="relative grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-x-5 sm:gap-y-3">
        <div className="sm:row-span-2">
          <Poster
            src={detail.posterUrl}
            alt={detail.title}
            captioned
            sizes="(min-width: 640px) 10rem, 6rem"
          />
        </div>

        <div className="min-w-0 self-end sm:self-auto">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {/* The serif has taller ascenders than the line box a size
                utility gives it, so the tops of the capitals are shaved
                without a roomier leading. */}
            <h1 className="text-3xl leading-snug tracking-tight text-balance sm:text-4xl">
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
        </div>

        <div className="col-span-2 min-w-0 space-y-3 sm:col-span-1 sm:col-start-2">
          {detail.originalTitle ? (
            <p className="text-muted-foreground text-sm">
              {detail.originalTitle}
            </p>
          ) : null}

          {/* The score and the genres are what a title is worth and what it
              is, read before the synopsis. The star is ink, not ochre: it is
              a fact about the title, not something to act on. */}
          {score || detail.genres.length > 0 ? (
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {score ? (
                <span
                  className="text-foreground inline-flex items-center gap-1 font-medium tabular-nums"
                  title={t(scoreKey, { score })}
                >
                  <StarIcon className="size-3.5" aria-hidden />
                  <span aria-hidden>{score}</span>
                  <span className="sr-only">{t(scoreKey, { score })}</span>
                </span>
              ) : null}
              {score && detail.genres.length > 0 ? (
                <span aria-hidden>·</span>
              ) : null}
              {detail.genres.length > 0 ? (
                <span>
                  {detail.genres.map((genre) => genre.name).join(", ")}
                </span>
              ) : null}
            </p>
          ) : null}

          {leads.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              {t(
                detail.kind === "movie"
                  ? "title.directedBy"
                  : "title.createdBy",
              )}{" "}
              {leads.map((lead, index) => (
                <Fragment key={lead.personId}>
                  {index > 0 ? ", " : null}
                  <Link
                    href={`/person/${lead.personId}`}
                    className="text-foreground focus-visible:ring-ring/50 rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3"
                  >
                    {lead.name}
                  </Link>
                </Fragment>
              ))}
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
            followed={followed}
            waiting={waiting}
            alternateCut={detail.alternateCut}
            crowded={storage?.state === "full"}
            removedOn={removedAt ? formatDate(removedAt, locale) : null}
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
