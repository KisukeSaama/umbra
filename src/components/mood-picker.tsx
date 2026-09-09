"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { SparkleIcon, SpinnerIcon } from "@/components/icons";
import { Poster } from "@/components/poster";
import { Button } from "@/components/ui/button";
import {
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
 * It used to be a die: one random title, take it or roll again. Three closed
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
  const [format, setFormat] = useState<Format | null>(null);
  const [duration, setDuration] = useState<Duration | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [loading, setLoading] = useState(false);

  async function roll(next: {
    mood: Mood;
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
              disabled={loading || !mood || !format || !duration}
              onClick={() =>
                mood &&
                format &&
                duration &&
                void roll({ mood, format, duration })
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
            <ul className="grid grid-cols-3 gap-4 sm:grid-cols-3">
              {selection.tonight.map((item) => (
                <li key={item.ratingKey} className="group">
                  <Poster src={item.posterUrl} alt={item.title} sizes="10rem" />
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
                <li key={`${item.kind}:${item.providerId}`} className="group">
                  <Link
                    href={`/title/${item.kind}/${item.providerId}`}
                    className="focus-visible:ring-ring/50 block rounded-lg outline-none focus-visible:ring-3"
                  >
                    <Poster
                      src={item.posterUrl}
                      alt={item.title}
                      sizes="8rem"
                    />
                    <p className="mt-2 truncate text-sm font-medium">
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

      {mood && format ? (
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
            void roll({ mood, format, duration: picked });
          }}
        />
      ) : null}

      {loading ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <SpinnerIcon />
          {t("common.loading")}
        </p>
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
