"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  PlayIcon,
  SpinnerIcon,
  TrashIcon,
} from "@/components/icons";
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
import { formatBytes, formatDateTime } from "@/lib/format";
import { translateError } from "@/lib/i18n";
import { useLocale, useTranslator } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * The disk, one folder at a time.
 *
 * The map answers "what takes the room"; this answers "then take it back".
 * It lists what the server lists, live, because the measured tree is pruned
 * for drawing and a pruned tree is not something to delete from.
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

export function FileExplorer({
  volumes,
  canDelete,
}: {
  volumes: ExplorerVolume[];
  canDelete: boolean;
}) {
  const t = useTranslator();
  const locale = useLocale();
  const router = useRouter();

  const [volume, setVolume] = useState(volumes[0]?.label ?? "");
  const [path, setPath] = useState<string[]>([]);
  const [listing, setListing] = useState<StorageListing | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [playing, setPlaying] = useState<StorageEntry | null>(null);

  const current = volumes.find((entry) => entry.label === volume);

  // A new place is a new list and an empty selection: nothing ticked here can
  // mean anything there.
  const go = useCallback((nextVolume: string, nextPath: string[]) => {
    setSelected(new Set());
    setVolume(nextVolume);
    setPath(nextPath);
  }, []);

  // Bumped after a deletion, so the same place is read again.
  const [version, setVersion] = useState(0);

  useEffect(() => {
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
      } catch (error) {
        if (cancelled) return;
        toast.error(
          error instanceof Error
            ? error.message
            : translateError(locale, undefined),
        );
        // A folder that cannot be listed is left, not stared at.
        if (path.length > 0) go(volume, path.slice(0, -1));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [volume, path, locale, go, version]);

  // The listing says where it was read; while that is not where the page is,
  // the page is on its way there. No flag to keep in step with the fetch.
  const loading =
    listing === null ||
    listing.volume !== volume ||
    listing.path.length !== path.length ||
    listing.path.some((name, index) => name !== path[index]);
  const entries = listing?.entries ?? [];
  const allSelected = entries.length > 0 && selected.size === entries.length;

  function toggle(name: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleAll() {
    setSelected(
      allSelected ? new Set() : new Set(entries.map((entry) => entry.name)),
    );
  }

  const selection: Selection = useMemo(
    () => ({ volume, path, names: [...selected] }),
    [volume, path, selected],
  );
  // Stable, because the dialog weighs the selection once per opening and a
  // handler recreated on every render would have it weigh on every render.
  const closeConfirm = useCallback(() => setConfirming(false), []);

  const selectedBytes = entries
    .filter((entry) => selected.has(entry.name) && entry.bytes !== null)
    .reduce((total, entry) => total + (entry.bytes ?? 0), 0);
  const selectedFolders = entries.filter(
    (entry) => selected.has(entry.name) && entry.kind === "directory",
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
        {volumes.length > 1 ? (
          <select
            value={volume}
            onChange={(event) => go(event.target.value, [])}
            className="border-input bg-background h-7 rounded-md border px-2 text-sm"
            aria-label={t("admin.storage.volumes")}
          >
            {volumes.map((entry) => (
              <option key={entry.label} value={entry.label}>
                {entry.label}
              </option>
            ))}
          </select>
        ) : (
          <Crumb active={path.length === 0} onClick={() => go(volume, [])}>
            {volume}
          </Crumb>
        )}
        {path.map((name, index) => (
          <span key={`${index}-${name}`} className="flex items-center gap-1">
            <ChevronRightIcon className="text-muted-foreground size-3" />
            <Crumb
              active={index === path.length - 1}
              onClick={() => go(volume, path.slice(0, index + 1))}
            >
              {name}
            </Crumb>
          </span>
        ))}
        {current ? (
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            {formatBytes(current.usedBytes, locale)} /{" "}
            {formatBytes(current.totalBytes, locale)}
          </span>
        ) : null}
      </div>

      <div className="border-border/60 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground bg-secondary/40 text-xs">
            <tr>
              {canDelete ? (
                <th className="w-8 px-2 py-1.5">
                  <input
                    type="checkbox"
                    className="accent-primary size-3.5 align-middle"
                    checked={allSelected}
                    disabled={entries.length === 0}
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
            {loading && !listing ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-muted-foreground px-2 py-6 text-center"
                >
                  <SpinnerIcon className="inline" />
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-muted-foreground px-2 py-6 text-center"
                >
                  {t("admin.storage.emptyDir")}
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const isSelected = selected.has(entry.name);
                return (
                  <tr
                    key={entry.name}
                    className={cn(
                      "hover:bg-muted/40",
                      isSelected && "bg-primary/5",
                      loading && "opacity-60",
                    )}
                  >
                    {canDelete ? (
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          className="accent-primary size-3.5 align-middle"
                          checked={isSelected}
                          onChange={() => toggle(entry.name)}
                          aria-label={t("admin.storage.select", {
                            name: entry.name,
                          })}
                        />
                      </td>
                    ) : null}
                    <td className="max-w-0 px-2 py-1">
                      {entry.kind === "directory" ? (
                        <button
                          type="button"
                          className="flex w-full min-w-0 items-center gap-2 text-left hover:underline"
                          onClick={() => go(volume, [...path, entry.name])}
                          aria-label={t("admin.storage.open", {
                            name: entry.name,
                          })}
                        >
                          <FolderIcon className="text-primary size-4 shrink-0" />
                          <span className="truncate">{entry.name}</span>
                        </button>
                      ) : (
                        <span className="flex min-w-0 items-center gap-2">
                          <FileIcon className="text-muted-foreground size-4 shrink-0" />
                          <span className="truncate">{entry.name}</span>
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground px-2 py-1 text-right text-xs tabular-nums">
                      {entry.bytes === null
                        ? ""
                        : formatBytes(entry.bytes, locale)}
                    </td>
                    <td className="text-muted-foreground hidden px-2 py-1 text-right text-xs tabular-nums sm:table-cell">
                      {formatDateTime(new Date(entry.modifiedAt), locale)}
                    </td>
                    <td className="px-1 py-1 text-right">
                      {entry.playable ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setPlaying(entry)}
                          aria-label={t("admin.storage.play", {
                            name: entry.name,
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

      {canDelete && selected.size > 0 ? (
        <div className="border-border/60 bg-secondary/40 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
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

      {canDelete && confirming ? (
        <DeleteDialog
          selection={selection}
          folders={selectedFolders}
          onClose={closeConfirm}
          onDeleted={(result) => {
            setConfirming(false);
            setSelected(new Set());
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
        volume={volume}
        path={path}
        onClose={() => setPlaying(null)}
      />
    </div>
  );
}

function Crumb({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active}
      className={cn(
        "max-w-48 truncate rounded px-1 py-0.5",
        active ? "font-medium" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
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
