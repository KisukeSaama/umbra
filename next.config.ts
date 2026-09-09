import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";

/**
 * Content Security Policy.
 *
 * Scripts and styles come from this origin only; Next and React need inline
 * scripts and styles for hydration and the theme, so `unsafe-inline` stays for
 * those two, and everything else is closed: no plugin, no frame, no form
 * posted elsewhere, no connection to a third party from the browser. Posters
 * are the one external source, the public TMDB CDN. Development adds `eval`,
 * which React uses there to rebuild server stacks in the browser.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://image.tmdb.org",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

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
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          // Nothing here uses a sensor, a camera or a payment API.
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
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
