"use client";

import { useState } from "react";

import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SpinnerIcon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import type { EpisodeState, SeasonState } from "@/lib/domain/catalog";
import { useTranslator } from "@/lib/i18n/client";

/**
 * The ladder of a series, and where the server stands on it.
 *
 * A member looking at a show asks one question before any other: is the season
 * I am after here, and how much of it. So every season states its own count
 * against what the provider says the season is made of, and opening one lists
 * the episodes with the same answer per line.
 *
 * Episodes are fetched when a season is opened and kept afterwards: a show with
 * forty seasons must not cost forty calls to be looked at, and folding a season
 * back must not throw away what was already paid for.
 */
export function SeasonList({
  providerId,
  seasons,
}: {
  providerId: string;
  seasons: SeasonState[];
}) {
  const t = useTranslator();
  const [open, setOpen] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Record<number, EpisodeState[]>>({});
  const [loading, setLoading] = useState<number | null>(null);
  const [failed, setFailed] = useState<number | null>(null);

  async function toggle(seasonNumber: number) {
    if (open === seasonNumber) {
      setOpen(null);
      return;
    }
    setOpen(seasonNumber);
    if (episodes[seasonNumber]) return;

    setLoading(seasonNumber);
    setFailed(null);
    try {
      const response = await fetch(
        `/api/series/episodes?providerId=${encodeURIComponent(providerId)}&season=${seasonNumber}`,
      );
      const body = await response.json();
      if (!response.ok) throw new Error("unavailable");
      setEpisodes((current) => ({
        ...current,
        [seasonNumber]: body.episodes as EpisodeState[],
      }));
    } catch {
      setFailed(seasonNumber);
    } finally {
      setLoading(null);
    }
  }

  if (seasons.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">
        {t("season.heading")}
      </h2>

      <ul className="divide-border/60 border-border/60 divide-y rounded-xl border">
        {seasons.map((season) => {
          const expanded = open === season.seasonNumber;
          const rows = episodes[season.seasonNumber];

          return (
            <li key={season.seasonNumber}>
              <button
                type="button"
                onClick={() => void toggle(season.seasonNumber)}
                aria-expanded={expanded}
                className="focus-visible:ring-ring/50 hover:bg-muted/40 flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-3"
              >
                {expanded ? (
                  <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
                ) : (
                  <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
                )}

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {t("season.number", { number: season.seasonNumber })}
                  </span>
                  {season.episodeCount > 0 ? (
                    <span className="text-muted-foreground block text-xs">
                      {t("season.episodes", { count: season.episodeCount })}
                    </span>
                  ) : null}
                </span>

                <SeasonBadge season={season} />
              </button>

              {expanded ? (
                <div className="px-3 pb-3">
                  {loading === season.seasonNumber ? (
                    <p className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
                      <SpinnerIcon />
                      {t("common.loading")}
                    </p>
                  ) : failed === season.seasonNumber ? (
                    <p className="text-muted-foreground py-2 text-sm">
                      {t("season.unavailable")}
                    </p>
                  ) : rows && rows.length > 0 ? (
                    <ul className="divide-border/40 divide-y">
                      {rows.map((episode) => (
                        <li
                          key={episode.episodeNumber}
                          className="flex items-baseline gap-3 py-1.5 text-sm"
                        >
                          <span className="text-muted-foreground w-10 shrink-0 tabular-nums">
                            {t("season.episodeShort", {
                              number: episode.episodeNumber,
                            })}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {episode.title ??
                              t("season.episodeShort", {
                                number: episode.episodeNumber,
                              })}
                          </span>
                          {episode.onServer ? (
                            <span className="text-primary flex shrink-0 items-center gap-1 text-xs">
                              <CheckIcon />
                              {t("season.onServer")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground shrink-0 text-xs">
                              {t("season.notOnServer")}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground py-2 text-sm">
                      {t("season.noEpisodes")}
                    </p>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Three states, exactly like a title: here, partly here, not here. A season the
 * provider has not numbered yet falls back on the count alone rather than
 * claiming to be complete.
 */
function SeasonBadge({ season }: { season: SeasonState }) {
  const t = useTranslator();

  if (season.onServer === 0)
    return <Badge variant="outline">{t("season.notOnServer")}</Badge>;

  if (season.episodeCount > 0 && season.onServer >= season.episodeCount)
    return (
      <Badge variant="secondary">
        <CheckIcon />
        {t("season.complete")}
      </Badge>
    );

  return (
    <Badge variant="outline">
      {t("season.partial", {
        count: season.onServer,
        total: season.episodeCount || season.onServer,
      })}
    </Badge>
  );
}
