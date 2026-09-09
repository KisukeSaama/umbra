import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import {
  createTranslator,
  detectLocale,
  type Locale,
  type Translator,
} from "@/lib/i18n";

/**
 * Server-side language detection, memoised per render.
 *
 * Nothing is stored and nothing is asked: the `Accept-Language` header decides.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const store = await headers();
  return detectLocale(store.get("accept-language"));
});

export const getTranslator = cache(async (): Promise<Translator> => {
  return createTranslator(await getLocale());
});

/** Both at once, for pages that need to pass the language down to a client component. */
export async function getI18n(): Promise<{ locale: Locale; t: Translator }> {
  const locale = await getLocale();
  return { locale, t: createTranslator(locale) };
}
