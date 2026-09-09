import type { NextConfig } from "next";

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
        ],
      },
    ];
  },
};

export default nextConfig;
