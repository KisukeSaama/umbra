"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { request, requestError } from "@/components/client-api";
import {
  CheckIcon,
  CircleHalfIcon,
  SearchIcon,
  SpinnerIcon,
} from "@/components/icons";
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
import { useLocale, useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Where the palette is, for everything that wants to open it.
 *
 * There is one search dialog on a page and there has to be one: the header and
 * the home hero each used to mount their own, so the shortcut opened two at
 * once and Escape closed the top one only. What is open, and what is typed in
 * it, therefore lives beside the component rather than inside it, in a store
 * small enough to be read at a glance: a flag, a string, and the subscribers
 * React hands `useSyncExternalStore`.
 *
 * No context and no provider, because there is nothing to scope: a page has
 * exactly one palette, and a trigger anywhere on it means that one.
 */
type PaletteState = { open: boolean; query: string };

const CLOSED: PaletteState = { open: false, query: "" };

let paletteState: PaletteState = CLOSED;
const subscribers = new Set<() => void>();

function publish(next: PaletteState) {
  paletteState = next;
  for (const notify of subscribers) notify();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

/** Opens the palette, on a query when the caller has one to hand it. */
export function openPalette(query?: string) {
  publish({ open: true, query: query ?? paletteState.query });
}

function setOpen(open: boolean) {
  publish({ ...paletteState, open });
}

function setQuery(query: string) {
  publish({ ...paletteState, query });
}

function usePalette(): PaletteState {
  // The server has no palette open and no query typed into it, so the snapshot
  // it renders is the constant rather than the module's own state, which one
  // request must never be able to show to the next.
  return useSyncExternalStore(
    subscribe,
    () => paletteState,
    () => CLOSED,
  );
}

/** Beyond this the list stops being a list you read and becomes one you scroll. */
const MAX_RESULTS = 12;

const optionId = (index: number) => `umbra-search-option-${index}`;

/**
 * Search, from anywhere.
 *
 * Checking whether something is already on the server is the gesture members
 * repeat most, so it stopped being a page you navigate to and became a key you
 * press. The states still decide everything: here says so, partly here says so
 * too rather than passing for whole, and anything not here gets a button. A
 * title somebody else already asked for gets the same one: pressing it joins
 * their request, so "already requested" was a dead end with nothing behind it.
 *
 * The list is driven from the field it is typed in: arrows move a highlight,
 * Enter opens it, and the count is announced, because a result you can only
 * reach by tabbing through twelve rows is a result you scroll past.
 */
export function CommandPalette() {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();
  const palette = usePalette();

  const [results, setResults] = useState<CatalogResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [highlight, setHighlight] = useState(0);

  // Keeps a slow answer from overwriting a newer one.
  const requestId = useRef(0);
  const activeRow = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!paletteState.open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const trimmed = palette.query.trim();
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
        setResults(body.results);
        // A new answer is a new list: the highlight belongs at the top of it.
        setHighlight(0);
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

  const visible = results ? results.slice(0, MAX_RESULTS) : [];
  const active =
    visible.length === 0 ? -1 : Math.min(highlight, visible.length - 1);

  // The highlight is only useful if it is on screen: twelve rows outgrow the
  // panel, and an arrow key that scrolls nothing looks like an arrow key that
  // did nothing.
  useEffect(() => {
    activeRow.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function open(result: CatalogResult) {
    setOpen(false);
    router.push(`/title/${result.kind}/${result.providerId}`);
  }

  function onFieldKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (visible.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight(Math.min(active + 1, visible.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight(Math.max(active - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = visible[active];
      if (chosen) open(chosen);
    }
  }

  async function ask(result: CatalogResult) {
    const key = `${result.kind}:${result.providerId}`;
    setPending(key);
    try {
      const body = await request<{ joined: boolean }>("/api/requests", {
        method: "POST",
        body: { kind: result.kind, providerId: result.providerId },
      });
      setSent((previous) => ({ ...previous, [key]: true }));
      toast.success(
        t(body.joined ? "status.requestJoined" : "status.requestSent"),
      );
      router.refresh();
    } catch (error) {
      toast.error(requestError(locale, error));
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog open={palette.open} onOpenChange={setOpen}>
      {/* Loupe and word, at every width: the icon alone was a guess for the
          people who do not live on the web, and the word costs one header
          slot. */}
      <DialogTrigger
        render={<Button variant="ghost" className="gap-1.5 px-2.5" />}
        title={t("home.searchHint")}
      >
        <SearchIcon />
        {t("common.search")}
      </DialogTrigger>

      {/* Hung from the top of a phone rather than centred on it: the keyboard
          takes the lower half the moment the field is focused, and a centred
          panel is then pushed about under it. Centred from the small
          breakpoint, where there is room. */}
      <DialogContent className="top-[max(1rem,env(safe-area-inset-top))] translate-y-0 sm:top-1/2 sm:max-w-2xl sm:-translate-y-1/2">
        <DialogHeader>
          <DialogTitle>{t("common.search")}</DialogTitle>
          <DialogDescription>{t("search.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="border-border/70 focus-within:border-primary/50 flex items-center gap-2 rounded-lg border px-3 transition-colors">
          <SearchIcon className="text-muted-foreground size-5" />
          <Input
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            value={palette.query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onFieldKeyDown}
            placeholder={t("home.searchPlaceholder")}
            aria-label={t("common.search")}
            role="combobox"
            aria-expanded={visible.length > 0}
            aria-controls="umbra-search-results"
            aria-activedescendant={active < 0 ? undefined : optionId(active)}
            className="h-11 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          {loading ? <SpinnerIcon className="text-muted-foreground" /> : null}
        </div>

        {/* What the field cannot show: how many answers came back. Announced
            rather than counted on screen, because a reader who can see the
            list has already counted it. */}
        <p className="sr-only" role="status" aria-live="polite">
          {results === null || tooShort
            ? ""
            : t("search.resultsCount", { count: visible.length })}
        </p>

        {tooShort || results === null ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">{t("search.hint")}</p>
            <ShortcutHint />
          </div>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("search.noResults")}
          </p>
        ) : (
          <ul
            id="umbra-search-results"
            role="listbox"
            aria-label={t("section.results")}
            className="-mx-2 max-h-[26rem] space-y-2 overflow-y-auto"
          >
            {visible.map((result, index) => {
              const key = `${result.kind}:${result.providerId}`;
              const availability = result.availability;
              const highlighted = index === active;

              return (
                <li
                  key={key}
                  id={optionId(index)}
                  role="option"
                  aria-selected={highlighted}
                  ref={highlighted ? activeRow : null}
                  onPointerMove={() => setHighlight(index)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2 py-1",
                    highlighted && "bg-secondary/60",
                  )}
                >
                  <div className="w-12 shrink-0">
                    <Poster
                      src={result.posterUrl}
                      alt={result.title}
                      sizes="3rem"
                      captioned
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => open(result)}
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
                  ) : availability === "partial" ? (
                    // Saying "available" here sent members to a page that then
                    // had to take it back, season by season.
                    <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                      <CircleHalfIcon />
                      {t("status.partial")}
                    </span>
                  ) : sent[key] ? (
                    <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                      <CheckIcon />
                      {t("status.requestSent")}
                    </span>
                  ) : (
                    // Somebody else asking first is no reason to stop offering
                    // it: the same button joins their request.
                    <Button
                      size="sm"
                      disabled={pending === key}
                      onClick={() => void ask(result)}
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

function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

/**
 * The key that opens the palette, named once, where it is learnt: in the
 * empty palette itself. Hidden on a touch screen, where there is no key to
 * press, and the modifier follows the keyboard the visitor actually has.
 */
function ShortcutHint() {
  const t = useTranslator();
  const apple = useSyncExternalStore(
    () => () => {},
    isApplePlatform,
    () => false,
  );
  return (
    <p className="text-muted-foreground hidden items-center gap-1.5 text-xs sm:pointer-fine:flex">
      <kbd>{apple ? "Cmd" : "Ctrl"}</kbd>
      <kbd>K</kbd>
      <span>{t("search.shortcut")}</span>
    </p>
  );
}

/**
 * The hero's half of the same thing: a field you can read, which opens the one
 * palette in the header rather than a second copy of it.
 *
 * On arrival the question is usually "is this already here", and the answer
 * should not need a destination, so it comes first on the page.
 */
export function SearchField() {
  const t = useTranslator();
  const apple = useSyncExternalStore(
    () => () => {},
    isApplePlatform,
    () => false,
  );
  // Drawn as the field it stands for, placeholder and all, rather than as a
  // button that says "Search": a front door is recognised by its shape. It is
  // the one resting element allowed a shadow. A button underneath, since it
  // opens a dialog rather than taking the text itself.
  return (
    <button
      type="button"
      onClick={() => openPalette()}
      title={t("home.searchHint")}
      className="bg-card text-muted-foreground ring-foreground/10 hover:text-foreground focus-visible:ring-ring/50 flex h-12 w-full items-center gap-3 rounded-full px-5 text-left text-sm shadow-lg ring-1 transition-colors outline-none focus-visible:ring-3 sm:h-14 sm:px-6"
    >
      <SearchIcon className="size-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        {t("home.searchPlaceholder")}
      </span>
      <span
        className="hidden shrink-0 items-center gap-1 sm:pointer-fine:flex"
        aria-hidden
      >
        <kbd>{apple ? "Cmd" : "Ctrl"}</kbd>
        <kbd>K</kbd>
      </span>
    </button>
  );
}

/**
 * An address that carries a search opens on it.
 *
 * `/request?q=` has forwarded here since requesting stopped being a page of its
 * own, and until now the query was dropped on the floor: the palette now opens
 * with it typed in, which is what the old address promised.
 */
export function SearchOnArrival({ query }: { query: string }) {
  useEffect(() => {
    if (query.trim().length > 0) openPalette(query);
  }, [query]);

  return null;
}
