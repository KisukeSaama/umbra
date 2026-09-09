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
