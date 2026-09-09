"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FlagIcon, SearchIcon, SpinnerIcon } from "@/components/icons";
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
import type { ReportReason } from "@/lib/db/schema";
import type { LibraryMatch } from "@/lib/domain/library";
import { translateError, type TranslationKey } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";
import { reasonsFor, targetOf } from "@/lib/reports/reasons";

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
  const [placed, setPlaced] = useState(preset?.kind === "movie");
  const [sending, setSending] = useState(false);

  async function send(reason: ReportReason) {
    if (!target) return;
    setSending(true);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: target.kind,
          providerId: target.providerId,
          seasonNumber,
          episodeNumber,
          reason,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      toast.success(t(body.joined ? "report.joined" : "report.sent"));
      onDone();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateError(locale, undefined),
      );
    } finally {
      setSending(false);
    }
  }

  if (!target)
    return (
      <TitleStep
        onPick={(match) => {
          setTarget(match);
          setPlaced(match.kind === "movie");
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

  const reasons = reasonsFor(
    targetOf(target.kind, seasonNumber, episodeNumber),
  );

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">{t("report.step.why")}</p>
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
        const response = await fetch(
          `/api/library/search?q=${encodeURIComponent(trimmed)}`,
        );
        const body = await response.json();
        if (current && response.ok) setResults(body.results as LibraryMatch[]);
      } finally {
        if (current) setLoading(false);
      }
    }, 300);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [trimmed, tooShort]);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">{t("report.step.what")}</p>
      <div className="border-border/70 focus-within:border-primary/50 flex items-center gap-2 rounded-lg border px-3 transition-colors">
        <SearchIcon className="text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("report.searchPlaceholder")}
          aria-label={t("report.searchPlaceholder")}
          className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        {loading ? <SpinnerIcon className="text-muted-foreground" /> : null}
      </div>

      {tooShort || results === null ? (
        <p className="text-muted-foreground text-xs">
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

/** Step two: where in the series, from what the server actually holds. */
function PlaceStep({
  providerId,
  onPick,
}: {
  providerId: string;
  onPick: (season: number | null, episode: number | null) => void;
}) {
  const t = useTranslator();
  const [seasons, setSeasons] = useState<number[] | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<
    { episodeNumber: number; title: string }[] | null
  >(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      const response = await fetch(
        `/api/library/search?providerId=${encodeURIComponent(providerId)}`,
      );
      const body = await response.json();
      if (current && response.ok) setSeasons(body.seasons as number[]);
    })();
    return () => {
      current = false;
    };
  }, [providerId]);

  useEffect(() => {
    if (season === null) return;
    let current = true;
    void (async () => {
      const response = await fetch(
        `/api/library/search?providerId=${encodeURIComponent(providerId)}&season=${season}`,
      );
      const body = await response.json();
      if (current && response.ok) setEpisodes(body.episodes);
    })();
    return () => {
      current = false;
    };
  }, [providerId, season]);

  if (season === null)
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          {t("report.step.where")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onPick(null, null)}>
            {t("report.wholeSeries")}
          </Button>
          {(seasons ?? []).map((number) => (
            <Button
              key={number}
              variant="outline"
              onClick={() => setSeason(number)}
            >
              {t("report.season", { number })}
            </Button>
          ))}
        </div>
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
        {(episodes ?? []).map((episode) => (
          <Button
            key={episode.episodeNumber}
            variant="outline"
            size="sm"
            onClick={() => onPick(season, episode.episodeNumber)}
          >
            {t("report.episode", { number: episode.episodeNumber })}
          </Button>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={() => setSeason(null)}>
        {t("common.back")}
      </Button>
    </div>
  );
}
