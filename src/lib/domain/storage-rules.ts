/**
 * Storage rules shared by the server and the explorer.
 *
 * `storage-files.ts` touches the disk and is therefore `server-only`; the
 * explorer needs the same rule to know what it may offer, so the rule itself
 * lives here, where both sides can read it.
 */

/**
 * How deep the listed directory must be before its entries can go.
 *
 * Directly under a volume sit the libraries themselves, `Movies`, `Series`,
 * and one click there would take one whole. So a deletion happens inside a
 * library, never of one.
 */
export const MIN_DELETE_DEPTH = 1;

/**
 * Names at the root of a volume that are not a library.
 *
 * A volume root carries more than the media: the file system leaves its own
 * furniture there, and the machine keeps its working data beside it. None of
 * that is content, so none of it is walked, drawn, counted or listed, and the
 * map stops claiming room that was never the library's. Deeper down the same
 * names mean nothing in particular and are left alone.
 */
const NOT_A_LIBRARY = new Set([
  "data",
  "lost+found",
  "$recycle.bin",
  "system volume information",
  ".trash",
  "@eadir",
]);

/** True when a name at the root of a volume is one of the libraries. */
export function isLibrary(name: string): boolean {
  return !NOT_A_LIBRARY.has(name.toLowerCase());
}
