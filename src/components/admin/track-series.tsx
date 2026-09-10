"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { request, requestError } from "@/components/client-api";
import { PlusIcon, SearchIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogResult } from "@/lib/domain/catalog";
import { useLocale, useTranslator } from "@/lib/i18n/client";

/** Enough to find the right show without turning the card into a catalogue. */
const MAX_RESULTS = 6;

/**
 * Puts a series under watch by hand.
 *
 * Accepting a request is what usually starts the tracker; this is for a show
 * nobody asked for that the server keeps anyway. It searches the same catalogue
 * as the palette, keeps the series alone, and tracking one that is already
 * tracked simply turns it back on, so there is no state to guard here.
 */
export function TrackSeries() {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogResult[] | null>(null);
  const [loading, setLoading] = useState(false);
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
        const body = await request<{ results: CatalogResult[] }>(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
        );
        if (current !== requestId.current) return;
        setResults(body.results.filter((result) => result.kind === "tv"));
      } catch (error) {
        if (current !== requestId.current) return;
        setResults([]);
        toast.error(requestError(locale, error));
      } finally {
        if (current === requestId.current) setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [trimmed, tooShort, locale]);

  async function track(result: CatalogResult) {
    setPending(result.providerId);
    try {
      await request("/api/admin/series", {
        method: "POST",
        body: { providerId: result.providerId },
      });
      toast.success(t("admin.series.added", { title: result.title }));
      setQuery("");
      setResults(null);
      router.refresh();
    } catch (error) {
      toast.error(requestError(locale, error));
    } finally {
      setPending(null);
    }
  }

  const visible = tooShort || !results ? [] : results.slice(0, MAX_RESULTS);

  return (
    <div className="space-y-2">
      <div className="relative">
        <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 -translate-y-1/2" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("admin.series.addPlaceholder")}
          aria-label={t("admin.series.add")}
          className="pl-8"
        />
        {loading ? (
          <SpinnerIcon className="text-muted-foreground absolute top-1/2 right-2.5 -translate-y-1/2" />
        ) : null}
      </div>

      {!tooShort && results && !loading && visible.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("admin.series.noResult")}
        </p>
      ) : null}

      {visible.length > 0 ? (
        <ul className="divide-border/60 ring-border divide-y rounded-lg ring-1">
          {visible.map((result) => (
            <li
              key={result.providerId}
              className="flex items-center gap-3 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{result.title}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {[
                    result.year,
                    result.originalTitle !== result.title
                      ? result.originalTitle
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending !== null}
                onClick={() => void track(result)}
              >
                {pending === result.providerId ? <SpinnerIcon /> : <PlusIcon />}
                {t("admin.series.track")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
