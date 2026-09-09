"use client";

import { CheckIcon, SearchIcon, SpinnerIcon } from "@/components/icons";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Poster } from "@/components/poster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Availability, CatalogResult } from "@/lib/domain/catalog";
import { translateError } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";

/**
 * Search and request, in one screen.
 *
 * Every result is in one of three states, and the state decides what can be
 * done with it: available means nothing to do, requested means someone already
 * asked, and only an absent title gets a button.
 */
export function SearchPanel({ initialQuery = "" }: { initialQuery?: string }) {
  const t = useTranslator();
  const locale = useLocale();

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CatalogResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<string | null>(null);

  // Keeps a slow answer from overwriting a newer one.
  const requestId = useRef(0);

  const trimmed = query.trim();
  const tooShort = trimmed.length < 2;

  useEffect(() => {
    if (tooShort) return;

    const current = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
        );
        const body = await response.json();
        if (current !== requestId.current) return;
        if (!response.ok)
          throw new Error(translateError(locale, body.messageKey));
        setResults(body.results as CatalogResult[]);
      } catch (error) {
        if (current !== requestId.current) return;
        setResults([]);
        toast.error(
          error instanceof Error
            ? error.message
            : translateError(locale, undefined),
        );
      } finally {
        if (current === requestId.current) setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [trimmed, tooShort, locale]);

  async function request(result: CatalogResult) {
    const key = resultKey(result);
    setPending(key);
    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: result.kind,
          providerId: result.providerId,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));

      setSent((previous) => ({ ...previous, [key]: true }));
      toast.success(t("status.requestSent"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateError(locale, undefined),
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-border/70 bg-card/70 focus-within:border-primary/50 flex items-center gap-3 rounded-full border px-4 transition-colors">
        <SearchIcon className="text-muted-foreground size-5" />
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("home.searchPlaceholder")}
          aria-label={t("common.search")}
          className="h-12 rounded-none border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        {loading ? <SpinnerIcon className="text-muted-foreground" /> : null}
      </div>

      {tooShort ? (
        <p className="text-muted-foreground text-sm">{t("search.hint")}</p>
      ) : results === null ? (
        <ResultSkeletons />
      ) : results.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("search.noResults")}</p>
      ) : (
        <ul className="space-y-3">
          {results.map((result) => {
            const key = resultKey(result);
            const availability: Availability = sent[key]
              ? "requested"
              : result.availability;

            return (
              <li
                key={key}
                className="border-border/60 bg-card/40 flex gap-4 rounded-xl border p-3 sm:p-4"
              >
                <div className="w-20 shrink-0 sm:w-24">
                  <Poster
                    src={result.posterUrl}
                    alt={result.title}
                    sizes="6rem"
                  />
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="font-medium">{result.title}</p>
                    {result.year ? (
                      <span className="text-muted-foreground text-sm">
                        {result.year}
                      </span>
                    ) : null}
                    <Badge variant="outline" className="ml-auto shrink-0">
                      {result.kind === "movie"
                        ? t("common.movie")
                        : t("common.series")}
                    </Badge>
                  </div>

                  {result.originalTitle ? (
                    <p className="text-muted-foreground truncate text-xs">
                      {result.originalTitle}
                    </p>
                  ) : null}

                  {result.overview ? (
                    <p className="text-muted-foreground line-clamp-2 text-sm">
                      {result.overview}
                    </p>
                  ) : null}

                  <div className="mt-auto pt-2">
                    {availability === "available" ? (
                      <span className="text-primary flex items-center gap-1.5 text-sm">
                        <CheckIcon />
                        {t("status.available")}
                      </span>
                    ) : availability === "requested" ? (
                      <span className="text-muted-foreground text-sm">
                        {sent[key]
                          ? t("status.requestSent")
                          : t("status.requested")}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => void request(result)}
                        disabled={pending === key}
                      >
                        {pending === key
                          ? t("status.requesting")
                          : t("status.request")}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ResultSkeletons() {
  return (
    <ul className="space-y-3">
      {[0, 1, 2].map((index) => (
        <li
          key={index}
          className="border-border/60 flex gap-4 rounded-xl border p-3 sm:p-4"
        >
          <Skeleton className="aspect-[2/3] w-20 shrink-0 rounded-lg sm:w-24" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function resultKey(result: CatalogResult) {
  return `${result.kind}:${result.providerId}`;
}
