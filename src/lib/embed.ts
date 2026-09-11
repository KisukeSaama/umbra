import type { EmbedRatio } from "@/lib/db/schema";

/**
 * Reading the embed code a site hands out for integration.
 *
 * YouTube, Google Maps, a form host: each offers a snippet of HTML built around
 * an iframe. The staff paste that snippet as it is, and only what matters is
 * kept: the address, the title and the shape. The snippet itself is never
 * stored nor rendered, because the frame Umbra draws is its own, sandboxed (see
 * `docs/adr/0018-a-note-can-embed-a-page.md`), and HTML pasted into the page
 * would be free of that sandbox.
 *
 * Pure and dependency-free, so the composer and the API read a snippet the same
 * way.
 */
export type ParsedEmbed = {
  url: string;
  title: string | null;
  /** Guessed from the snippet's width and height, when it carries both. */
  ratio: EmbedRatio | null;
};

const IFRAME = /<iframe\b([^>]*)>/i;
const ATTRIBUTE = /([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

function decode(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function attributes(tag: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of tag.matchAll(ATTRIBUTE)) {
    const name = match[1].toLowerCase();
    if (!found.has(name))
      found.set(name, decode(match[2] ?? match[3] ?? match[4] ?? "").trim());
  }
  return found;
}

function ratioOf(width?: string, height?: string): EmbedRatio | null {
  const w = Number.parseFloat(width ?? "");
  const h = Number.parseFloat(height ?? "");
  // A percentage says nothing about the shape, only about the container.
  if (!w || !h || width?.includes("%") || height?.includes("%")) return null;
  const proportion = w / h;
  if (proportion > 1.2) return "wide";
  if (proportion < 0.9) return "tall";
  return "square";
}

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The frame described by an embed snippet, or null when there is none worth
 * showing. A bare https address is accepted too, for a site that only gives
 * one.
 */
export function parseEmbedCode(code: string): ParsedEmbed | null {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const tag = IFRAME.exec(trimmed);
  if (!tag) {
    return /^\S+$/.test(trimmed) && isHttps(trimmed)
      ? { url: trimmed, title: null, ratio: null }
      : null;
  }

  const found = attributes(tag[1]);
  const url = found.get("src") ?? "";
  if (!isHttps(url)) return null;
  return {
    url,
    title: found.get("title") || null,
    ratio: ratioOf(found.get("width"), found.get("height")),
  };
}

/** A stored frame written back as a snippet, for the composer to correct. */
export function embedCodeOf(url: string, title: string | null): string {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const titled = title ? ` title="${escape(title)}"` : "";
  return `<iframe src="${escape(url)}"${titled}></iframe>`;
}
