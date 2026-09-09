import { describe, expect, it } from "vitest";

import { formatAmount, formatBytes, formatEpisodeCode } from "@/lib/format";
import { yearOf } from "@/lib/domain/catalog";
import { isRunning } from "@/lib/providers/metadata";

describe("formatting", () => {
  it("writes storage sizes for people, not for machines", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(18_700_000_000_000)).toBe("18.7 TB");
    expect(formatBytes(18_700_000_000_000, "fr")).toContain("To");
  });

  it("writes amounts in the visitor's locale", () => {
    expect(formatAmount(15_800, "EUR", "en")).toContain("158");
    expect(formatAmount(22_050, "EUR", "en")).toContain("220.5");
  });

  it("writes an episode code the way a series does", () => {
    expect(formatEpisodeCode(2, 9)).toBe("S02E09");
    expect(formatEpisodeCode(12, 104)).toBe("S12E104");
  });

  it("reads a year from a release date", () => {
    expect(yearOf("2017-10-04")).toBe(2017);
    expect(yearOf(null)).toBeNull();
    expect(yearOf("")).toBeNull();
  });
});

describe("series status", () => {
  it("keeps watching a running show and lets go of a finished one", () => {
    expect(isRunning({ status: "Returning Series", inProduction: false })).toBe(
      true,
    );
    expect(isRunning({ status: "Ended", inProduction: true })).toBe(true);
    expect(isRunning({ status: "Ended", inProduction: false })).toBe(false);
    expect(isRunning({ status: null, inProduction: false })).toBe(false);
  });
});
