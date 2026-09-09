"use client";

import { DiceIcon, SearchIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Poster } from "@/components/poster";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { translateError } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";

type DiscoveredItem = {
  title: string;
  kind: "movie" | "show" | "episode";
  year: number | null;
  posterUrl: string | null;
};

/**
 * The one input that matters on this site, plus the escape hatch for people who
 * came without an idea.
 */
export function HeroSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();

  const [query, setQuery] = useState(initialQuery);
  const [rolling, setRolling] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredItem | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    router.push(`/request?q=${encodeURIComponent(trimmed)}`);
  }

  async function discover() {
    setRolling(true);
    try {
      const response = await fetch("/api/discover");
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));
      if (!body.item) {
        toast(t("common.empty"));
        return;
      }
      setDiscovered(body.item as DiscoveredItem);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateError(locale, undefined),
      );
    } finally {
      setRolling(false);
    }
  }

  return (
    <>
      <form
        onSubmit={submit}
        className="border-border/70 bg-card/70 focus-within:border-primary/50 mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-2xl border p-2 shadow-lg backdrop-blur transition-colors sm:flex-row sm:items-center sm:rounded-full"
      >
        <div className="flex flex-1 items-center gap-3 px-3">
          <SearchIcon className="text-muted-foreground size-5" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("home.searchPlaceholder")}
            aria-label={t("common.search")}
            className="h-11 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="flex items-center gap-2 sm:border-l sm:pl-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void discover()}
            disabled={rolling}
            title={t("home.discoverHint")}
            className="h-11 flex-1 justify-start gap-2 rounded-full px-4 text-left sm:flex-none"
          >
            <DiceIcon />
            <span className="text-sm leading-tight">{t("home.discover")}</span>
          </Button>
          <Button type="submit" className="h-11 rounded-full px-5 sm:px-6">
            {t("common.search")}
          </Button>
        </div>
      </form>

      <Dialog
        open={discovered !== null}
        onOpenChange={(open) => !open && setDiscovered(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("home.discover")}</DialogTitle>
            <DialogDescription>{t("home.discoverHint")}</DialogDescription>
          </DialogHeader>
          {discovered ? (
            <div className="flex gap-4">
              <div className="w-28 shrink-0">
                <Poster
                  src={discovered.posterUrl}
                  alt={discovered.title}
                  sizes="7rem"
                />
              </div>
              <div className="space-y-1">
                <p className="text-lg leading-tight font-medium">
                  {discovered.title}
                </p>
                <p className="text-muted-foreground text-sm">
                  {discovered.kind === "movie"
                    ? t("common.movie")
                    : t("common.series")}
                  {discovered.year ? ` - ${discovered.year}` : ""}
                </p>
                <p className="text-primary pt-2 text-sm">
                  {t("status.available")}
                </p>
              </div>
            </div>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => void discover()}
            disabled={rolling}
          >
            {t("common.retry")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
