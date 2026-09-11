"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { formatPosterScore } from "@/components/formatting";
import { SpinnerIcon } from "@/components/icons";
import { Poster } from "@/components/poster";
import { LoadingRegion, TextLine } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  COMMITMENTS,
  type Commitment,
  VISUAL_STYLES,
  type VisualStyle,
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
    providerId: string | null;
    kind: "movie" | "tv";
    title: string;
    year: number | null;
    posterUrl: string | null;
    voteAverage?: number | null;
    voteCount?: number;
  }[];
  ideas: CatalogResult[];
};

type RollRequest = Record<string, string | string[]>;
const SKIPPED_STORAGE_KEY = "umbra-picker-skipped";

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
    return formatPosterScore(item.voteAverage, item.voteCount, locale);
  }

  const [moods, setMoods] = useState<Mood[]>([]);
  const [visualStyles, setVisualStyles] = useState<VisualStyle[]>([]);
  const [format, setFormat] = useState<Format | null>(null);
  const [duration, setDuration] = useState<Duration | null>(null);
  const [commitment, setCommitment] = useState<Commitment | null>(null);
  const [lastRequest, setLastRequest] = useState<RollRequest | null>(null);
  const skipped = useRef(new Set<string>());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(SKIPPED_STORAGE_KEY) ?? "[]",
      );
      if (Array.isArray(saved))
        skipped.current = new Set(
          saved
            .filter(
              (key): key is string =>
                typeof key === "string" && /^(movie|tv):\d+$/.test(key),
            )
            .slice(-240),
        );
    } catch {
      try {
        sessionStorage.removeItem(SKIPPED_STORAGE_KEY);
      } catch {}
    }
  }, []);

  async function roll(next: RollRequest, skipCurrent = false) {
    if (skipCurrent && selection) {
      for (const item of selection.tonight)
        if (item.providerId)
          skipped.current.add(`${item.kind}:${item.providerId}`);
      for (const item of selection.ideas)
        skipped.current.add(`${item.kind}:${item.providerId}`);
      try {
        sessionStorage.setItem(
          SKIPPED_STORAGE_KEY,
          JSON.stringify([...skipped.current].slice(-240)),
        );
      } catch {}
    }
    setLastRequest(next);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(next)) {
        for (const entry of Array.isArray(value) ? value : [value])
          params.append(key, entry);
      }
      for (const key of skipped.current) params.append("exclude", key);
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
    setMoods([]);
    setVisualStyles([]);
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
              onClick={() => lastRequest && void roll(lastRequest, true)}
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
                  <p className="text-primary text-sm">
                    {t("status.available")}
                  </p>
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
    moods.length > 0 &&
    visualStyles.length > 0 &&
    format &&
    (format === "movie" ? duration : format === "series" ? commitment : true);

  return (
    <div className="space-y-7">
      {/* "Surprise me" answers the whole questionnaire at once, so it stands
          beside the title of it rather than at the end of its first question. */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {t("picker.title")}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("picker.openHint")}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void roll({ mode: "surprise" })}
        >
          {t("picker.surprise")}
        </Button>
      </header>
      <Question
        label={t("picker.format")}
        options={options("format", FORMATS)}
        selected={format ? [format] : []}
        showHint={false}
        onPick={(value) => {
          setFormat(value as Format);
          setDuration(null);
          setCommitment(null);
        }}
      />
      {format ? (
        <Question
          label={t("picker.mood")}
          note={t("picker.multipleChoices")}
          options={options("mood", MOODS)}
          selected={moods}
          onPick={(raw) => {
            const value = raw as Mood;
            setMoods((current) =>
              value === "any"
                ? ["any"]
                : current.includes(value)
                  ? current.filter((item) => item !== value)
                  : [...current.filter((item) => item !== "any"), value],
            );
          }}
        />
      ) : null}
      {format && moods.length > 0 ? (
        <Question
          label={t("picker.visualStyle")}
          note={t("picker.multipleChoices")}
          options={options("visualStyle", VISUAL_STYLES)}
          selected={visualStyles}
          showHint={false}
          onPick={(raw) => {
            const value = raw as VisualStyle;
            setVisualStyles((current) =>
              current.includes(value)
                ? current.filter((item) => item !== value)
                : [...current, value],
            );
          }}
        />
      ) : null}
      {format &&
      moods.length > 0 &&
      visualStyles.length > 0 &&
      format === "movie" ? (
        <Question
          label={t("picker.duration")}
          options={options("duration", DURATIONS)}
          selected={duration ? [duration] : []}
          showHint={false}
          onPick={(value) => setDuration(value as Duration)}
        />
      ) : null}
      {format &&
      moods.length > 0 &&
      visualStyles.length > 0 &&
      format === "series" ? (
        <Question
          label={t("picker.commitment")}
          options={options("commitment", COMMITMENTS)}
          selected={commitment ? [commitment] : []}
          showHint={false}
          onPick={(value) => setCommitment(value as Commitment)}
        />
      ) : null}
      {format ? (
        <div className="border-border flex flex-wrap gap-2 border-t pt-6">
          {ready ? (
            <Button
              onClick={() =>
                void roll({
                  mood: moods,
                  visualStyle: visualStyles,
                  format,
                  duration: duration ?? "any",
                  commitment: commitment ?? "any",
                })
              }
            >
              {t("picker.submit")}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={restart}>
            {t("picker.reset")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Question({
  label,
  note,
  options,
  selected,
  onPick,
  showHint = true,
}: {
  label: string;
  note?: string;
  options: { value: string; label: string; hint: string }[];
  selected: string[];
  onPick: (value: string) => void;
  showHint?: boolean;
}) {
  const hintId = useId();
  return (
    <fieldset className="umbra-fade">
      <legend className="mb-3 text-sm font-medium">
        {label}
        {note ? (
          <span className="text-muted-foreground ml-1 font-normal">
            ({note})
          </span>
        ) : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            variant={selected.includes(option.value) ? "default" : "outline"}
            // The ochre fill is the whole answer on screen, and it is not one a
            // screen reader is told about unless the button says so.
            aria-pressed={selected.includes(option.value)}
            aria-describedby={
              showHint && selected.includes(option.value) ? hintId : undefined
            }
            onClick={() => onPick(option.value)}
            className="rounded-full"
          >
            {option.label}
          </Button>
        ))}
      </div>
      {/* A hint is a sentence, and the Every Age Rule keeps sentences at the
          body sizes: 13px is for dates and counts. */}
      {showHint ? (
        <p
          id={hintId}
          aria-live="polite"
          className="text-muted-foreground mt-2 min-h-5 text-sm"
        >
          {options
            .filter((option) => selected.includes(option.value))
            .map((option) => option.hint)
            .join(" ")}
        </p>
      ) : null}
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
