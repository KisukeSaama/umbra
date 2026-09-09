import { describe, expect, it } from "vitest";

import { alternateCutOf, hasCutMarker } from "@/lib/domain/cuts";

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

  it("reads the marker as a word, never as a beginning", () => {
    expect(alternateCutOf("Kaiju No. 8", ["Kaiju No. 8"])).toBe(null);
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
