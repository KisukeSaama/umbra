import "server-only";

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import {
  AppError,
  BadRequestError,
  NotFoundError,
  RateLimitedError,
} from "@/lib/errors";

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
    const headers = new Headers();
    if (error instanceof RateLimitedError && error.retryAfter)
      headers.set("Retry-After", error.retryAfter);
    return NextResponse.json(
      { error: error.code, messageKey: error.messageKey },
      { status: error.status, headers },
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

/**
 * The identifier in a path, validated.
 *
 * Every row Umbra addresses from a URL is keyed by a `uuid`, and a segment that
 * is not one used to reach Postgres as a query and come back as "invalid input
 * syntax", which this layer could only read as an unexpected fault: a 500 in
 * the logs for what is a malformed request, and a way for anyone to fill those
 * logs with noise real faults then hide in.
 */
export async function idParam(
  params: Promise<{ id: string }>,
): Promise<string> {
  const { id } = await params;
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

/**
 * The largest body any route here accepts.
 *
 * Nothing Umbra takes in is bigger than a note and a handful of poll options:
 * the longest field in the whole surface is four thousand characters. The cap
 * is what stops a body being read into memory before the schema gets to say
 * how short it should have been.
 */
const MAX_BODY_BYTES = 64 * 1024;

/** Validated JSON body, or a 400. */
export async function jsonBody<T>(
  request: Request,
  schema: { parse: (value: unknown) => T },
): Promise<T> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
    throw new BadRequestError();

  let raw: unknown;
  try {
    const text = await request.text();
    // A caller that declares nothing, or lies about it, is measured instead.
    if (text.length > MAX_BODY_BYTES) throw new BadRequestError();
    raw = text === "" ? {} : JSON.parse(text);
  } catch (error) {
    if (error instanceof AppError) throw error;
    raw = {};
  }
  return schema.parse(raw);
}
