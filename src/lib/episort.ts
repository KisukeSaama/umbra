/**
 * Links that open a folder of the library in Episort.
 *
 * Episort is a desktop application that sorts what lands in the library. It
 * registers the `episort://` scheme on the computer it is installed on, so a
 * plain link is enough: the browser hands it the address and Episort opens
 * there, connected to this server over SFTP.
 *
 * The address is the one the storage page already speaks, a volume label and
 * the names below it, never an absolute path. Episort resolves it under the
 * workspace it was configured with, which is the same folder as the volume.
 * The link may also name files inside the folder, so a selection can be sent
 * as it stands; too long a link is cut back to the folder alone, because a
 * browser silently refuses very long ones.
 */

/** Past this a browser may drop the link on the floor without a word. */
export const EPISORT_LINK_MAX_LENGTH = 2000;
/** Episort refuses a longer list, matching the batch bound of the storage API. */
export const EPISORT_FILES_MAX = 200;

export type EpisortTarget = {
  volume: string;
  path: string[];
  files?: string[];
};

export function episortLink({
  volume,
  path,
  files = [],
}: EpisortTarget): string {
  const withFiles = build(volume, path, files.slice(0, EPISORT_FILES_MAX));
  if (files.length === 0 || withFiles.length <= EPISORT_LINK_MAX_LENGTH)
    return withFiles;
  return build(volume, path, []);
}

function build(volume: string, path: string[], files: string[]) {
  const params = new URLSearchParams();
  params.set("volume", volume);
  params.set("path", path.join("/"));
  for (const file of files) params.append("file", file);
  return `episort://open?${params.toString()}`;
}
