import { describe, expect, it } from "vitest";

import { parseMarkdown, plainText, type BlockNode } from "@/lib/markdown";

/** The one block a source is expected to produce. */
function only(source: string): BlockNode {
  const blocks = parseMarkdown(source);
  expect(blocks).toHaveLength(1);
  return blocks[0];
}

describe("blocks", () => {
  it("splits paragraphs on blank lines and keeps single breaks", () => {
    const blocks = parseMarkdown("one\ntwo\n\nthree");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      type: "paragraph",
      children: [
        { type: "text", value: "one" },
        { type: "break" },
        { type: "text", value: "two" },
      ],
    });
    expect(blocks[1]).toEqual({
      type: "paragraph",
      children: [{ type: "text", value: "three" }],
    });
  });

  it("reads the three heading levels and nothing deeper", () => {
    expect(only("## Storage")).toEqual({
      type: "heading",
      level: 2,
      children: [{ type: "text", value: "Storage" }],
    });
    expect(only("#### Storage")).toMatchObject({ type: "paragraph" });
  });

  it("groups bullets into one list", () => {
    expect(only("- one\n- two\n- three")).toMatchObject({
      type: "list",
      ordered: false,
      items: [
        [{ type: "text", value: "one" }],
        [{ type: "text", value: "two" }],
        [{ type: "text", value: "three" }],
      ],
    });
  });

  it("keeps the first number of an ordered list", () => {
    expect(only("3. third\n4. fourth")).toMatchObject({
      type: "list",
      ordered: true,
      start: 3,
    });
  });

  it("continues a wrapped list item rather than starting a paragraph", () => {
    expect(only("- a long item\n  that wrapped")).toMatchObject({
      type: "list",
      items: [
        [
          { type: "text", value: "a long item" },
          { type: "break" },
          { type: "text", value: "that wrapped" },
        ],
      ],
    });
  });

  it("parses a quote as blocks of its own", () => {
    expect(only("> ## Upstream\n> is down")).toEqual({
      type: "quote",
      children: [
        {
          type: "heading",
          level: 2,
          children: [{ type: "text", value: "Upstream" }],
        },
        { type: "paragraph", children: [{ type: "text", value: "is down" }] },
      ],
    });
  });

  it("keeps a fenced block verbatim", () => {
    expect(only("```\n**not bold**\n```")).toEqual({
      type: "codeBlock",
      value: "**not bold**",
    });
  });

  it("runs an unterminated fence to the end of the note", () => {
    expect(only("```\nstill code")).toEqual({
      type: "codeBlock",
      value: "still code",
    });
  });

  it("tells a rule from a bullet", () => {
    expect(only("---")).toEqual({ type: "rule" });
    expect(only("- one")).toMatchObject({ type: "list" });
  });

  it("returns nothing for an empty note", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n  \n")).toEqual([]);
  });
});

describe("inline", () => {
  function inline(source: string) {
    const block = only(source);
    if (block.type !== "paragraph") throw new Error("not a paragraph");
    return block.children;
  }

  it("reads bold, italic and code", () => {
    expect(inline("**a** *b* `c`")).toEqual([
      { type: "strong", children: [{ type: "text", value: "a" }] },
      { type: "text", value: " " },
      { type: "emphasis", children: [{ type: "text", value: "b" }] },
      { type: "text", value: " " },
      { type: "code", value: "c" },
    ]);
  });

  it("nests italic inside bold", () => {
    expect(inline("**a *b* c**")).toEqual([
      {
        type: "strong",
        children: [
          { type: "text", value: "a " },
          { type: "emphasis", children: [{ type: "text", value: "b" }] },
          { type: "text", value: " c" },
        ],
      },
    ]);
  });

  it("closes bold at the first pair, so a run of three is not both", () => {
    expect(inline("**a *b***")).toEqual([
      { type: "strong", children: [{ type: "text", value: "a *b" }] },
      { type: "text", value: "*" },
    ]);
  });

  it("leaves a loose mark as text", () => {
    // A star with a space behind it opens nothing, so arithmetic survives.
    expect(inline("2 * 3 * 4 = 24")).toEqual([
      { type: "text", value: "2 * 3 * 4 = 24" },
    ]);
    expect(inline("a ** b")).toEqual([{ type: "text", value: "a ** b" }]);
    expect(inline("*unclosed")).toEqual([{ type: "text", value: "*unclosed" }]);
  });

  it("honours a backslash escape", () => {
    expect(inline("\\*not italic\\*")).toEqual([
      { type: "text", value: "*not italic*" },
    ]);
  });

  it("reads a link and keeps its wording", () => {
    expect(inline("[the page](https://example.org/a)")).toEqual([
      {
        type: "link",
        href: "https://example.org/a",
        children: [{ type: "text", value: "the page" }],
      },
    ]);
  });

  it("accepts an address inside Umbra", () => {
    expect(inline("[the feed](/news)")).toMatchObject([
      { type: "link", href: "/news" },
    ]);
  });

  it("prints an address it will not open instead of linking it", () => {
    for (const source of [
      "[x](javascript:alert(1))",
      "[x](data:text/html,hi)",
      "[x](//example.org)",
      "[x]()",
    ]) {
      expect(inline(source)).toEqual([{ type: "text", value: source }]);
    }
  });

  it("takes no markup from a code span", () => {
    expect(inline("`<script>alert(1)</script>`")).toEqual([
      { type: "code", value: "<script>alert(1)</script>" },
    ]);
  });
});

describe("plainText", () => {
  it("keeps the wording and drops the marks", () => {
    expect(
      plainText(
        "## Storage\n\nThe **new** disk is [in](https://example.org).\n\n- one\n- two",
      ),
    ).toBe("Storage\nThe new disk is in.\none\ntwo");
  });

  it("is empty for a note that is only marks", () => {
    expect(plainText("---\n\n***")).toBe("");
  });
});
