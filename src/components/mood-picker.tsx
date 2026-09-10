"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { SparkleIcon, SpinnerIcon } from "@/components/icons";
import { Poster } from "@/components/poster";
import { LoadingRegion, TextLine } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
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

  const [mood, setMood] = useState<Mood | null>(null);
  // Second, and not last: what a title is about and whether it is drawn are two
  // questions, and this one narrows the mood rather than the evening.
  const [anime, setAnime] = useState<AnimeStance | null>(null);
  const [format, setFormat] = useState<Format | null>(null);
  const [duration, setDuration] = useState<Duration | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [loading, setLoading] = useState(false);

  async function roll(next: {
    mood: Mood;
    anime: AnimeStance;
    format: Format;
    duration: Duration;
  }) {
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
              disabled={loading || !mood || !anime || !format || !duration}
              onClick={() =>
                mood &&
                anime &&
                format &&
                duration &&
                void roll({ mood, anime, format, duration })
              }
            >
              {loading ? <SpinnerIcon /> : <SparkleIcon />}
              {t("picker.again")}
            </Button>
            <Button variant="ghost" size="sm" onClick={restart}>
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
                  <Poster
                    src={item.posterUrl}
                    alt={item.title}
                    captioned
                    sizes="8rem"
                  />
                  <p className="mt-2 truncate text-sm font-medium">
                    {item.title}
                  </p>
                  <p className="text-primary text-xs">
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
                      src={item.posterUrl}
                      alt={item.title}
                      captioned
                      sizes="8rem"
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

  return (
    <div className="space-y-6">
      <Question
        label={t("picker.mood")}
        answered={mood !== null}
        options={MOODS.map((value) => ({
          value,
          label: t(`picker.mood.${value}` as TranslationKey),
        }))}
        selected={mood}
        onPick={(value) => setMood(value as Mood)}
      />

      {mood ? (
        <Question
          label={t("picker.anime")}
          answered={anime !== null}
          options={ANIME_STANCES.map((value) => ({
            value,
            label: t(`picker.anime.${value}` as TranslationKey),
          }))}
          selected={anime}
          onPick={(value) => setAnime(value as AnimeStance)}
        />
      ) : null}

      {mood && anime ? (
        <Question
          label={t("picker.format")}
          answered={format !== null}
          options={FORMATS.map((value) => ({
            value,
            label: t(`picker.format.${value}` as TranslationKey),
          }))}
          selected={format}
          onPick={(value) => setFormat(value as Format)}
        />
      ) : null}

      {mood && anime && format ? (
        <Question
          label={t("picker.duration")}
          answered={duration !== null}
          options={DURATIONS.map((value) => ({
            value,
            label: t(`picker.duration.${value}` as TranslationKey),
          }))}
          selected={duration}
          onPick={(value) => {
            const picked = value as Duration;
            setDuration(picked);
            void roll({ mood, anime, format, duration: picked });
          }}
        />
      ) : null}
    </div>
  );
}

function Question({
  label,
  options,
  selected,
  onPick,
}: {
  label: string;
  answered: boolean;
  options: { value: string; label: string }[];
  selected: string | null;
  onPick: (value: string) => void;
}) {
  return (
    <fieldset className="umbra-rise">
      <legend className="text-muted-foreground mb-3 text-sm">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            variant={selected === option.value ? "default" : "outline"}
            // The ochre fill is the whole answer on screen, and it is not one a
            // screen reader is told about unless the button says so.
            aria-pressed={selected === option.value}
            onClick={() => onPick(option.value)}
            className="rounded-full"
          >
            {option.label}
          </Button>
        ))}
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
