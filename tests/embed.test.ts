import { describe, expect, it } from "vitest";

import { embedCodeOf, parseEmbedCode } from "@/lib/embed";

/**
 * The staff paste the snippet a site offers; only the frame's address, title
 * and shape are kept from it.
 */
describe("reading an embed code", () => {
  it("keeps the address, the title and the shape of a video snippet", () => {
    const code =
      '<iframe width="560" height="315" src="https://www.youtube.com/embed/abc?si=x&amp;t=2" title="YouTube video player" frameborder="0" allowfullscreen></iframe>';
    expect(parseEmbedCode(code)).toEqual({
      url: "https://www.youtube.com/embed/abc?si=x&t=2",
      title: "YouTube video player",
      ratio: "wide",
    });
  });

  it("guesses a tall shape and ignores percentages", () => {
    expect(
      parseEmbedCode('<iframe src="https://a.test/f" width="640" height="900">')
        ?.ratio,
    ).toBe("tall");
    expect(
      parseEmbedCode(
        '<iframe src="https://a.test/m" width="100%" height="450">',
      )?.ratio,
    ).toBeNull();
  });

  it("accepts a bare https address", () => {
    expect(parseEmbedCode(" https://a.test/page ")).toEqual({
      url: "https://a.test/page",
      title: null,
      ratio: null,
    });
  });

  it("refuses what is not an https frame", () => {
    expect(parseEmbedCode("")).toBeNull();
    expect(
      parseEmbedCode('<iframe src="http://a.test/page"></iframe>'),
    ).toBeNull();
    expect(
      parseEmbedCode('<iframe src="javascript:alert(1)"></iframe>'),
    ).toBeNull();
    expect(parseEmbedCode("<script>alert(1)</script>")).toBeNull();
    expect(parseEmbedCode("a sentence, not an address")).toBeNull();
  });

  it("reads back what it writes", () => {
    const code = embedCodeOf("https://a.test/p?x=1&y=2", 'A "map"');
    expect(parseEmbedCode(code)).toEqual({
      url: "https://a.test/p?x=1&y=2",
      title: 'A "map"',
      ratio: null,
    });
  });
});
