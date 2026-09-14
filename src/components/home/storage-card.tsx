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
 * Public storage view: what is free, and what it comes to.
 *
 * The free space is the figure a member reads first, set large; the total and
 * the share used are context around it. Then the same space in titles, in a
 * strip of two cells like the week strip, because a terabyte means nothing to
 * most members and a film means something to all of them (ADR 0019).
 *
 * It stays quiet while there is room: the bar is ink, not ochre, and nothing
 * else is added. Once the disk is tight the bar takes the lamp and the pace is
 * said in a sentence, never an arrow. No device names, no mount points, no
 * volume layout: those are in the admin area.
 */
export async function StorageCard({
  storage,
  className,
}: {
  storage: StorageOutlook | null;
  className?: string;
}) {
  const { t, locale } = await getI18n();
  const count = new Intl.NumberFormat(locale);
  const room = storage ? roomCells(storage, t, count) : [];
  const pace =
    storage && storage.state !== "roomy" && storage.daysLeft !== null
      ? paceLine(storage.daysLeft, t)
      : null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t("section.storage")}</CardTitle>
        {storage ? (
          <CardAction className="text-muted-foreground self-center text-sm tabular-nums">
            {/* The sign is punctuated by the language: French wants a narrow
                no-break space in front of it, English wants none. */}
            {t("storage.used", {
              percent: formatPercent(storage.usedRatio, locale),
            })}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {storage ? (
          <>
            <div className="space-y-3">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatBytes(storage.availableBytes, locale)}
                </span>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {t("storage.freeOf", {
                    total: formatBytes(storage.totalBytes, locale),
                  })}
                </span>
              </p>
              {/* Ink while there is room, ochre once there is not: the fill
                  is a state indicator only when there is a state worth
                  indicating. */}
              <Progress
                value={Math.round(storage.usedRatio * 100)}
                // Read aloud as a percentage punctuated by the language, so
                // the server and the browser agree on it.
                locale={locale}
                aria-label={t("section.storage")}
                className={cn(
                  storage.state === "roomy"
                    ? "[&_[data-slot=progress-indicator]]:bg-foreground/40"
                    : "[&_[data-slot=progress-indicator]]:bg-primary",
                )}
              />
            </div>

            {room.length > 0 ? (
              <div className="space-y-2">
                <p className="text-muted-foreground text-sm">
                  {t("storage.roomIntro")}
                </p>
                <ul
                  className={cn(
                    "border-border/60 divide-border/60 grid divide-x rounded-lg border",
                    room.length === 2 ? "grid-cols-2" : "grid-cols-1",
                  )}
                >
                  {room.map((cell) => (
                    <li key={cell.key} className="px-3 py-2.5">
                      <p className="text-xl font-semibold tabular-nums">
                        {cell.value}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {cell.unit}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
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
function roomCells(
  storage: StorageOutlook,
  t: Translator,
  count: Intl.NumberFormat,
): { key: string; value: string; unit: string }[] {
  const cells = [];
  const { movies, episodes } = storage.room;
  if (movies !== null) {
    const n = roughly(movies);
    cells.push({
      key: "movies",
      value: count.format(n),
      unit: t("storage.unit.movies", { count: n }),
    });
  }
  if (episodes !== null) {
    const n = roughly(episodes);
    cells.push({
      key: "episodes",
      value: count.format(n),
      unit: t("storage.unit.episodes", { count: n }),
    });
  }
  return cells;
}

/** The pace in the unit a person would use: days up close, weeks further out. */
function paceLine(days: number, t: Translator): string {
  if (days >= 14)
    return t("storage.pace.weeks", { count: Math.round(days / 7) });
  return t("storage.pace.days", { count: Math.max(1, days) });
}
