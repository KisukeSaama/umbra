/**
 * The small markdown an announcement is allowed to use.
 *
 * The administration writes notes, not documents: a paragraph, a list of what
 * changed, a link, sometimes a quoted line from upstream. So this parses a
 * closed subset rather than pulling in a full CommonMark stack, and it returns
 * a tree of typed nodes rather than a string of HTML. Nothing here can ever
 * produce markup the renderer did not write itself, which is why no member or
 * staff input is ever handed to `dangerouslySetInnerHTML`.
 *
 * Supported: headings, paragraphs with hard line breaks, bullet and numbered
 * lists, quotes, fenced and inline code, rules, bold, italic, links and
 * backslash escapes. Anything else is read as the text it is made of, so a
 * stray character is printed rather than swallowed.
 */

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "break" }
  | { type: "code"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "emphasis"; children: InlineNode[] }
  | { type: "link"; href: string; children: InlineNode[] };

export type BlockNode =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "heading"; level: 1 | 2 | 3; children: InlineNode[] }
  | { type: "list"; ordered: boolean; start: number; items: InlineNode[][] }
  | { type: "quote"; children: BlockNode[] }
  | { type: "codeBlock"; value: string }
  | { type: "rule" };

/** A quote inside a quote inside a quote is a mistake, not a structure. */
const MAX_QUOTE_DEPTH = 3;

const HEADING = /^(#{1,3})\s+(.*)$/;
const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const BULLET = /^ {0,3}[-*+]\s+(.*)$/;
const NUMBER = /^ {0,3}(\d{1,9})[.)]\s+(.*)$/;
const FENCE = /^ {0,3}(?:```|~~~)/;
const CONTINUATION = /^\s+\S/;

/** Blocks, in reading order. */
export function parseMarkdown(source: string): BlockNode[] {
  return parseBlocks(source.replace(/\r\n?/g, "\n").split("\n"), 0);
}

function parseBlocks(lines: string[], depth: number): BlockNode[] {
  const blocks: BlockNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      // A fence left open runs to the end of the note rather than failing.
      if (index < lines.length) index += 1;
      blocks.push({ type: "codeBlock", value: body.join("\n") });
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        children: parseInline(heading[2].trim()),
      });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index])) {
        quoted.push(QUOTE.exec(lines[index])![1]);
        index += 1;
      }
      const children =
        depth < MAX_QUOTE_DEPTH
          ? parseBlocks(quoted, depth + 1)
          : [
              {
                type: "paragraph" as const,
                children: parseInline(quoted.join("\n")),
              },
            ];
      blocks.push({ type: "quote", children });
      continue;
    }

    const listStart = readListItem(line);
    if (listStart) {
      const items: string[] = [];
      const ordered = listStart.ordered;
      const start = listStart.start;

      while (index < lines.length) {
        const item = readListItem(lines[index]);
        if (item && item.ordered === ordered) {
          items.push(item.text);
          index += 1;
          // A wrapped item keeps flowing as long as it stays indented.
          while (
            index < lines.length &&
            CONTINUATION.test(lines[index]) &&
            !readListItem(lines[index])
          ) {
            items[items.length - 1] += `\n${lines[index].trim()}`;
            index += 1;
          }
          continue;
        }
        break;
      }

      blocks.push({
        type: "list",
        ordered,
        start,
        items: items.map((item) => parseInline(item)),
      });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && !opensBlock(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({
      type: "paragraph",
      children: parseInline(paragraph.join("\n")),
    });
  }

  return blocks;
}

function readListItem(
  line: string,
): { ordered: boolean; start: number; text: string } | null {
  const bullet = BULLET.exec(line);
  if (bullet) return { ordered: false, start: 1, text: bullet[1] };

  const numbered = NUMBER.exec(line);
  if (numbered)
    return {
      ordered: true,
      start: Number(numbered[1]),
      text: numbered[2],
    };

  return null;
}

/** True when the line belongs to something other than the paragraph in hand. */
function opensBlock(line: string): boolean {
  return (
    line.trim() === "" ||
    FENCE.test(line) ||
    RULE.test(line) ||
    HEADING.test(line) ||
    QUOTE.test(line) ||
    readListItem(line) !== null
  );
}

/**
 * Inline spans.
 *
 * One pass, one regular expression, alternatives ordered by precedence: an
 * escape first so a backslash always wins, then code, then links, then bold
 * before italic. What no alternative matches stays text.
 */
const INLINE =
  /\\([\\`*_[\]()#>~+-])|(`+)([\s\S]+?)\2|\[([^\]\n]*)\]\(([^\s()]*)\)|(\*\*|__)(\S(?:[\s\S]*?\S)?)\6|(\*|_)(\S(?:[\s\S]*?\S)?)\8/g;

export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let cursor = 0;

  // A matcher of its own for this call: the bold and italic branches parse
  // their own contents, and a shared one would have its cursor moved under it.
  const scanner = new RegExp(INLINE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = scanner.exec(source)) !== null) {
    pushText(nodes, source.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    if (match[1] !== undefined) {
      pushText(nodes, match[1]);
      continue;
    }
    if (match[3] !== undefined) {
      nodes.push({ type: "code", value: match[3].trim() });
      continue;
    }
    if (match[5] !== undefined) {
      const href = safeHref(match[5]);
      const label = match[4].trim() || match[5];
      if (href)
        nodes.push({ type: "link", href, children: parseInline(label) });
      // An address Umbra will not open is printed, never quietly dropped.
      else pushText(nodes, match[0]);
      continue;
    }
    if (match[7] !== undefined) {
      nodes.push({ type: "strong", children: parseInline(match[7]) });
      continue;
    }
    if (match[9] !== undefined) {
      nodes.push({ type: "emphasis", children: parseInline(match[9]) });
      continue;
    }
  }

  pushText(nodes, source.slice(cursor));
  return nodes;
}

/** Text, with a single newline kept as the hard break the writer typed. */
function pushText(nodes: InlineNode[], value: string) {
  if (value === "") return;
  const parts = value.split("\n");
  parts.forEach((part, index) => {
    if (index > 0) nodes.push({ type: "break" });
    if (part === "") return;
    // Text that meets text is one run: an escape splits the string it was
    // taken from, and two spans in a row would print with a gap between them.
    const last = nodes[nodes.length - 1];
    if (last?.type === "text") last.value += part;
    else nodes.push({ type: "text", value: part });
  });
}

/**
 * Addresses worth following.
 *
 * Only the two schemes a note has a reason to carry, plus links back into
 * Umbra. Everything else, `javascript:` first among them, is not an address.
 */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (href === "") return null;
  if (/^https?:\/\/\S+$/i.test(href)) return href;
  if (/^mailto:\S+$/i.test(href)) return href;
  if (/^\/(?!\/)\S*$/.test(href)) return href;
  return null;
}

/**
 * The note with its marks taken off.
 *
 * Used where a body is shown as a teaser: a clamped excerpt of rendered blocks
 * is a stack of half-cut boxes, whereas a clamped run of text is a sentence
 * that stops. Structure is dropped, wording is kept.
 */
export function plainText(source: string): string {
  return blocksToText(parseMarkdown(source))
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function blocksToText(blocks: BlockNode[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "paragraph":
        case "heading":
          return inlineToText(block.children);
        case "list":
          return block.items.map((item) => inlineToText(item)).join("\n");
        case "quote":
          return blocksToText(block.children);
        case "codeBlock":
          return block.value;
        case "rule":
          return "";
      }
    })
    .filter((text) => text !== "")
    .join("\n");
}

function inlineToText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
          return node.value;
        case "break":
          return "\n";
        case "strong":
        case "emphasis":
        case "link":
          return inlineToText(node.children);
      }
    })
    .join("");
}
