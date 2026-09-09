import { describe, expect, it } from "vitest";

import {
  alternateCutOf,
  beginsWithTitle,
  hasCutMarker,
  sameTitle,
  titleWithoutCut,
} from "@/lib/domain/cuts";

describe("re-cut detection", () => {
  it("names the cut a server title carries and the provider does not", () => {
    expect(alternateCutOf("Naruto Kai", ["Naruto", "NARUTO"])).toBe("kai");
    expect(alternateCutOf("One Piece (Yabai)", ["One Piece"])).toBe("yabai");
  });

  it("leaves a series the provider itself calls Kai alone", () => {
    expect(alternateCutOf("Dragon Ball Z Kai", ["Dragon Ball Z Kai"])).toBe(
      null,
    );
    expect(
      alternateCutOf("Dragon Ball Z Kai", [
        "Dragon Ball Z Kai",
        "ドラゴンボール改",
      ]),
    ).toBe(null);
  });

  it("reads the marker through whatever accents it was typed with", () => {
    expect(alternateCutOf("Bleach KAÏ", ["Bleach"])).toBe("kai");
    expect(alternateCutOf("Bleach KAÏ", ["Bleach"])).toBe("kai");
    expect(alternateCutOf("Naruto Kaï", ["Naruto"])).toBe("kai");
    expect(alternateCutOf("Dragon Ball Yabaï", ["Dragon Ball"])).toBe(
      "yabai",
    );
  });

  it("leaves the titles on the server that only look like one alone", () => {
    for (const title of [
      "Jujutsu Kaisen",
      "Kuzu No Honkai",
      "Le pacte des Yokaï",
      "Shin Sekai Yori (From the New World)",
      "Suicide Squad ISEKAI",
      "Hokkaido Gals Are Super Adorable!",
    ])
      expect(alternateCutOf(title, [title])).toBe(null);
  });

  it("reads the marker as a word, never as a beginning", () => {
    expect(alternateCutOf("Kaiju No. 8", ["Kaiju No. 8"])).toBe(null);
    // The one real series on the server whose own name is the marker.
    expect(alternateCutOf("Cobra Kai", ["Cobra Kai"])).toBe(null);
    expect(alternateCutOf("Kaiji", ["Kaiji"])).toBe(null);
    expect(hasCutMarker("Kaiju No. 8")).toBe(false);
  });

  it("takes a marker with no provider name to compare as a cut", () => {
    expect(alternateCutOf("Bleach Yabai")).toBe("yabai");
  });

  it("says nothing about a title without a marker", () => {
    expect(alternateCutOf("Bleach", ["Bleach"])).toBe(null);
    expect(alternateCutOf(null)).toBe(null);
    expect(hasCutMarker(undefined)).toBe(false);
  });
});

describe("the series a re-cut is a re-cut of", () => {
  it("takes the marker word off, however it was typed", () => {
    expect(titleWithoutCut("Naruto Kaï")).toBe("Naruto");
    expect(titleWithoutCut("Naruto Shippuden Kaï")).toBe(
      "Naruto Shippuden",
    );
    expect(titleWithoutCut("Bleach KAÏ")).toBe("Bleach");
    expect(titleWithoutCut("Dragon Ball Z Yabaï")).toBe("Dragon Ball Z");
    expect(titleWithoutCut("One Piece (Yabai)")).toBe("One Piece");
  });

  it("gives nothing back for a title carrying no marker", () => {
    expect(titleWithoutCut("BLEACH Thousand Year Blood War")).toBe(null);
    expect(titleWithoutCut("Saga")).toBe(null);
    expect(titleWithoutCut(null)).toBe(null);
  });
});

describe("matching a name against the provider", () => {
  it("reads through accents, macrons and punctuation", () => {
    expect(sameTitle("Naruto Shippūden", "Naruto Shippuden")).toBe(true);
    expect(sameTitle("Reborn!", "Reborn")).toBe(true);
    expect(sameTitle("Dragon Ball Z", "Dragon Ball")).toBe(false);
    expect(sameTitle("", "Naruto")).toBe(false);
  });

  it("knows a longer name that starts with the shorter one", () => {
    expect(beginsWithTitle("Boruto: Naruto Next Generations", "Boruto")).toBe(
      true,
    );
    // The rule that makes "Dragon Ball" unusable on its own, which is why it
    // is only ever read when one single candidate answers to it.
    expect(beginsWithTitle("Dragon Ball Z", "Dragon Ball")).toBe(true);
    expect(beginsWithTitle("Katekyo Hitman Reborn!", "Reborn")).toBe(false);
    expect(beginsWithTitle("Naruto", "Naruto")).toBe(false);
  });
});
