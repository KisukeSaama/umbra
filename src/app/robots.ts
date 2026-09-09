import type { MetadataRoute } from "next";

/**
 * Umbra is private. Nothing here should ever reach a search index, so the whole
 * site is disallowed, on top of the `noindex` metadata and the `X-Robots-Tag`
 * response header.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
