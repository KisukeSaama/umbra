"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { SpinnerIcon } from "@/components/icons";
import { Poster } from "@/components/poster";
import { LoadingRegion, TextLine } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  COMMITMENTS,
  type Commitment,
  ANIME_STANCES,
  type AnimeStance,
  DURATIONS,
  type Duration,
  FORMATS,
  type Format,
  type Mood,
  MOODS,
} from "@/lib/discovery/moods";
import type { CatalogResult } from "@/lib/domain/catalog";
import { translateError, type TranslationKey } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";

type Selection = {
  tonight: {
    ratingKey: string;
    title: string;
    year: number | null;
    posterUrl: string | null;
    plexUrl: string | null;
    voteAverage?: number | null;
    voteCount?: number;
  }[];
  ideas: CatalogResult[];
};

/**
 * "I do not know what to watch", answered properly.
 *
 * It used to be a die: one random title, take it or roll again. Four closed
 * questions turn that into an actual suggestion, and the answer comes back in
 * two halves on purpose. What is already on the server can be watched tonight;
 * what is not can be asked for. Both are useful, and they are useful for
 * different reasons.
 *
 * Not one free-text field in the whole thing.
 */
export function MoodPicker() {
  const t = useTranslator();
  const locale = useLocale();
  function ratingLabel(item: {
    voteAverage?: number | null;
    voteCount?: number;
  }) {
    const score = item.voteAverage;
    if (
      score == null ||
      !Number.isFinite(score) ||
      score <= 0 ||
      score > 10 ||
      (item.voteCount ?? 0) < 50
    )
      return undefined;
    return t("picker.tmdbRating", {
      rating: new Intl.NumberFormat(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(score),
    });
  }

  const [mood, setMood] = useState<Mood | null>(null);
  const [anime, setAnime] = useState<AnimeStance | null>(null);
  const [format, setFormat] = useState<Format | null>(null);
  const [duration, setDuration] = useState<Duration | null>(null);
  const [commitment, setCommitment] = useState<Commitment | null>(null);
  const [lastRequest, setLastRequest] = useState<Record<string, string> | null>(
    null,
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [loading, setLoading] = useState(false);

  async function roll(next: Record<string, string>) {
    setLastRequest(next);
    setLoading(true);
    try {
      const params = new URLSearchParams(next);
      const response = await fetch(`/api/discover/picks?${params}`);
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));
      setSelection(body as Selection);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateError(locale, undefined),
      );
    } finally {
      setLoading(false);
    }
  }

  function restart() {
    setMood(null);
    setAnime(null);
    setFormat(null);
    setDuration(null);
    setCommitment(null);
    setLastRequest(null);
    setSelection(null);
  }

  if (selection)
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("picker.result")}
          </h2>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={loading || !lastRequest}
              onClick={() => lastRequest && void roll(lastRequest)}
            >
              {loading ? <SpinnerIcon /> : null}
              {t("picker.again")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={restart}
            >
              {t("picker.restart")}
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          {t("picker.resultHint")}
        </p>

        {selection.tonight.length > 0 ? (
          <section>
            <h3 className="mb-3 text-sm font-semibold">
              {t("section.onServer")}
            </h3>
            {/* The same grid as the second half: two lists on one screen with
                three columns on one and six on the other made the posters of
                the evening bigger than the posters to ask for, for no reason
                either of them could give. */}
            <ul className="grid grid-cols-3 gap-4 sm:grid-cols-6">
              {selection.tonight.map((item) => (
                <li key={item.ratingKey}>
                  <AvailableTitleLink href={item.plexUrl}>
                    <Poster
                      src={item.posterUrl?.replace("/w342/", "/w500/") ?? null}
                      alt={item.title}
                      ratingLabel={ratingLabel(item)}
                      captioned
                      sizes="(min-width: 1440px) 210px, (min-width: 640px) 17vw, 33vw"
                    />
                    <p className="mt-2 truncate text-sm font-medium group-hover:underline">
                      {item.title}
                    </p>
                  </AvailableTitleLink>
                  <p className="text-primary text-sm">
                    {t("status.available")}
                  </p>
                  {item.plexUrl ? (
                    <a
                      href={item.plexUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-visible:ring-ring/50 mt-1 inline-block rounded-sm text-xs underline underline-offset-4 outline-none focus-visible:ring-3"
                    >
                      {t("picker.openPlex")}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {selection.ideas.length > 0 ? (
          <section>
            <h3 className="mb-3 text-sm font-semibold">{t("section.ideas")}</h3>
            <ul className="grid grid-cols-3 gap-4 sm:grid-cols-6">
              {selection.ideas.map((item) => (
                <li key={`${item.kind}:${item.providerId}`}>
                  <Link
                    href={`/title/${item.kind}/${item.providerId}`}
                    className="group focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-3"
                  >
                    <Poster
                      src={item.posterUrl?.replace("/w342/", "/w500/") ?? null}
                      alt={item.title}
                      ratingLabel={ratingLabel(item)}
                      captioned
                      sizes="(min-width: 1440px) 210px, (min-width: 640px) 17vw, 33vw"
                    />
                    <p className="mt-2 truncate text-sm font-medium group-hover:underline">
                      {item.title}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {selection.tonight.length === 0 && selection.ideas.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("discover.empty")}</p>
        ) : null}
      </div>
    );

  // The last answer is the ask itself, so the questions have done their job:
  // what stands here now is the shape of the selection about to land.
  if (loading) return <SelectionSkeleton label={t("common.loading")} />;

  const options = (axis: string, values: readonly string[]) =>
    values.map((value) => ({
      value,
      label: t(`picker.${axis}.${value}` as TranslationKey),
      hint: t(`picker.${axis}.${value}.hint` as TranslationKey),
    }));
  const ready =
    mood &&
    anime &&
    format &&
    (format === "movie" ? duration : format === "series" ? commitment : true);

  return (
    <div className="space-y-6">
      <Question
        label={t("picker.format")}
        action={
          <div className="ml-auto max-w-xs space-y-2 text-right">
            <Button
              variant="secondary"
              onClick={() => void roll({ mode: "surprise" })}
            >
              {t("picker.surprise")}
            </Button>
            <p className="text-muted-foreground text-sm">
              {t("picker.surprise.hint")}
            </p>
          </div>
        }
        options={options("format", FORMATS)}
        selected={format}
        onPick={(value) => {
          setFormat(value as Format);
          setDuration(null);
          setCommitment(null);
        }}
      />
      {format ? (
        <Question
          label={t("picker.mood")}
          options={options("mood", MOODS)}
          selected={mood}
          onPick={(value) => setMood(value as Mood)}
        />
      ) : null}
      {format && mood ? (
        <Question
          label={t("picker.anime")}
          options={options("anime", ANIME_STANCES)}
          selected={anime}
          onPick={(value) => setAnime(value as AnimeStance)}
        />
      ) : null}
      {format && mood && anime && format === "movie" ? (
        <Question
          label={t("picker.duration")}
          options={options("duration", DURATIONS)}
          selected={duration}
          onPick={(value) => setDuration(value as Duration)}
        />
      ) : null}
      {format && mood && anime && format === "series" ? (
        <Question
          label={t("picker.commitment")}
          options={options("commitment", COMMITMENTS)}
          selected={commitment}
          onPick={(value) => setCommitment(value as Commitment)}
        />
      ) : null}
      {ready ? (
        <Button
          onClick={() =>
            void roll({
              mood,
              anime,
              format,
              duration: duration ?? "any",
              commitment: commitment ?? "any",
            })
          }
        >
          {t("picker.submit")}
        </Button>
      ) : null}
    </div>
  );
}

function AvailableTitleLink({
  href,
  children,
}: {
  href: string | null;
  children: ReactNode;
}) {
  if (!href) return <>{children}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-3"
    >
      {children}
    </a>
  );
}

function Question({
  label,
  options,
  selected,
  onPick,
  action,
}: {
  label: string;
  action?: ReactNode;
  options: { value: string; label: string; hint: string }[];
  selected: string | null;
  onPick: (value: string) => void;
}) {
  const hintId = useId();
  return (
    <fieldset className="umbra-fade">
      <legend className="text-muted-foreground mb-3 text-sm">{label}</legend>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <Button
                key={option.value}
                variant={selected === option.value ? "default" : "outline"}
                // The ochre fill is the whole answer on screen, and it is not one a
                // screen reader is told about unless the button says so.
                aria-pressed={selected === option.value}
                aria-describedby={
                  selected === option.value ? hintId : undefined
                }
                onClick={() => onPick(option.value)}
                className="rounded-full"
              >
                {option.label}
              </Button>
            ))}
          </div>
          <p
            id={hintId}
            aria-live="polite"
            className="text-muted-foreground mt-2 min-h-5 text-sm"
          >
            {options.find((option) => option.value === selected)?.hint}
          </p>
        </div>
        {action}
      </div>
    </fieldset>
  );
}

/** The selection before it is known: its heading row, its hint, one grid of posters. */
function SelectionSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label} className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <TextLine size="h2" className="w-48 max-w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>
      <TextLine size="sm" className="w-72 max-w-full" />
      <div>
        <TextLine size="sm" className="mb-3 w-32" />
        <ul className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <li key={index}>
              <Skeleton className="aspect-[2/3] w-full rounded-lg" />
              <TextLine size="sm" className="mt-2 w-3/4" />
            </li>
          ))}
        </ul>
      </div>
    </LoadingRegion>
  );
}
