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
    const text = await cappedText(request);
    raw = text === "" ? {} : JSON.parse(text);
  } catch (error) {
    if (error instanceof AppError) throw error;
    raw = {};
  }
  return schema.parse(raw);
}

/**
 * The body as text, read chunk by chunk and given up on as soon as it passes
 * the cap. A caller that declares nothing (a chunked body), or lies about it,
 * is measured instead, in bytes: a string's length counts UTF-16 units, which
 * lets a body of multi-byte characters weigh up to three times the cap.
 */
async function cappedText(request: Request): Promise<string> {
  return new TextDecoder().decode(await cappedBytes(request, MAX_BODY_BYTES));
}

/**
 * The body as bytes, refused with a 400 as soon as it is over `max`.
 *
 * The declared length is believed only when it says too much; otherwise the
 * bytes are counted as they arrive, so a chunked body or a false header costs
 * at most `max` bytes of memory before it is turned away.
 */
export async function cappedBytes(
  request: Request,
  max: number,
  messageKey = "error.badRequest",
): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max)
    throw new BadRequestError(messageKey);
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new BadRequestError(messageKey);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
