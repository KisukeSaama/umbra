"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ChevronRightIcon, FileIcon, FolderIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
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
 * which is what makes the shape of a library legible at a glance; clicking a
 * directory descends into it, and the trail above walks back out.
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

export function StorageTreemap({ roots }: { roots: StorageNode[] }) {
  const t = useTranslator();
  const locale = useLocale();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  /** Indices from the roots down to what is currently drawn. */
  const [trail, setTrail] = useState<number[]>([]);

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

  const virtualRoot: StorageNode = useMemo(
    () => ({
      name: "",
      kind: "directory",
      bytes: roots.reduce((total, root) => total + root.bytes, 0),
      children: roots,
    }),
    [roots],
  );

  // A trail that no longer matches the tree (a rescan moved things) simply
  // stops where it stops, rather than throwing on a missing child.
  const path: StorageNode[] = useMemo(() => {
    const nodes = [virtualRoot];
    for (const index of trail) {
      const child = nodes[nodes.length - 1].children?.[index];
      if (!child) break;
      nodes.push(child);
    }
    return nodes;
  }, [virtualRoot, trail]);

  const current = path[path.length - 1];
  const children = useMemo(() => current.children ?? [], [current]);

  const placed = useMemo(
    () =>
      size.width > 0 && size.height > 0
        ? squarify(children, {
            x: 0,
            y: 0,
            w: size.width,
            h: size.height,
          })
        : [],
    [children, size],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
        <button
          type="button"
          onClick={() => setTrail([])}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-md px-1 py-0.5 transition-colors outline-none focus-visible:ring-3"
        >
          {t("admin.storage.everything")}
        </button>
        {path.slice(1).map((node, index) => (
          <span key={index} className="flex min-w-0 items-center gap-1">
            <ChevronRightIcon className="text-muted-foreground size-3 shrink-0" />
            <button
              type="button"
              onClick={() => setTrail(trail.slice(0, index + 1))}
              className={cn(
                "focus-visible:ring-ring/50 max-w-[12rem] truncate rounded-md px-1 py-0.5 transition-colors outline-none focus-visible:ring-3",
                index === path.length - 2
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {node.name}
            </button>
          </span>
        ))}
        <span className="text-muted-foreground ml-auto tabular-nums">
          {formatBytes(current.bytes, locale)}
        </span>
      </div>

      {/* Tall on a phone, wide on a desk: a treemap wants the room the screen
          actually has, not a fixed shape it has to be squeezed into. */}
      <div
        ref={box}
        className="border-border/60 bg-card relative aspect-[3/4] w-full overflow-hidden rounded-xl border sm:aspect-[4/3] lg:aspect-[2/1]"
      >
        {children.length === 0 ? (
          <p className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
            {t("admin.storage.leaf")}
          </p>
        ) : null}

        {placed.map((node, index) => (
          <Tile
            key={`${node.name}-${index}`}
            node={node}
            depth={0}
            hue={hueOf(trail.length === 0 ? index : trail[0])}
            locale={locale}
            onOpen={() => setTrail([...trail, indexIn(children, node)])}
          />
        ))}
      </div>

      {current.truncated ? (
        <p className="text-muted-foreground text-xs">
          {t("admin.storage.folded", { count: current.truncated })}
        </p>
      ) : null}

      {trail.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTrail(trail.slice(0, -1))}
        >
          {t("common.back")}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One rectangle.
 *
 * A directory is a button, because it goes somewhere. A file is not: there is
 * nothing under it, and a control that does nothing when pressed is worse than
 * no control. The children are drawn inside when there is room for them,
 * inert, since the tile itself is what takes the click.
 */
function Tile({
  node,
  depth,
  hue,
  locale,
  onOpen,
}: {
  node: Placed;
  depth: number;
  hue: string;
  locale: "en" | "fr";
  onOpen?: () => void;
}) {
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
        <span className="pointer-events-none absolute inset-x-1.5 top-1 flex items-center gap-1 text-[0.6875rem] leading-tight">
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

  const className =
    "absolute overflow-hidden rounded-[4px] ring-1 ring-inset ring-foreground/10 transition-[filter] duration-150";

  if (!isDirectory || !onOpen)
    return (
      <div
        className={className}
        style={style}
        title={`${node.name} - ${formatBytes(node.bytes, locale)}`}
      >
        {content}
      </div>
    );

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${node.name} - ${formatBytes(node.bytes, locale)}`}
      className={cn(
        className,
        "focus-visible:ring-ring/50 cursor-pointer text-left outline-none hover:brightness-105 focus-visible:ring-3 dark:hover:brightness-125",
      )}
      style={style}
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

function indexIn(children: StorageNode[], node: StorageNode) {
  return children.findIndex(
    (child) => child.name === node.name && child.bytes === node.bytes,
  );
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
