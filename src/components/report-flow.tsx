"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { request, requestError } from "@/components/client-api";
import { FlagIcon, SearchIcon, SpinnerIcon } from "@/components/icons";
import { LoadingRegion } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReportReason } from "@/lib/db/schema";
import type { AlternateCut } from "@/lib/domain/cuts";
import type { LibraryMatch } from "@/lib/domain/library";
import type { TranslationKey } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";
import { reasonsFor, reasonsForCut, targetOf } from "@/lib/reports/reasons";

/**
 * Reporting a problem, as three choices.
 *
 * There is no text field anywhere in this component, and that is the design:
 * the member picks a title that is on the server, then where the problem is,
 * then what it is, out of a list that changes with where they pointed. The one
 * input on screen is a search box, and it only ever filters the local index.
 */

type Target = {
  kind: "movie" | "tv";
  providerId: string;
  title: string;
  /**
   * The re-cut the server holds it in, when it is one. A re-cut has no "where"
   * step and a shorter list of reasons: see `@/lib/reports/reasons`.
   */
  alternateCut?: AlternateCut | null;
};

export function ReportFlow({
  preset,
  variant = "ghost",
}: {
  preset?: Target;
  variant?: "ghost" | "outline" | "secondary";
}) {
  const t = useTranslator();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant} size="sm" />}>
        <FlagIcon />
        {t("title.report")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("report.title")}</DialogTitle>
          <DialogDescription>{t("report.subtitle")}</DialogDescription>
        </DialogHeader>
        {open ? (
          <ReportSteps preset={preset} onDone={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ReportSteps({
  preset,
  onDone,
}: {
  preset?: Target;
  onDone: () => void;
}) {
  const t = useTranslator();
  const locale = useLocale();

  const [target, setTarget] = useState<Target | null>(preset ?? null);
  const [seasonNumber, setSeasonNumber] = useState<number | null>(null);
  const [episodeNumber, setEpisodeNumber] = useState<number | null>(null);
  // A series needs the "where" step answered before the reasons make sense.
  // A film has nowhere to point, and so has a re-cut: it numbers itself, the
  // page draws no ladder, and the report is about the series as a whole.
  const [placed, setPlaced] = useState(
    preset?.kind === "movie" || Boolean(preset?.alternateCut),
  );
  const [sending, setSending] = useState(false);

  async function send(reason: ReportReason) {
    if (!target) return;
    setSending(true);
    try {
      const body = await request<{ reportId: string; joined: boolean }>(
        "/api/reports",
        {
          method: "POST",
          body: {
            kind: target.kind,
            providerId: target.providerId,
            seasonNumber,
            episodeNumber,
            reason,
          },
        },
      );

      // The undo is offered here rather than on the dialog: the flow closes on
      // the last choice, so the moment right after it is the toast.
      toast.success(t(body.joined ? "report.joined" : "report.sent"), {
        action: {
          label: t("report.withdraw"),
          onClick: () => void withdraw(body.reportId),
        },
      });
      onDone();
    } catch (error) {
      toast.error(requestError(locale, error));
    } finally {
      setSending(false);
    }
  }

  /** Leaves the report just made, or just joined. */
  async function withdraw(reportId: string) {
    try {
      await request(`/api/reports/${reportId}`, { method: "DELETE" });
      toast.success(t("status.reportWithdrawn"));
    } catch (error) {
      toast.error(requestError(locale, error));
    }
  }

  if (!target)
    return (
      <TitleStep
        onPick={(match) => {
          setTarget(match);
          setPlaced(match.kind === "movie" || Boolean(match.alternateCut));
        }}
      />
    );

  if (!placed)
    return (
      <PlaceStep
        providerId={target.providerId}
        onPick={(season, episode) => {
          setSeasonNumber(season);
          setEpisodeNumber(episode);
          setPlaced(true);
        }}
      />
    );

  const reasons = target.alternateCut
    ? reasonsForCut()
    : reasonsFor(targetOf(target.kind, seasonNumber, episodeNumber));

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">{t("report.step.why")}</p>
      {/* The list is short here, and a short list with no reason given reads
          as a list that is missing something. */}
      {target.alternateCut ? (
        <p className="text-muted-foreground text-sm">{t("report.cut.note")}</p>
      ) : null}
      <ul className="space-y-2">
        {reasons.map((reason) => (
          <li key={reason}>
            <Button
              variant="outline"
              disabled={sending}
              onClick={() => void send(reason)}
              className="h-auto w-full justify-start py-2 text-left"
            >
              {sending ? <SpinnerIcon /> : null}
              {t(`report.reason.${reason}` as TranslationKey)}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Step one: which title, searched in the local index and nowhere else. */
function TitleStep({ onPick }: { onPick: (match: Target) => void }) {
  const t = useTranslator();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibraryMatch[] | null>(null);
  const [loading, setLoading] = useState(false);

  const trimmed = query.trim();
  const tooShort = trimmed.length < 2;

  useEffect(() => {
    if (tooShort) return;

    let current = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const body = await request<{ results: LibraryMatch[] }>(
          `/api/library/search?q=${encodeURIComponent(trimmed)}`,
        );
        if (current) setResults(body.results);
      } catch (error) {
        // An empty list plus a word is the honest answer: without the catch
        // this was an unhandled rejection and a step that never came back.
        if (current) {
          setResults([]);
          toast.error(requestError(locale, error));
        }
      } finally {
        if (current) setLoading(false);
      }
    }, 300);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [trimmed, tooShort, locale]);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">{t("report.step.what")}</p>
      <div className="border-border/70 focus-within:border-primary/50 flex items-center gap-2 rounded-lg border px-3 transition-colors">
        <SearchIcon className="text-muted-foreground" />
        <Input
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("report.searchPlaceholder")}
          aria-label={t("report.searchPlaceholder")}
          className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        {loading ? <SpinnerIcon className="text-muted-foreground" /> : null}
      </div>

      {tooShort || results === null ? (
        <p className="text-muted-foreground text-sm">
          {t("report.searchHint")}
        </p>
      ) : results.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("report.noMatch")}</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {results.map((match) => (
            <li key={match.ratingKey}>
              <Button
                variant="ghost"
                onClick={() =>
                  onPick({
                    kind: match.kind,
                    providerId: match.providerId,
                    title: match.title,
                    alternateCut: match.alternateCut,
                  })
                }
                className="h-auto w-full justify-start py-2 text-left"
              >
                <span className="truncate">{match.title}</span>
                {match.year ? (
                  <span className="text-muted-foreground ml-1 text-xs">
                    {match.year}
                  </span>
                ) : null}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Step two: where in the series, from what the server actually holds.
 *
 * The seasons are asked for on the way in, so the step opens on a list it does
 * not have yet: it says so with the shape of what is coming rather than
 * offering "the whole series" as if that were the only answer, and a refusal
 * says so too instead of leaving that half-truth on screen for good.
 */
function PlaceStep({
  providerId,
  onPick,
}: {
  providerId: string;
  onPick: (season: number | null, episode: number | null) => void;
}) {
  const t = useTranslator();
  const locale = useLocale();
  const [seasons, setSeasons] = useState<number[] | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<
    { episodeNumber: number; title: string }[] | null
  >(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const body = await request<{ seasons: number[] }>(
          `/api/library/search?providerId=${encodeURIComponent(providerId)}`,
        );
        if (current) setSeasons(body.seasons);
      } catch (error) {
        if (current) {
          setFailed(true);
          toast.error(requestError(locale, error));
        }
      }
    })();
    return () => {
      current = false;
    };
  }, [providerId, locale]);

  /** A move between the two lists starts the next one from nothing. */
  function chooseSeason(next: number | null) {
    setEpisodes(null);
    setFailed(false);
    setSeason(next);
  }

  useEffect(() => {
    if (season === null) return;
    let current = true;
    void (async () => {
      try {
        const body = await request<{
          episodes: { episodeNumber: number; title: string }[];
        }>(
          `/api/library/search?providerId=${encodeURIComponent(providerId)}&season=${season}`,
        );
        if (current) setEpisodes(body.episodes);
      } catch (error) {
        if (current) {
          setFailed(true);
          toast.error(requestError(locale, error));
        }
      }
    })();
    return () => {
      current = false;
    };
  }, [providerId, season, locale]);

  if (season === null)
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          {t("report.step.where")}
        </p>
        <div className="flex flex-wrap gap-2">
          {/* The series as a whole is an answer whatever happens to the
              seasons, so it is drawn for real from the first paint. */}
          <Button variant="secondary" onClick={() => onPick(null, null)}>
            {t("report.wholeSeries")}
          </Button>
          {seasons === null && !failed ? (
            <PlaceSkeleton label={t("common.loading")} />
          ) : (
            (seasons ?? []).map((number) => (
              <Button
                key={number}
                variant="outline"
                onClick={() => chooseSeason(number)}
              >
                {t("report.season", { number })}
              </Button>
            ))
          )}
        </div>
        {failed ? (
          <p className="text-muted-foreground text-sm">
            {t("report.placeFailed")}
          </p>
        ) : null}
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {t("report.season", { number: season })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => onPick(season, null)}>
          {t("report.wholeSeason")}
        </Button>
        {episodes === null && !failed ? (
          <PlaceSkeleton label={t("common.loading")} />
        ) : (
          (episodes ?? []).map((episode) => (
            <Button
              key={episode.episodeNumber}
              variant="outline"
              size="sm"
              onClick={() => onPick(season, episode.episodeNumber)}
            >
              {t("report.episode", { number: episode.episodeNumber })}
            </Button>
          ))
        )}
      </div>
      {failed ? (
        <p className="text-muted-foreground text-sm">
          {t("season.unavailable")}
        </p>
      ) : null}
      <Button variant="ghost" size="sm" onClick={() => chooseSeason(null)}>
        {t("common.back")}
      </Button>
    </div>
  );
}

/**
 * The choices before they are known: a handful of pills the size of the ones
 * about to land, so the row does not jump when they do.
 */
function PlaceSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label} className="flex flex-wrap gap-2">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-9 w-24 rounded-lg" />
      ))}
    </LoadingRegion>
  );
}
