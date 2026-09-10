import { NextResponse } from "next/server";

import { ping } from "@/lib/db";

/**
 * Liveness for the container healthcheck.
 *
 * It checks the database, because a web container that cannot read its own
 * schema has nothing useful to serve. It says nothing else: no version, no
 * hostname, no dependency detail.
 */
export async function GET() {
  try {
    await ping();
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("[health] database unreachable", error);
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}

export const dynamic = "force-dynamic";
