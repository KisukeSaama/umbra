"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  ChevronUpIcon,
  DiskIcon,
  FileIcon,
  FolderIcon,
  PlayIcon,
  SpinnerIcon,
  TrashIcon,
} from "@/components/icons";
import { EpisortLink } from "@/components/admin/episort-link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  StorageDeletion,
  StorageEntry,
  StorageListing,
  StorageWeight,
} from "@/lib/domain/storage-files";
import { MIN_DELETE_DEPTH } from "@/lib/domain/storage-rules";
import { formatBytes, formatDateTime } from "@/lib/format";
import { translateError } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * The disk, one folder at a time.
 *
 * The map answers "what takes the room"; this answers "then take it back".
 * It lists what the server lists, live, because a measurement is a moment ago
 * and a moment ago is not something to delete from.
 *
 * Where it looks is not its own: the address comes from the browser around it
 * and every move is announced back, so the map stands in the same folder and
 * a rectangle and a row always name the same thing. Above the volumes there is
 * one more floor, the volumes themselves, listed here from the measurement
 * rather than from the disk since there is no directory above a root.
 *
 * Everyone on the staff can look and can play a video. Only the administrator
 * sees a checkbox, and what is ticked is never deleted without a dialog that
 * says how much it weighs, names every entry, and reminds that a folder goes
 * with everything in it. The weight is asked when the dialog opens, because
 * measuring a folder is a walk and a walk on every click would be the page
 * measuring the disk for a living.
 */

export type ExplorerVolume = {
  label: string;
  usedBytes: number;
  totalBytes: number;
};

type Selection = { volume: string; path: string[]; names: string[] };

/** No tick at all, one object, so a fresh set is not made on every render. */
const NOTHING: ReadonlySet<string> = new Set<string>();

/** One line, whether it comes from the disk or from the list of volumes. */
type Row = {
  name: string;
  kind: "directory" | "file";
  bytes: number | null;
  /** The size is the last measurement's, not a figure read just now. */
  measured: boolean;
  modifiedAt: string | null;
  entry: StorageEntry | null;
};

export function FileExplorer({
  volumes,
  volume,
  path,
  sizes,
  parent,
  onNavigate,
  onListing,
  canDelete,
  hovered,
  onHover,
}: {
  volumes: ExplorerVolume[];
  /** Null is the floor above the volumes, where they are the entries. */
  volume: string | null;
  path: string[];
  /**
   * What the last walk found under each name here, for the folders the
   * listing cannot size: a directory is only weighed by walking it, and a
   * walk per row would be the page measuring the disk for a living.
   */
  sizes: ReadonlyMap<string, number>;
  /** Where the way out leads, or null on the topmost floor. */
  parent: { volume: string | null; path: string[] } | null;
  onNavigate: (next: { volume: string | null; path: string[] }) => void;
  /**
   * What was just read here, handed up. The measurement holds directories
   * alone, so the map next door draws its files from this listing rather than
   * asking the server for the same folder a second time.
   */
  onListing?: (listing: StorageListing | null) => void;
  canDelete: boolean;
  hovered: string | null;
  onHover: (name: string | null) => void;
}) {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();

  const [listing, setListing] = useState<StorageListing | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [playing, setPlaying] = useState<StorageEntry | null>(null);

  // The address as one value, so what follows the explorer around follows the
  // place rather than the identity of the array it was handed.
  const address = `${volume ?? ""}/${path.join("/")}`;

  // Ticks are kept with the folder they were made in, so moving empties the
  // selection by arithmetic instead of by an effect chasing the address:
  // nothing ticked there can mean anything here.
  const [ticked, setTicked] = useState<{ at: string; names: Set<string> }>(
    () => ({ at: address, names: new Set() }),
  );
  const selected = ticked.at === address ? ticked.names : NOTHING;

  const clearSelection = useCallback(
    () => setTicked({ at: address, names: new Set() }),
    [address],
  );

  // Bumped after a deletion, so the same place is read again.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (volume === null) {
      onListing?.(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const query = new URLSearchParams({ volume });
        for (const name of path) query.append("path", name);
        const response = await fetch(`/api/admin/storage/files?${query}`);
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok)
          throw new Error(translateError(locale, body.messageKey));
        setListing(body as StorageListing);
        onListing?.(body as StorageListing);
      } catch (error) {
        if (cancelled) return;
        toast.error(
          error instanceof Error
            ? error.message
            : translateError(locale, undefined),
        );
        // A folder that cannot be listed is left, not stared at.
        if (path.length > 0) onNavigate({ volume, path: path.slice(0, -1) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [volume, path, locale, onNavigate, onListing, version]);

  // The listing says where it was read; while that is not where the page is,
  // the page is on its way there. No flag to keep in step with the fetch.
  const stale =
    listing === null ||
    listing.volume !== volume ||
    listing.path.length !== path.length ||
    listing.path.some((name, index) => name !== path[index]);
  const loading = volume !== null && stale;

  const rows: Row[] = useMemo(() => {
    if (volume === null)
      return volumes.map((entry) => ({
        name: entry.label,
        kind: "directory" as const,
        bytes: entry.usedBytes,
        measured: false,
        modifiedAt: null,
        entry: null,
      }));
    if (stale) return [];
    return (listing?.entries ?? []).map((entry) => ({
      name: entry.name,
      kind: entry.kind,
      // A folder has no size in a listing, so the map lends it the one it
      // draws. Nothing was measured for it when the walk folded it away or
      // stopped above it, and then the column stays empty rather than lying.
      bytes: entry.bytes ?? sizes.get(entry.name) ?? null,
      measured: entry.bytes === null && sizes.has(entry.name),
      modifiedAt: entry.modifiedAt,
      entry,
    }));
  }, [volume, volumes, listing, stale, sizes]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  // The libraries at the root are not deletable, so they are not tickable:
  // a checkbox that leads to a refusal is a checkbox that lies.
  const selectable =
    canDelete && volume !== null && path.length >= MIN_DELETE_DEPTH;

  function open(name: string) {
    if (volume === null) onNavigate({ volume: name, path: [] });
    else onNavigate({ volume, path: [...path, name] });
  }

  function toggle(name: string) {
    const names = new Set(selected);
    if (names.has(name)) names.delete(name);
    else names.add(name);
    setTicked({ at: address, names });
  }

  function toggleAll() {
    setTicked({
      at: address,
      names: allSelected ? new Set() : new Set(rows.map((row) => row.name)),
    });
  }

  const selection: Selection = useMemo(
    () => ({ volume: volume ?? "", path, names: [...selected] }),
    [volume, path, selected],
  );
  // Stable, because the dialog weighs the selection once per opening and a
  // handler recreated on every render would have it weigh on every render.
  const closeConfirm = useCallback(() => setConfirming(false), []);

  const selectedBytes = rows
    .filter((row) => selected.has(row.name) && row.bytes !== null)
    .reduce((total, row) => total + (row.bytes ?? 0), 0);
  const selectedFolders = rows.filter(
    (row) => selected.has(row.name) && row.kind === "directory",
  ).length;

  return (
    <div className="space-y-3" onMouseLeave={() => onHover(null)}>
      <div className="border-border/60 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground bg-secondary/40 text-xs">
            <tr>
              {selectable ? (
                <th className="w-8 px-2 py-1.5">
                  <input
                    type="checkbox"
                    className="accent-primary size-3.5 align-middle"
                    checked={allSelected}
                    disabled={rows.length === 0}
                    onChange={toggleAll}
                    aria-label={t("admin.storage.selectAll")}
                  />
                </th>
              ) : null}
              <th className="px-2 py-1.5 text-left font-medium">
                {t("admin.storage.name")}
              </th>
              <th className="w-24 px-2 py-1.5 text-right font-medium">
                {t("admin.storage.size")}
              </th>
              <th className="hidden w-40 px-2 py-1.5 text-right font-medium sm:table-cell">
                {t("admin.storage.modified")}
              </th>
              <th className="w-8 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-border/60 divide-y">
            {/* The way out, where a file manager has always put it: the first
                line of the folder, before anything the folder holds. */}
            {parent ? (
              <tr className="hover:bg-muted/40">
                {selectable ? <td className="px-2 py-1" /> : null}
                <td className="px-2 py-1" colSpan={4}>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-left"
                    onClick={() => onNavigate(parent)}
                  >
                    <ChevronUpIcon className="size-4 shrink-0" />
                    <span className="font-medium">..</span>
                    <span className="sr-only">{t("admin.storage.up")}</span>
                  </button>
                </td>
              </tr>
            ) : null}

            {loading && listing === null ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-muted-foreground px-2 py-6 text-center"
                >
                  <SpinnerIcon className="inline" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-muted-foreground px-2 py-6 text-center"
                >
                  {t("admin.storage.emptyDir")}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isSelected = selected.has(row.name);
                return (
                  <tr
                    key={row.name}
                    onMouseEnter={() => onHover(row.name)}
                    className={cn(
                      "hover:bg-muted/40",
                      isSelected && "bg-primary/5",
                      hovered === row.name &&
                        "bg-primary/5 ring-primary/40 ring-1 ring-inset",
                      loading && "opacity-60",
                    )}
                  >
                    {selectable ? (
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          className="accent-primary size-3.5 align-middle"
                          checked={isSelected}
                          onChange={() => toggle(row.name)}
                          aria-label={t("admin.storage.select", {
                            name: row.name,
                          })}
                        />
                      </td>
                    ) : null}
                    <td className="max-w-0 px-2 py-1">
                      {row.kind === "directory" ? (
                        <button
                          type="button"
                          className="flex w-full min-w-0 items-center gap-2 text-left hover:underline"
                          onClick={() => open(row.name)}
                          onFocus={() => onHover(row.name)}
                          onBlur={() => onHover(null)}
                          aria-label={t("admin.storage.open", {
                            name: row.name,
                          })}
                        >
                          {volume === null ? (
                            <DiskIcon className="text-primary size-4 shrink-0" />
                          ) : (
                            <FolderIcon className="text-primary size-4 shrink-0" />
                          )}
                          <span className="truncate">{row.name}</span>
                        </button>
                      ) : (
                        <span className="flex min-w-0 items-center gap-2">
                          <FileIcon className="text-muted-foreground size-4 shrink-0" />
                          <span className="truncate">{row.name}</span>
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground px-2 py-1 text-right text-xs tabular-nums">
                      {row.bytes === null ? (
                        ""
                      ) : row.measured ? (
                        <span
                          className="opacity-80"
                          title={t("admin.storage.measuredSize")}
                        >
                          {`~ ${formatBytes(row.bytes, locale)}`}
                        </span>
                      ) : (
                        formatBytes(row.bytes, locale)
                      )}
                    </td>
                    <td className="text-muted-foreground hidden px-2 py-1 text-right text-xs tabular-nums sm:table-cell">
                      {row.modifiedAt === null
                        ? ""
                        : formatDateTime(new Date(row.modifiedAt), locale)}
                    </td>
                    <td className="px-1 py-1 text-right">
                      {row.entry?.playable ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setPlaying(row.entry)}
                          aria-label={t("admin.storage.play", {
                            name: row.name,
                          })}
                        >
                          <PlayIcon />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {canDelete && volume !== null && !selectable && rows.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("admin.storage.rootProtected")}
        </p>
      ) : null}

      {selectable && selected.size > 0 ? (
        <div className="border-border/60 bg-secondary/40 sticky bottom-0 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm backdrop-blur">
          <span className="font-medium tabular-nums">
            {t("admin.storage.selected", { count: selected.size })}
          </span>
          {selectedBytes > 0 || selectedFolders > 0 ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {selectedBytes > 0 ? formatBytes(selectedBytes, locale) : null}
              {selectedBytes > 0 && selectedFolders > 0 ? " + " : null}
              {selectedFolders > 0 ? (
                <FolderIcon className="inline size-3.5 align-text-bottom" />
              ) : null}
              {selectedFolders > 0 ? ` ${selectedFolders}` : null}
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-2">
            {volume !== null ? (
              <EpisortLink
                target={{
                  volume,
                  path,
                  // Folders in the selection are left to the folder link: a
                  // scan takes files, and Episort lists what it was given.
                  files: rows
                    .filter(
                      (row) => selected.has(row.name) && row.kind === "file",
                    )
                    .map((row) => row.name),
                }}
                title={t("admin.storage.openInEpisort.selection")}
              />
            ) : null}
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              {t("admin.storage.clearSelection")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirming(true)}
            >
              <TrashIcon />
              {t("common.delete")}
            </Button>
          </span>
        </div>
      ) : null}

      {selectable && confirming ? (
        <DeleteDialog
          selection={selection}
          folders={selectedFolders}
          onClose={closeConfirm}
          onDeleted={(result) => {
            setConfirming(false);
            clearSelection();
            if (result.deleted.length > 0)
              toast.success(
                t("admin.storage.deleted", { count: result.deleted.length }),
              );
            if (result.failed.length > 0)
              toast.error(
                t("admin.storage.deleteFailed", {
                  count: result.failed.length,
                }),
              );
            setVersion((previous) => previous + 1);
            // The figures above read from a snapshot the deletion just wrote.
            router.refresh();
          }}
        />
      ) : null}

      <PlayerDialog
        entry={playing}
        volume={volume ?? ""}
        path={path}
        onClose={() => setPlaying(null)}
      />
    </div>
  );
}

/**
 * The question before the deletion.
 *
 * Mounted for as long as it is open, so its state is born with it and dies
 * with it. Opening it asks the server what the selection weighs; the
 * destructive button waits for the answer, so the figure is always read
 * before it is acted on.
 */
function DeleteDialog({
  selection,
  folders,
  onClose,
  onDeleted,
}: {
  selection: Selection;
  folders: number;
  onClose: () => void;
  onDeleted: (result: StorageDeletion) => void;
}) {
  const t = useTranslator();
  const locale = useLocale();
  const [weight, setWeight] = useState<StorageWeight | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/admin/storage/files/weigh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(selection),
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(translateError(locale, body.messageKey));
        if (!cancelled) setWeight(body as StorageWeight);
      } catch (error) {
        if (cancelled) return;
        toast.error(
          error instanceof Error
            ? error.message
            : translateError(locale, undefined),
        );
        onClose();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selection, locale, onClose]);

  async function remove() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/storage/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(translateError(locale, body.messageKey));
      onDeleted(body as StorageDeletion);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateError(locale, undefined),
      );
    } finally {
      setBusy(false);
    }
  }

  const count = selection.names.length;

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.storage.deleteTitle", { count })}</DialogTitle>
          <DialogDescription>
            {t("admin.storage.deleteWarning")}
            {folders > 0 ? ` ${t("admin.storage.deleteFolders")}` : ""}
          </DialogDescription>
        </DialogHeader>

        <p className="flex items-center gap-2 text-sm tabular-nums">
          {weight ? (
            weight.partial ? (
              t("admin.storage.weightPartial", {
                bytes: formatBytes(weight.bytes, locale),
              })
            ) : (
              t("admin.storage.weight", {
                bytes: formatBytes(weight.bytes, locale),
                count: weight.files,
              })
            )
          ) : (
            <>
              <SpinnerIcon className="text-primary" />
              <span className="text-muted-foreground">
                {t("admin.storage.weighing")}
              </span>
            </>
          )}
        </p>

        <ul className="border-border/60 max-h-48 overflow-y-auto rounded-md border text-xs">
          {selection.names.map((name) => (
            <li
              key={name}
              className="border-border/60 truncate border-b px-2 py-1 last:border-b-0"
            >
              {name}
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={busy || weight === null}
            onClick={() => void remove()}
          >
            {busy ? <SpinnerIcon /> : <TrashIcon />}
            {t("admin.storage.deleteTitle", { count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One video, in place.
 *
 * The file is streamed as it is; the browser says whether it can decode it,
 * and when it cannot the message says where it can be watched instead.
 */
function PlayerDialog({
  entry,
  volume,
  path,
  onClose,
}: {
  entry: StorageEntry | null;
  volume: string;
  path: string[];
  onClose: () => void;
}) {
  const t = useTranslator();
  const [failed, setFailed] = useState(false);

  const src = useMemo(() => {
    if (!entry) return null;
    const query = new URLSearchParams({ volume, name: entry.name });
    for (const name of path) query.append("path", name);
    return `/api/admin/storage/files/stream?${query}`;
  }, [entry, volume, path]);

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(next) => {
        if (next) return;
        setFailed(false);
        onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{entry?.name}</DialogTitle>
          <DialogDescription>
            {failed
              ? t("admin.storage.playerFailed")
              : t("admin.storage.playerHint")}
          </DialogDescription>
        </DialogHeader>
        {src ? (
          <video
            key={src}
            src={src}
            controls
            autoPlay
            preload="metadata"
            className="aspect-video w-full rounded-md bg-black"
            onError={() => setFailed(true)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
