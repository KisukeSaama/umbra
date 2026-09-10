"use client";

import { translateError, type Locale } from "@/lib/i18n";

/**
 * The one way a client component talks to the API.
 *
 * `@/lib/api` is the server half of the same contract and is `server-only`, so
 * every button in here used to carry its own copy of the same fifteen lines:
 * fetch, parse, read `messageKey`, throw, catch, toast. What is left of that is
 * one call and one `catch`.
 *
 * The error carries the key rather than a sentence, exactly as the route
 * returns it: the wording is chosen at the point it is shown, in the language
 * of whoever is reading.
 */
export class ApiError extends Error {
  constructor(readonly messageKey: string | undefined) {
    super(messageKey ?? "error.internal");
    this.name = "ApiError";
  }
}

/**
 * A call, its answer parsed, and a refusal turned into an `ApiError`.
 *
 * A body is serialised as JSON when there is one, which is what decides the
 * method's content type. An answer that is not JSON at all, a gateway page in
 * front of the application for instance, is a refusal like any other rather
 * than a parse error nobody catches.
 */
export async function request<T>(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const hasBody = init.body !== undefined;
  const response = await fetch(url, {
    method: init.method ?? (hasBody ? "POST" : "GET"),
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) throw new ApiError(messageKeyOf(body));
  return body as T;
}

/**
 * The sentence to show for a failed call.
 *
 * Anything that is not an `ApiError` is a browser failure: an offline tab, a
 * cancelled navigation, a certificate. Those carry a message written by the
 * browser, in the browser's own language and in its own words, so they are
 * shown as the generic refusal instead.
 */
export function requestError(locale: Locale, error: unknown): string {
  return translateError(
    locale,
    error instanceof ApiError ? error.messageKey : undefined,
  );
}

function messageKeyOf(body: unknown): string | undefined {
  if (body === null || typeof body !== "object") return undefined;
  const key = (body as { messageKey?: unknown }).messageKey;
  return typeof key === "string" ? key : undefined;
}
