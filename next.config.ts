import type { NextConfig } from "next";

/*
 * The Content Security Policy is not here.
 *
 * It names a nonce, which is made for one request, so it cannot live in a
 * static list of headers: it is built in `src/proxy.ts`, which runs in front
 * of every document. What stays here is the set of headers that are the same
 * for everybody.
 */

const nextConfig: NextConfig = {
  // Small runtime image for the deployment target: the server copies a self
  // contained build rather than the whole node_modules tree.
  output: "standalone",
  poweredByHeader: false,
  images: {
    // Posters come from the public TMDB CDN. The media server is never exposed
    // to the browser.
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org", pathname: "/t/p/**" },
    ],
    // A TMDB image path names one file that never changes, so a resized copy
    // stays good for a month instead of being fetched and encoded again every
    // few hours on the machine that also serves the media.
    minimumCacheTTL: 2678400,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Belt and braces with robots.txt and the noindex metadata: a private
          // hub must not end up in an index, whatever crawls it.
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // Nothing here uses a sensor, a camera or a payment API.
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          /*
           * A window this one opened cannot reach back into it, and nothing
           * else may read what this origin serves. Umbra opens one outward
           * link, to the page a fundraiser actually lives on, and that page
           * has no business holding a handle on this one.
           */
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          // Traefik sets this in production too; the header is harmless over
          // plain HTTP and keeps the policy with the application.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
