import { describe, expect, it } from "vitest";

import {
  createTranslator,
  detectLocale,
  resolveLocale,
  translateError,
} from "@/lib/i18n";
import { en, fr } from "@/lib/i18n/dictionaries";

describe("language detection", () => {
  it("reads the preferred language from the header", () => {
    expect(detectLocale("fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(detectLocale("en-GB,en;q=0.9")).toBe("en");
  });

  it("honours quality values rather than order", () => {
    expect(detectLocale("de;q=1.0,fr;q=0.9,en;q=0.4")).toBe("fr");
  });

  it("falls back to English on an unknown or missing header", () => {
    expect(detectLocale("de-DE,de;q=0.9")).toBe("en");
    expect(detectLocale(null)).toBe("en");
    expect(detectLocale("")).toBe("en");
  });

  it("lets a chosen language override the header", () => {
    expect(resolveLocale("en", "fr-FR,fr;q=0.9")).toBe("en");
    expect(resolveLocale("fr", "en-GB,en;q=0.9")).toBe("fr");
  });

  it("ignores an unknown or missing choice", () => {
    expect(resolveLocale("de", "fr-FR,fr;q=0.9")).toBe("fr");
    expect(resolveLocale(null, "fr-FR,fr;q=0.9")).toBe("fr");
    expect(resolveLocale(undefined, null)).toBe("en");
  });
});

describe("translation", () => {
  it("interpolates values", () => {
    const t = createTranslator("en");
    expect(t("poll.votes", { count: 412 })).toBe("412 votes");
    expect(t("storage.used", { percent: "78%" })).toBe("78% used");
  });

  it("leaves an unknown placeholder alone", () => {
    const t = createTranslator("fr");
    expect(t("poll.votes", { other: 1 })).toContain("{count}");
  });

  it("resolves an error key, and falls back for an unknown one", () => {
    expect(translateError("fr", "error.alreadyRequested")).toBe(
      fr["error.alreadyRequested"],
    );
    expect(translateError("en", "error.somethingElse")).toBe(
      en["error.internal"],
    );
    expect(translateError("en", undefined)).toBe(en["error.internal"]);
  });

  it("keeps both dictionaries in step", () => {
    const englishKeys = Object.keys(en).sort();
    const frenchKeys = Object.keys(fr).sort();
    expect(frenchKeys).toEqual(englishKeys);
    expect(Object.values(fr).every((value) => value.trim().length > 0)).toBe(
      true,
    );
  });
});

describe("plurals", () => {
  it("picks the singular form where the dictionary offers one", () => {
    const en = createTranslator("en");
    expect(en("poll.votes", { count: 1 })).toBe("1 vote");
    expect(en("poll.votes", { count: 0 })).toBe("0 votes");
    expect(en("poll.votes", { count: 2 })).toBe("2 votes");
  });

  it("follows the language's idea of one: French counts zero as singular", () => {
    const fr = createTranslator("fr");
    expect(fr("poll.votes", { count: 0 })).toBe("0 vote");
    expect(fr("poll.votes", { count: 1 })).toBe("1 vote");
    expect(fr("poll.votes", { count: 2 })).toBe("2 votes");
  });

  it("leaves keys without a singular variant untouched", () => {
    const en = createTranslator("en");
    expect(en("admin.jobs.took", { value: "2s" })).toBe("in 2s");
  });

  it("uses the singular where one is written", () => {
    const en = createTranslator("en");
    expect(en("search.resultsCount", { count: 1 })).toBe("1 result");
    expect(en("search.resultsCount", { count: 3 })).toBe("3 results");
  });
});
