"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  FileExplorer,
  type ExplorerVolume,
} from "@/components/admin/file-explorer";
import { StorageTreemap, nodeAt } from "@/components/admin/storage-treemap";
import { EpisortLink } from "@/components/admin/episort-link";
import { ChevronRightIcon } from "@/components/icons";
import type { StorageNode } from "@/lib/db/schema";
import type { StorageListing } from "@/lib/domain/storage-files";
import { formatBytes } from "@/lib/format";
import { useLocale, useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * The disk, seen twice at once.
 *
 * The map and the list answered the same question in two languages and made
 * the reader carry the translation: find the fat folder in the picture, then
 * find it again in the table before deleting anything. So they are put side by
 * side and given one address. Opening a rectangle moves the list; opening a
 * row moves the map; pointing at either lights up the other. There is one
 * trail, above both, and it is the only way up.
 *
 * The address is a volume label and the names below it, which is what the
 * server takes. Above the volumes sits one more floor, where the volumes are
 * the entries, so the whole disk still has a picture of its own.
 *
 * On a wide screen the map is pinned to the right of the list, which is the
 * shape a list of results and a map have always taken. On a phone it stays
 * pinned too, under the section bar: it costs part of the screen, but the list
 * is read against the picture, and a map that scrolls away leaves the reader
 * translating from memory again. The order in
 * the document is the narrow one, the map first where it has to be seen first;
 * the wide layout swaps the two columns rather than the markup, so the reading
 * order stays what it is on a phone.
 */

export type StorageAddress = { volume: string | null; path: string[] };

export function StorageBrowser({
  volumes,
  roots,
  canDelete,
  note,
}: {
  volumes: ExplorerVolume[];
  /** The last measured tree, empty when nothing has been measured yet. */
  roots: StorageNode[];
  canDelete: boolean;
  /** When the measurement was taken, and the button that takes another. */
  note?: ReactNode;
}) {
  const t = useTranslator();
  const locale = useLocale();

  // One volume needs no floor above it: there would be one row on it.
  const single = volumes.length === 1 ? volumes[0].label : null;
  const [address, setAddress] = useState<StorageAddress>({
    volume: single,
    path: [],
  });
  const [hovered, setHovered] = useState<string | null>(null);
  // What the explorer just read, so the map can draw the files of this very
  // folder without asking the server for the same directory twice.
  const [listing, setListing] = useState<StorageListing | null>(null);

  const { volume, path } = address;
  const container = useRef<HTMLDivElement>(null);

  const go = useCallback((next: StorageAddress) => {
    setAddress(next);
    setHovered(null);
  }, []);

  // Moving into a folder starts a new list at its top, so the reader is taken
  // back to the top of it rather than left in the middle of a page that has
  // just been replaced under them.
  const trail = `${volume ?? ""} ${path.join(" ")}`;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    if (element.getBoundingClientRect().top < 0)
      element.scrollIntoView({ block: "start" });
  }, [trail]);

  const measured = nodeAt(roots, volume, path);
  const current = volumes.find((entry) => entry.label === volume);

  // The listing is only lent to the map while it stands in the same folder:
  // between two addresses it is still the old one, and the old one belongs to
  // a picture that is no longer being drawn.
  const files = useMemo(() => {
    if (
      listing === null ||
      listing.volume !== volume ||
      listing.path.length !== path.length ||
      listing.path.some((name, index) => name !== path[index])
    )
      return [];
    return listing.entries
      .filter((entry) => entry.kind === "file")
      .map((entry) => ({
        name: entry.name,
        bytes: entry.bytes ?? 0,
        kind: "file" as const,
      }));
  }, [listing, volume, path]);

  // A listing has no size for a folder, since sizing one means walking it. The
  // map has just walked them all, so it lends the list its figures.
  const sizes = useMemo(() => {
    const found = new Map<string, number>();
    for (const child of measured?.children ?? [])
      if (child.kind === "directory") found.set(child.name, child.bytes);
    return found;
  }, [measured]);

  // The way out of the current folder, which is the trail read backwards.
  const parent: StorageAddress | null =
    volume === null
      ? null
      : path.length > 0
        ? { volume, path: path.slice(0, -1) }
        : single === null
          ? { volume: null, path: [] }
          : null;

  const crumbs: { label: string; to: StorageAddress }[] = [
    ...(single === null
      ? [
          {
            label: t("admin.storage.everything"),
            to: { volume: null, path: [] },
          },
        ]
      : []),
    ...(volume === null
      ? []
      : [{ label: volume, to: { volume, path: [] } as StorageAddress }]),
    ...path.map((name, index) => ({
      label: name,
      to: { volume, path: path.slice(0, index + 1) },
    })),
  ];

  return (
    <div
      ref={container}
      className="scroll-mt-28 lg:scroll-mt-20 lg:grid lg:grid-cols-2 lg:gap-6"
    >
      {/* A pinned box only travels inside its containing block, so the map is
          given one as tall as the list: below `lg` the column dissolves and
          the map hangs directly under the browser, on a wide screen it is the
          stretched half beside the list. Pinning the map to its own box would
          be pinning it to nothing, and it would scroll away with the page. */}
      <div className="contents lg:order-2 lg:block">
        <div className="bg-card sticky top-28 z-20 mb-4 space-y-2 pt-1 pb-3 lg:top-20 lg:mb-0">
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <span key={index} className="flex min-w-0 items-center gap-1">
                  {index > 0 ? (
                    <ChevronRightIcon className="text-muted-foreground size-3 shrink-0" />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => go(crumb.to)}
                    disabled={last}
                    className={cn(
                      "focus-visible:ring-ring/50 max-w-[12rem] truncate rounded-md px-1 py-0.5 transition-colors outline-none focus-visible:ring-3",
                      last
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {crumb.label}
                  </button>
                </span>
              );
            })}
            <span className="ml-auto flex items-center gap-2">
              {volume !== null ? (
                <EpisortLink
                  target={{ volume, path }}
                  title={t("admin.storage.openInEpisort.hint")}
                />
              ) : null}
              <span className="text-muted-foreground text-xs tabular-nums">
                {measured
                  ? formatBytes(measured.bytes, locale)
                  : current
                    ? `${formatBytes(current.usedBytes, locale)} / ${formatBytes(current.totalBytes, locale)}`
                    : null}
              </span>
            </span>
          </div>

          <StorageTreemap
            roots={roots}
            volume={volume}
            path={path}
            files={files}
            onOpen={(name) =>
              go(
                volume === null
                  ? { volume: name, path: [] }
                  : { volume, path: [...path, name] },
              )
            }
            hovered={hovered}
            onHover={setHovered}
          />

          {/* Pinned with the map only where there is room for it; on a phone
              it heads the list and scrolls away. */}
          {note ? <div className="hidden pt-1 lg:block">{note}</div> : null}
        </div>
      </div>

      <div className="min-w-0 lg:order-1">
        {note ? <div className="mb-4 lg:hidden">{note}</div> : null}
        <FileExplorer
          volumes={volumes}
          volume={volume}
          path={path}
          sizes={sizes}
          parent={parent}
          onNavigate={go}
          onListing={setListing}
          canDelete={canDelete}
          hovered={hovered}
          onHover={setHovered}
        />
      </div>
    </div>
  );
}
