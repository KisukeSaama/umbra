"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { FileIcon, FolderIcon } from "@/components/icons";
import type { StorageNode } from "@/lib/db/schema";
import { formatBytes } from "@/lib/format";
import { useLocale, useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * What fills the disk, drawn.
 *
 * A percentage answers how full a volume is, which is never the question being
 * asked before a deletion. The question is what is taking the room, and the
 * only honest answer to that is a picture: every rectangle is a directory or a
 * file, its area is its share of the disk, and the big one is the big one.
 *
 * Rectangles are squarified, so they come out closer to squares than to
 * splinters and stay readable. One level of children is drawn inside each tile,
 * which is what makes the shape of a library legible at a glance.
 *
 * The map does not own where it is: it is told, and it says when a tile is
 * opened, so the list of files beside it always stands in the same folder. The
 * address is a volume label and the names below it, which is exactly what the
 * explorer sends to the server, because the two are reading the same disk.
 *
 * It draws in every folder, at any depth. The measurement keeps every
 * directory, and the files of the folder being looked at come from the listing
 * read beside it, so nothing is ever dropped for being too small.
 *
 * The layout is computed in real pixels from the measured box rather than in a
 * normalised square, because a treemap laid out for one aspect ratio and
 * stretched into another is a treemap of splinters. That is also what makes it
 * correct on a phone, where the box is tall rather than wide.
 */

type Rect = { x: number; y: number; w: number; h: number };
type Placed = StorageNode & Rect;

/** Below this a tile cannot hold a name, so it does not get one. */
const LABEL_MIN_WIDTH = 56;
const LABEL_MIN_HEIGHT = 26;
/** Below this a tile cannot usefully hold its own children either. */
const NEST_MIN_WIDTH = 96;
const NEST_MIN_HEIGHT = 68;

/**
 * The measured node at an address, or null when the walk never saw it.
 *
 * Every directory the last walk found is kept, so this only comes back empty
 * for a folder made since then. Saying so is the honest answer; an empty box
 * pretending to be a measurement is not.
 */
export function nodeAt(
  roots: StorageNode[],
  volume: string | null,
  path: string[],
): StorageNode | null {
  if (volume === null)
    return {
      name: "",
      kind: "directory",
      bytes: roots.reduce((total, root) => total + root.bytes, 0),
      children: roots,
    };

  let node = roots.find((root) => root.name === volume) ?? null;
  for (const name of path)
    node = node?.children?.find((child) => child.name === name) ?? null;
  return node;
}

export function StorageTreemap({
  roots,
  volume,
  path,
  files,
  onOpen,
  hovered,
  onHover,
}: {
  roots: StorageNode[];
  volume: string | null;
  path: string[];
  /**
   * The files of this very folder, as the listing beside the map read them.
   * The measurement carries directories alone, so this is where the leaves of
   * the picture come from, live rather than one scan old.
   */
  files: StorageNode[];
  /** A directory tile was clicked: its name is one step below the address. */
  onOpen: (name: string) => void;
  hovered: string | null;
  onHover: (name: string | null) => void;
}) {
  const t = useTranslator();
  const locale = useLocale();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // The box is sized by CSS; the layout follows it, and follows it again when
  // the window changes or the sidebar drawer opens over it.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const current = useMemo(
    () => nodeAt(roots, volume, path),
    [roots, volume, path],
  );
  // Directories as they were measured, files as they are on the disk now.
  const children = useMemo(
    () => [...(current?.children ?? []), ...files],
    [current, files],
  );

  // The tint says which volume is being looked at, so a colour keeps its
  // meaning from one folder to the next.
  const volumeHue = useMemo(() => {
    const index = roots.findIndex((root) => root.name === volume);
    return hueOf(index >= 0 ? index : 0);
  }, [roots, volume]);

  const placed = useMemo(
    () =>
      size.width > 0 && size.height > 0
        ? squarify(children, { x: 0, y: 0, w: size.width, h: size.height })
        : [],
    [children, size],
  );

  return (
    <div className="space-y-2">
      {/* On a phone the map is pinned above the list, so it is sized against
          the screen rather than its own width: under a third of the height,
          which leaves the rows beneath it the other half. From the small
          breakpoint it takes the ratios `docs/DESIGN.md` gives it. The cap is
          for the middle of the range,
          where the box is the full width of a tablet and four thirds of that
          is taller than the screen it is read on; the layout is measured in
          pixels, so a clamped box is a correct map of a wider rectangle
          rather than a stretched one. */}
      <div
        ref={box}
        onMouseLeave={() => onHover(null)}
        className="border-border/60 bg-card relative h-[30svh] max-h-[32rem] w-full overflow-hidden rounded-xl border sm:aspect-[4/3] sm:h-auto lg:aspect-[2/1]"
      >
        {roots.length === 0 ? (
          <p className="text-muted-foreground absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-balance">
            {t("admin.storage.notScanned")}
          </p>
        ) : current === null && children.length === 0 ? (
          <p className="text-muted-foreground absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-balance">
            {t("admin.storage.offMap")}
          </p>
        ) : children.length === 0 ? (
          <p className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
            {t("admin.storage.leaf")}
          </p>
        ) : null}

        {placed.map((node, index) => (
          <Tile
            key={`${node.name}-${index}`}
            node={node}
            depth={0}
            hue={volume === null ? hueOf(index) : volumeHue}
            locale={locale}
            highlighted={hovered === node.name}
            dimmed={hovered !== null && hovered !== node.name}
            onHover={onHover}
            onOpen={
              node.kind === "directory" ? () => onOpen(node.name) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One rectangle.
 *
 * A directory is a button, because it goes somewhere. A file is not: there is
 * nothing under it, and a control that does nothing when pressed is worse than
 * no control. Both answer to the pointer, though, since the row carrying the
 * same name lights up next to them.
 *
 * The children are drawn inside when there is room for them, inert, since the
 * tile itself is what takes the click.
 */
function Tile({
  node,
  depth,
  hue,
  locale,
  highlighted,
  dimmed,
  onHover,
  onOpen,
}: {
  node: Placed;
  depth: number;
  hue: string;
  locale: "en" | "fr";
  highlighted?: boolean;
  dimmed?: boolean;
  onHover?: (name: string | null) => void;
  onOpen?: () => void;
}) {
  const t = useTranslator();
  const isDirectory = node.kind === "directory";
  const showLabel = node.w >= LABEL_MIN_WIDTH && node.h >= LABEL_MIN_HEIGHT;
  const nestable =
    isDirectory &&
    node.w >= NEST_MIN_WIDTH &&
    node.h >= NEST_MIN_HEIGHT &&
    (node.children?.length ?? 0) > 0 &&
    depth < 1;

  const inner = nestable
    ? squarify(node.children ?? [], {
        x: 2,
        y: showLabel ? 22 : 2,
        w: Math.max(node.w - 4, 0),
        h: Math.max(node.h - (showLabel ? 24 : 4), 0),
      })
    : [];

  const style = {
    left: node.x,
    top: node.y,
    width: node.w,
    height: node.h,
    // The tint carries depth: a child is the same hue, mixed further into the
    // surface, so nesting reads without a second colour scale.
    backgroundColor: `color-mix(in oklab, ${hue} ${depth === 0 ? 16 : 26}%, var(--card))`,
  };

  const content = (
    <>
      {showLabel ? (
        <span className="pointer-events-none absolute inset-x-1.5 top-1 flex items-center gap-1 text-xs leading-tight">
          {isDirectory ? (
            <FolderIcon className="size-3 shrink-0 opacity-60" />
          ) : (
            <FileIcon className="size-3 shrink-0 opacity-60" />
          )}
          <span className="truncate font-medium">{node.name}</span>
          {node.h >= 40 ? (
            <span className="ml-auto shrink-0 opacity-70 tabular-nums">
              {formatBytes(node.bytes, locale)}
            </span>
          ) : null}
        </span>
      ) : null}

      {inner.map((child, index) => (
        <Tile
          key={`${child.name}-${index}`}
          node={child}
          depth={depth + 1}
          hue={hue}
          locale={locale}
        />
      ))}
    </>
  );

  const className = cn(
    "absolute overflow-hidden rounded-[4px] ring-inset transition-[filter,opacity] duration-150",
    highlighted
      ? "ring-primary z-10 ring-2 brightness-105 dark:brightness-125"
      : "ring-foreground/10 ring-1",
    dimmed && "opacity-60",
  );

  const pointer = onHover
    ? {
        onMouseEnter: () => onHover(node.name),
        onFocus: () => onHover(node.name),
        onBlur: () => onHover(null),
      }
    : {};

  // A tile too small for a name carried one in a `title` alone, which a screen
  // reader announces at best inconsistently. The name and the size are the
  // accessible name of the tile itself, whether it is drawn or not.
  const label = t("admin.storage.tile", {
    name: node.name,
    size: formatBytes(node.bytes, locale),
  });

  if (!isDirectory || !onOpen)
    return (
      <div
        role="img"
        className={className}
        style={style}
        title={label}
        aria-label={label}
        {...pointer}
      >
        {content}
      </div>
    );

  return (
    <button
      type="button"
      onClick={onOpen}
      title={label}
      aria-label={label}
      className={cn(
        className,
        "focus-visible:ring-ring/50 cursor-pointer text-left outline-none hover:brightness-105 focus-visible:ring-3 dark:hover:brightness-125",
      )}
      style={style}
      {...pointer}
    >
      {content}
    </button>
  );
}

/** The reserved chart hues, one per volume, stable so a colour keeps meaning. */
const HUES = [
  "oklch(0.565 0.125 57)",
  "oklch(0.55 0.09 245)",
  "oklch(0.55 0.1 155)",
  "oklch(0.55 0.1 300)",
  "oklch(0.6 0.1 90)",
];

function hueOf(index: number) {
  return HUES[index % HUES.length];
}

/**
 * Squarified treemap, after Bruls, Huizing and van Wijk.
 *
 * Entries are packed into rows along the short side of what is left, a row
 * being closed as soon as adding one more would make its rectangles worse in
 * aspect ratio than they already are. The result is tiles you can read and
 * point at, instead of the long slivers a naive slice-and-dice produces.
 */
function squarify(nodes: StorageNode[], rect: Rect): Placed[] {
  const total = nodes.reduce((sum, node) => sum + node.bytes, 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return [];

  const scale = (rect.w * rect.h) / total;
  const queue = [...nodes].sort((a, b) => b.bytes - a.bytes);
  const placed: Placed[] = [];
  let free = { ...rect };
  let index = 0;

  while (index < queue.length && free.w > 0.5 && free.h > 0.5) {
    const short = Math.min(free.w, free.h);
    const row: StorageNode[] = [];
    let rowArea = 0;
    let best = Infinity;

    while (index < queue.length) {
      const area = queue[index].bytes * scale;
      const ratio = worstRatio(
        [...row.map((n) => n.bytes * scale), area],
        short,
      );
      if (row.length === 0 || ratio <= best) {
        row.push(queue[index]);
        rowArea += area;
        best = ratio;
        index += 1;
      } else break;
    }

    const thickness = rowArea / short;
    let offset = 0;
    const horizontal = free.w >= free.h;

    for (const node of row) {
      const length = rowArea > 0 ? ((node.bytes * scale) / rowArea) * short : 0;
      placed.push({
        ...node,
        x: horizontal ? free.x : free.x + offset,
        y: horizontal ? free.y + offset : free.y,
        w: horizontal ? thickness : length,
        h: horizontal ? length : thickness,
      });
      offset += length;
    }

    free = horizontal
      ? { x: free.x + thickness, y: free.y, w: free.w - thickness, h: free.h }
      : { x: free.x, y: free.y + thickness, w: free.w, h: free.h - thickness };
  }

  return placed;
}

/** The worst aspect ratio a row would have, which is what decides to close it. */
function worstRatio(areas: number[], short: number) {
  const sum = areas.reduce((total, area) => total + area, 0);
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  if (sum <= 0 || min <= 0 || short <= 0) return Infinity;
  const sum2 = sum * sum;
  const short2 = short * short;
  return Math.max((short2 * max) / sum2, sum2 / (short2 * min));
}
