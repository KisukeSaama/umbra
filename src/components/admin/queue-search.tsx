"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { CloseIcon, SearchIcon } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { useTranslator } from "@/lib/i18n/client";
import { parseQueueSearch } from "@/lib/queue";
import { cn } from "@/lib/utils";

/** How long typing has to pause before the queue is read again. */
const DEBOUNCE_MS = 250;

/**
 * The search box above a queue.
 *
 * It reads as it is typed, a short pause after the last key, and writes the
 * search into the address like the stage and the order, so a searched queue
 * can be shared and survives a reload. The page goes back to one, since page
 * four of other rows is not the same rows. The address is replaced rather
 * than pushed, so going back leaves the queue instead of undoing letters.
 *
 * "/" puts the cursor in the box from anywhere on the page, as long as nothing
 * else is being typed into.
 */
export function QueueSearch({
  pathname,
  query,
  search,
}: {
  pathname: string;
  /** The current query string, which the search is written into. */
  query: string;
  /** The search the page was read with. */
  search: string;
}) {
  const t = useTranslator();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(search);
  const [pending, startTransition] = useTransition();

  // The last search sent, and the one the page last answered with. When the
  // page answers with something this box did not send (the back button, a
  // shared link opened over it), the box follows; when it is the echo of what
  // was typed, the box keeps what is being typed since.
  const [sent, setSent] = useState(search);
  const [answered, setAnswered] = useState(search);
  if (search !== answered) {
    setAnswered(search);
    if (search !== sent) {
      setSent(search);
      setValue(search);
    }
  }

  function go(next: string) {
    const normalised = parseQueueSearch(next);
    if (normalised === sent) return;
    setSent(normalised);
    const params = new URLSearchParams(query);
    params.delete("page");
    if (normalised) params.set("q", normalised);
    else params.delete("q");
    const target = params.toString();
    startTransition(() => {
      router.replace(`${pathname}${target ? `?${target}` : ""}`, {
        scroll: false,
      });
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => go(value), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // Only typing restarts the wait; `go` is the one of the render that typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.closest("input, textarea, select, [role=dialog]")
      )
        return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      className="relative basis-64 grow sm:grow-0"
      onSubmit={(event) => {
        event.preventDefault();
        go(value);
      }}
    >
      <SearchIcon
        aria-hidden
        className={cn(
          "text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2",
          pending && "animate-pulse",
        )}
      />
      <Input
        ref={input}
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            setValue("");
            go("");
          }
        }}
        placeholder={t("admin.queue.searchPlaceholder")}
        aria-label={t("admin.queue.search")}
        aria-busy={pending || undefined}
        autoComplete="off"
        spellCheck={false}
        className="h-8 pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            go("");
            input.current?.focus();
          }}
          aria-label={t("admin.queue.clearSearch")}
          title={t("admin.queue.clearSearch")}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md outline-none focus-visible:ring-3"
        >
          <CloseIcon aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </form>
  );
}
