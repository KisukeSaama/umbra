"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { createTranslator, type Locale, type Translator } from "@/lib/i18n";

/**
 * Language for client components.
 *
 * The server detected it once; the provider carries it down so no client
 * component has to guess or re-detect.
 */
const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useTranslator(): Translator {
  const locale = useLocale();
  return useMemo(() => createTranslator(locale), [locale]);
}
