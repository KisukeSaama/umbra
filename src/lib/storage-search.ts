import { searchableTitle } from "@/lib/search-sites";

const container =
  /^(?:animes?|animation|series|tv|tv shows|films?|movies?|medias?|plex|specials?|extras?|bonus|ova|ost|subtitles?|subs|s\d{1,3}|(?:season|saison)\s*\d{1,3})$/i;

/** Suggest a title from the closest named folder, including inside a season. */
export function storageSearchTitle(path: string[]): string {
  for (let index = path.length - 1; index >= 0; index--) {
    const name = searchableTitle(path[index].replace(/\[[^\]]*\]/g, " "));
    if (container.test(name)) continue;
    // Release details would constrain a search to the encode being replaced.
    const title = name
      .split(
        /\b(?:s\d{1,3}(?:e\d{1,3})?|(?:season|saison)\s*\d{1,3}|(?:480|576|720|1080|2160)[pi]|4k|x26[45]|h\s?26[45]|hevc|av1|10\s*bits?|vostfr|vf[fqi]?|multi|dual\s*audio|bdrip|bluray|blu\s*ray|web\s*(?:rip|dl)|dvdrip|integral(?:e)?)\b/i,
      )[0]
      .trim();
    if (title && !container.test(title)) return title;
  }
  return "";
}
