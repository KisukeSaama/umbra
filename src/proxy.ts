import { NextResponse, type NextRequest } from "next/server";

import { isCrossSiteMutation } from "@/lib/csrf";

/**
 * Runs in front of every request that is not a static asset.
 *
 * Two jobs, both of them about the boundary rather than about the data.
 *
 * It refuses a mutation that a browser sends from another site. Session and
 * authorisation checks stay next to the data, in the route handlers and the
 * domain layer.
 *
 * And it stamps the Content Security Policy, with a nonce made for that one
 * request. The policy used to be a static header, and a static header cannot
 * name a nonce, so it had to allow every inline script instead: the one thing
 * a policy is there to refuse. Next reads the nonce back out of the header and
 * puts it on the scripts it writes itself, so nothing here has to be threaded
 * through the pages.
 */

/** Development needs `eval`: React rebuilds server stacks in the browser with it. */
const isDevelopment = process.env.NODE_ENV === "development";

function policy(nonce: string) {
  return [
    "default-src 'self'",
    /*
     * `strict-dynamic` is what makes the nonce worth having: it drops the
     * host allow-list in favour of "only what carries this nonce, and what
     * that then loads", so a script injected into the page has nothing to
     * inherit.
     */
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    /*
     * Styles keep `unsafe-inline`, and it is not an oversight: a nonce cannot
     * be put on a `style` attribute, and the interface positions a treemap
     * tile, a poster frame and a progress bar with one. Refusing those would
     * mean refusing the layout itself.
     */
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
}

export function proxy(request: NextRequest) {
  if (isCrossSiteMutation(request.method, request.headers)) {
    return NextResponse.json(
      { error: "forbidden", messageKey: "error.forbidden" },
      { status: 403 },
    );
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = policy(nonce);

  // On the request as well as on the response: the header on the way in is
  // what Next reads to nonce the scripts it renders.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    /*
     * The REST surface, with no exception of any kind: this is where the
     * cross-site check happens, and a rule that could be stepped around by
     * naming a header would not be a check. In particular it is not filtered
     * on prefetch headers, which a caller writes itself.
     */
    "/api/:path*",
    /*
     * And every document, minus the files that need no policy of their own:
     * the build output, the image optimiser and the icons. A prefetch is
     * skipped here, since it fetches a payload rather than a document to run
     * scripts in, and a nonce of its own would only differ from the one the
     * document it prefetched for carries.
     */
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|opengraph-image.png|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
