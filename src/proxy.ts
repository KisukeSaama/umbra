import { NextResponse, type NextRequest } from "next/server";

import { isCrossSiteMutation } from "@/lib/csrf";

/**
 * Runs in front of the REST routes.
 *
 * One job: refuse a mutation that a browser sends from another site. Session
 * and authorisation checks stay next to the data, in the route handlers and
 * the domain layer; this is the network boundary, not the guard.
 */
export function proxy(request: NextRequest) {
  if (isCrossSiteMutation(request.method, request.headers)) {
    return NextResponse.json(
      { error: "forbidden", messageKey: "error.forbidden" },
      { status: 403 },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
