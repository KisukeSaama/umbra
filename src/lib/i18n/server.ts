import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";

import {
  LOCALE_COOKIE,
  createTranslator,
  isLocale,
  resolveLocale,
  type Locale,
  type Translator,
} from "@/lib/i18n";

/**
 * The language the visitor picked by hand, or `null` when detection is left to
 * do its job. Read separately so the account menu can show which is in force.
 */
export const getLocaleOverride = cache(async (): Promise<Locale | null> => {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : null;
});

/**
 * Server-side language resolution, memoised per render.
 *
 * Nothing is asked up front: the `Accept-Language` header decides, unless the
 * visitor has corrected it from the account menu.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const [override, store] = await Promise.all([getLocaleOverride(), headers()]);
  return resolveLocale(override, store.get("accept-language"));
});

export const getTranslator = cache(async (): Promise<Translator> => {
  return createTranslator(await getLocale());
});

/** Both at once, for pages that need to pass the language down to a client component. */
export async function getI18n(): Promise<{ locale: Locale; t: Translator }> {
  const locale = await getLocale();
  return { locale, t: createTranslator(locale) };
}
