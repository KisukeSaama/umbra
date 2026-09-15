import { describe, expect, it } from "vitest";
import { storageSearchTitle } from "@/lib/storage-search";

describe("storageSearchTitle", () => {
  it.each([
    [
      "[Delivroozzi] Kaze ga Tsuyoku Fuiteiru [VOSTFR BD x265 10bits 1080p FLAC]",
      "Kaze ga Tsuyoku Fuiteiru",
    ],
    [
      "[Elecman] Tsubasa Reservoir Chronicle Intégral [BDRIP CUSTOM]",
      "Tsubasa Reservoir Chronicle",
    ],
    ["[SR-71] Oreshura S01 VOSTFR [1080p][X265][10BITS]", "Oreshura"],
    [
      "[Team Arcedo] I Have a Crush at Work - S01 VOSTFR (Web-Rip)",
      "I Have a Crush at Work",
    ],
    ["86 Eighty Six", "86 Eighty Six"],
    ["[TRI]Accel World [MULTI]", "Accel World"],
    ["Dr.Stone.Science.Future.S04.1080p", "Dr Stone Science Future"],
    ["365 Days to the Wedding [VOSTFR]", "365 Days to the Wedding"],
    ["Dune (2021) [1080p]", "Dune 2021"],
  ])("cleans %s", (folder, title) => {
    expect(storageSearchTitle(["animes", folder])).toBe(title);
  });
  it.each(["Season 02", "Saison 2", "S02", "Specials", "Extras", "1080p"])(
    "keeps the series name inside %s",
    (folder) => {
      expect(storageSearchTitle(["series", "Severance", folder])).toBe(
        "Severance",
      );
    },
  );
  it("does not suggest a volume or category as a title", () => {
    expect(storageSearchTitle([])).toBe("");
    expect(storageSearchTitle(["animes"])).toBe("");
    expect(storageSearchTitle(["series", "Season 01"])).toBe("");
  });
});
