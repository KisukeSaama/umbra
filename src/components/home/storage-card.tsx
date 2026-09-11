import { EmptyNote } from "@/components/empty-note";
import { formatPercent } from "@/components/formatting";
import { DiskIcon } from "@/components/icons";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/format";
import type { StorageOutlook } from "@/lib/domain/storage";
import { roughly } from "@/lib/domain/storage-room";
import type { Translator } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

/**
 * Public storage view: the capacity, and what it comes to.
 *
 * A terabyte means nothing to most members, a film means something to all of
 * them, so the card says both: what is free in bytes, then how many films or
 * episodes that holds. It stays quiet while there is room: the bar is ink,
 * not ochre, and nothing else is added. Once the disk is tight the bar takes
 * the lamp and the pace is said in a sentence, never an arrow.
 *
 * No device names, no mount points, no volume layout. Those are in the admin
 * area, where they are useful rather than worrying.
 */
export async function StorageCard({
  storage,
}: {
  storage: StorageOutlook | null;
}) {
  const { t, locale } = await getI18n();
  const percent = storage ? Math.round(storage.usedRatio * 100) : 0;
  const count = new Intl.NumberFormat(locale);
  const room = storage ? roomLine(storage, t, count) : null;
  const pace =
    storage && storage.state !== "roomy" && storage.daysLeft !== null
      ? paceLine(storage.daysLeft, t)
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("section.storage")}</CardTitle>
        {storage ? (
          <CardAction className="self-center text-sm font-medium tabular-nums">
            {/* The sign is punctuated by the language: French wants a narrow
                no-break space in front of it, English wants none. */}
            {t("storage.used", {
              percent: formatPercent(storage.usedRatio, locale),
            })}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {storage ? (
          <>
            {/* Ink while there is room, ochre once there is not: the fill is a
                state indicator only when there is a state worth indicating,
                and at four pixels high it is a line rather than an area
                competing with the hero. */}
            <Progress
              value={percent}
              // The value is read aloud as a percentage, punctuated by the
              // language: named here so the server and the browser agree on
              // it, instead of each formatting in its own default locale.
              locale={locale}
              aria-label={t("section.storage")}
              className={cn(
                storage.state === "roomy"
                  ? "[&_[data-slot=progress-indicator]]:bg-foreground/40"
                  : "[&_[data-slot=progress-indicator]]:bg-primary",
              )}
            />
            <p className="text-sm font-medium tabular-nums">
              {t("storage.available", {
                value: formatBytes(storage.availableBytes, locale),
                total: formatBytes(storage.totalBytes, locale),
              })}
            </p>
            {room ? (
              <p className="text-muted-foreground text-sm tabular-nums">
                {room}
              </p>
            ) : null}
            {pace ? (
              <p className="text-muted-foreground text-sm tabular-nums">
                {pace}
              </p>
            ) : null}
          </>
        ) : (
          <EmptyNote icon={DiskIcon}>{t("storage.unknown")}</EmptyNote>
        )}
      </CardContent>
    </Card>
  );
}

/** The free space in titles, with whichever kinds the server can weigh. */
function roomLine(
  storage: StorageOutlook,
  t: Translator,
  count: Intl.NumberFormat,
): string | null {
  const { movies, episodes } = storage.room;
  const values = {
    movies: movies !== null ? count.format(roughly(movies)) : "",
    episodes: episodes !== null ? count.format(roughly(episodes)) : "",
  };
  if (movies !== null && episodes !== null)
    return t("storage.room.both", values);
  if (movies !== null) return t("storage.room.movies", values);
  if (episodes !== null) return t("storage.room.episodes", values);
  return null;
}

/** The pace in the unit a person would use: days up close, weeks further out. */
function paceLine(days: number, t: Translator): string {
  if (days >= 14)
    return t("storage.pace.weeks", { count: Math.round(days / 7) });
  return t("storage.pace.days", { count: Math.max(1, days) });
}
