import Link from "next/link";

import { CheckIcon, CircleHalfIcon } from "@/components/icons";
import { Poster } from "@/components/poster";
import type { Availability } from "@/lib/domain/catalog";
import { getTranslator } from "@/lib/i18n/server";
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
  availability,
  priority = false,
}: {
  kind: MediaKind;
  providerId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  availability?: Availability;
  priority?: boolean;
}) {
  const t = await getTranslator();

  return (
    <Link
      href={`/title/${kind}/${providerId}`}
      className="group focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-3"
    >
      <div className="relative">
        <Poster src={posterUrl} alt={title} priority={priority} sizes="10rem" />
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
          >
            {availability === "partial" ? (
              <CircleHalfIcon className="size-3" />
            ) : (
              <CheckIcon className="size-3" />
            )}
            <span className="sr-only">
              {t(
                availability === "partial"
                  ? "status.partial"
                  : "status.available",
              )}
            </span>
          </span>
        ) : availability === "requested" ? (
          <span
            className="bg-secondary text-muted-foreground absolute top-2 right-2 rounded-full px-2 py-0.5 text-[0.65rem] leading-4"
            title={t("status.requested")}
          >
            {t("status.request")}
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          "mt-2 truncate text-sm font-medium",
          "group-hover:text-primary transition-colors",
        )}
        title={title}
      >
        {title}
      </p>
      <p className="text-muted-foreground text-xs">
        {kind === "movie" ? t("common.movie") : t("common.series")}
        {year ? ` · ${year}` : ""}
      </p>
    </Link>
  );
}
