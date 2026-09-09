import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AppError } from "@/lib/errors";

/**
 * Shared wrapper for route handlers: an application error becomes a stable JSON
 * response, anything else becomes a 500 with no detail.
 *
 * The body carries a `messageKey` rather than a sentence: the client owns the
 * wording and its language.
 */
export async function route<T>(
  handler: () => Promise<T>,
): Promise<NextResponse> {
  try {
    const body = await handler();
    return NextResponse.json(body ?? { ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    if (error.status >= 500) console.error("[api] server error", error);
    return NextResponse.json(
      { error: error.code, messageKey: error.messageKey },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "bad_request",
        messageKey: "error.badRequest",
        // Field paths help the client without revealing anything about the server.
        fields: error.issues.map((issue) => issue.path.join(".")),
      },
      { status: 400 },
    );
  }

  console.error("[api] unexpected error", error);
  return NextResponse.json(
    { error: "internal_error", messageKey: "error.internal" },
    { status: 500 },
  );
}

/** Validated JSON body, or a 400. */
export async function jsonBody<T>(
  request: Request,
  schema: { parse: (value: unknown) => T },
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  return schema.parse(raw);
}
