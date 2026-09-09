import {
  DEFAULT_LOCALE,
  LOCALES,
  dictionaries,
  type Locale,
  type TranslationKey,
} from "@/lib/i18n/dictionaries";

export type { Locale, TranslationKey };
export { DEFAULT_LOCALE, LOCALES };

export type Translator = (
  key: TranslationKey,
  values?: Record<string, string | number>,
) => string;

/**
 * Language is detected, never chosen from a switch in the header: the visitor
 * already told their browser which language they read.
 */
export function detectLocale(
  acceptLanguage: string | null | undefined,
): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const quality = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="))
        ?.slice(2);
      return {
        tag: tag.trim().toLowerCase(),
        quality: quality ? Number(quality) : 1,
      };
    })
    .filter((entry) => entry.tag.length > 0 && Number.isFinite(entry.quality))
    .sort((a, b) => b.quality - a.quality);

  for (const entry of ranked) {
    const language = entry.tag.split("-")[0];
    if (LOCALES.includes(language as Locale)) return language as Locale;
  }
  return DEFAULT_LOCALE;
}

export function dictionaryFor(locale: Locale): Record<TranslationKey, string> {
  return dictionaries[locale];
}

/** `{count} results` with `{count}` replaced. Missing keys fall back to the key. */
export function createTranslator(locale: Locale): Translator {
  const dictionary = dictionaryFor(locale);
  return (key, values) => {
    const template = dictionary[key] ?? key;
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in values ? String(values[name]) : match,
    );
  };
}

/**
 * Resolves an error `messageKey` returned by the API. Unknown keys fall back to
 * a generic message rather than showing an internal string.
 */
export function translateError(
  locale: Locale,
  messageKey: string | undefined,
): string {
  const dictionary = dictionaryFor(locale);
  if (messageKey && messageKey in dictionary) {
    return dictionary[messageKey as TranslationKey];
  }
  return dictionary["error.internal"];
}
