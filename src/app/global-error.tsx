"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import "./globals.css";

import { UmbraMark } from "@/components/brand";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  createTranslator,
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  resolveLocale,
  type Locale,
} from "@/lib/i18n";

/**
 * The root layout itself threw.
 *
 * `error.tsx` cannot catch that: it sits inside the layout it would have to
 * replace. This file does, and it replaces the whole document with it, which is
 * why it draws its own `html` and `body` and brings the stylesheet in itself:
 * nothing above it is left to do either.
 *
 * That also means the language provider is gone, and the server is not there to
 * detect the language, so the two things it can be read from in the browser are
 * read instead: the cookie the account menu writes, then what the browser
 * itself asks for. It is read after mounting rather than while rendering, so
 * the markup the server sent and the markup the browser builds are the same.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // A root layout that threw is not going to render differently on its own, so
  // the recovery is a re-fetch rather than a re-render of the same tree.
  retry: () => void;
}) {
  const locale = useReaderLocale();
  const t = createTranslator(locale);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <main className="umbra-glow flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
          <UmbraMark className="mb-6 size-12" />
          <h1 className="text-3xl tracking-tight text-balance sm:text-4xl">
            {t("error.title")}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-md text-sm">
            {t("error.hint")}
          </p>
          <div className="mt-8 flex gap-2">
            <Button onClick={() => retry()}>{t("common.retry")}</Button>
            <Link href="/" className={buttonVariants({ variant: "secondary" })}>
              {t("common.home")}
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}

/**
 * The language, read from the browser once it is there to be read.
 *
 * There is no store behind this and nothing to subscribe to: what is wanted is
 * the pair of snapshots, a constant while the server renders and the browser's
 * own answer once it takes over, which is what keeps the first paint identical
 * on both sides.
 */
function useReaderLocale(): Locale {
  return useSyncExternalStore(
    () => () => {},
    () => resolveLocale(chosenLocale(), navigator.languages.join(",")),
    () => DEFAULT_LOCALE,
  );
}

/** The language picked by hand, from the cookie that is not the server's. */
function chosenLocale(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}
