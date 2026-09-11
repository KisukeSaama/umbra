import "server-only";

import { cache } from "react";

import { type CatalogResult, decorate } from "@/lib/domain/catalog";
import { inReleaseOrder } from "@/lib/providers/metadata";
import { tmdbProvider } from "@/lib/providers/tmdb";

/**
 * Every film of a saga, in release order, each carrying its state.
 *
 * The film being read stays in the row: its place in the order is part of the
 * answer, and so is the gap beside it. A saga of one film is no saga, and a
 * listing that fails costs this rail rather than the page, like every shelf.
 */
export const sagaShelf = cache(async function sagaShelf(
  collectionId: string,
  language?: string,
): Promise<CatalogResult[]> {
  try {
    const { parts } = await tmdbProvider.collection(collectionId, language);
    return parts.length > 1 ? await decorate(inReleaseOrder(parts)) : [];
  } catch (error) {
    console.warn("[collections] saga unavailable", error);
    return [];
  }
});
