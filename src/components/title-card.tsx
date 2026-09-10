import Link from "next/link";

import { formatPosterScore } from "@/components/formatting";
import { CheckIcon, CircleHalfIcon } from "@/components/icons";
import { Poster } from "@/components/poster";
import type { Availability } from "@/lib/domain/catalog";
import { getI18n } from "@/lib/i18n/server";
import type { MediaKind } from "@/lib/providers/metadata";
import { cn } from "@/lib/utils";

/**
 * One title, everywhere.
 *
 * Every card carries its state, because the question a member arrives with is
 * always the same: is this already here. A card that is on the server says so
 * on the poster itself, so a rail can be read without stopping to compare.
 *
 * The card is a link to the title's own page rather than a button that opens
 * something: it can be shared, opened in a tab and come back through history
 * like anything else on the web.
 */
export async function TitleCard({
  kind,
  providerId,
  title,
  year,
  posterUrl,
  voteAverage,
  voteCount,
  availability,
  priority = false,
}: {
  kind: MediaKind;
  providerId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  voteAverage?: number | null;
  voteCount?: number;
  availability?: Availability;
  priority?: boolean;
}) {
  const { t, locale } = await getI18n();
  const ratingLabel = formatPosterScore(voteAverage, voteCount, locale);

  return (
    <Link
      href={`/title/${kind}/${providerId}`}
      className="group focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-3"
    >
      <div className="relative">
        <Poster
          src={posterUrl}
          alt={title}
          captioned
          priority={priority}
          sizes="10rem"
          ratingLabel={ratingLabel}
        />
        {availability === "available" || availability === "partial" ? (
          <span
            className={cn(
              "absolute top-2 right-2 flex size-5 items-center justify-center rounded-full",
              // Partly here is its own answer, not a paler yes: the mark says
              // half so a rail can be read without opening anything.
              availability === "partial"
                ? "bg-secondary text-foreground"
                : "bg-primary text-primary-foreground",
            )}
            title={t(
              availability === "partial"
                ? "status.partial"
                : "status.available",
            )}

            aria-hidden
          >
            {availability === "partial" ? (
              <CircleHalfIcon className="size-3" />
            ) : (
              <CheckIcon className="size-3" />
            )}
          </span>
        ) : availability === "requested" ? (
          <span
            className="bg-secondary text-muted-foreground absolute top-2 right-2 rounded-full px-2 py-0.5 text-xs leading-4"
            title={t("status.requested")}
            aria-hidden
          >
            {/* A pill on a card says what the title is, so it says "requested":
                "Request" here read as a button that does nothing. */}
            {t("status.requestedShort")}
          </span>
        ) : null}
      </div>

      {/* The hover is answered by the poster lifting and by the title being
          underlined: ochre is the lamp, and a rail of card titles lighting up
          would be a screenful of them. */}
      <p
        className="mt-2 truncate text-sm font-medium group-hover:underline"
        title={title}
      >
        {title}
      </p>
      <p className="text-muted-foreground text-xs">
        {kind === "movie" ? t("common.movie") : t("common.series")}
        {year ? ` · ${year}` : ""}
      </p>
      {/* The mark on the poster, said in words: a dot in a corner is read at
          a glance by someone who already knows the code and by nobody else.
          Absent stays silent, since the button on the page is its answer. */}
      {availability === "available" ? (
        <p className="text-primary flex items-center gap-1 text-xs">
          <CheckIcon className="size-3" aria-hidden />
          {t("status.availableShort")}
        </p>
      ) : availability === "partial" ? (
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          <CircleHalfIcon className="size-3" aria-hidden />
          {t("status.partialShort")}
        </p>
      ) : availability === "requested" ? (
        <p className="text-muted-foreground text-xs">
          {t("status.requestedShort")}
        </p>
      ) : null}
    </Link>
  );
}
