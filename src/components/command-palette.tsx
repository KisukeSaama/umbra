"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { CheckIcon, SearchIcon, SpinnerIcon } from "@/components/icons";
import { Poster } from "@/components/poster";
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
import type { CatalogResult } from "@/lib/domain/catalog";
import { translateError } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";

/**
 * Search, from anywhere.
 *
 * Checking whether something is already on the server is the gesture members
 * repeat most, so it stopped being a page you navigate to and became a key you
 * press. The three states still decide everything: available says so, requested
 * says so, and only an absent title gets a button.
 */
export function CommandPalette({
  variant = "icon",
}: {
  /** The header carries a magnifier; the hero carries a field you can read. */
  variant?: "icon" | "hero";
}) {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  // Keeps a slow answer from overwriting a newer one.
  const requestId = useRef(0);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    const key = `${result.kind}:${result.providerId}`;
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
      router.refresh();
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
    <Dialog open={open} onOpenChange={setOpen}>
      {variant === "hero" ? (
        <DialogTrigger
          render={<Button variant="outline" size="lg" />}
          className="rounded-full px-6"
        >
          <SearchIcon />
          {t("common.search")}
        </DialogTrigger>
      ) : (
        <DialogTrigger
          render={<Button variant="ghost" size="icon" />}
          aria-label={t("common.search")}
          title={t("home.searchHint")}
        >
          <SearchIcon className="size-5" />
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("common.search")}</DialogTitle>
          <DialogDescription>{t("search.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="border-border/70 focus-within:border-primary/50 flex items-center gap-2 rounded-lg border px-3 transition-colors">
          <SearchIcon className="text-muted-foreground size-5" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("home.searchPlaceholder")}
            aria-label={t("common.search")}
            className="h-11 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          {loading ? <SpinnerIcon className="text-muted-foreground" /> : null}
        </div>

        {tooShort || results === null ? (
          <p className="text-muted-foreground text-sm">{t("search.hint")}</p>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("search.noResults")}
          </p>
        ) : (
          <ul className="max-h-[26rem] space-y-2 overflow-y-auto">
            {results.slice(0, 12).map((result) => {
              const key = `${result.kind}:${result.providerId}`;
              const availability = sent[key]
                ? "requested"
                : result.availability;

              return (
                <li key={key} className="flex items-center gap-3">
                  <div className="w-12 shrink-0">
                    <Poster
                      src={result.posterUrl}
                      alt={result.title}
                      sizes="3rem"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push(`/title/${result.kind}/${result.providerId}`);
                    }}
                    className="focus-visible:ring-ring/50 min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-3"
                  >
                    <p className="truncate text-sm font-medium">
                      {result.title}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {result.kind === "movie"
                        ? t("common.movie")
                        : t("common.series")}
                      {result.year ? ` · ${result.year}` : ""}
                    </p>
                  </button>

                  {availability === "available" ? (
                    <span className="text-primary flex shrink-0 items-center gap-1 text-xs">
                      <CheckIcon />
                      {t("status.available")}
                    </span>
                  ) : availability === "requested" ? (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {t("status.requested")}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      disabled={pending === key}
                      onClick={() => void request(result)}
                    >
                      {pending === key
                        ? t("status.requesting")
                        : t("status.request")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
