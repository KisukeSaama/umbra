"use client";

import { useSyncExternalStore } from "react";

/**
 * The larger text setting.
 *
 * Kisuflix is watched by every age, and a size that suits a phone held by a
 * teenager is small print to a grandparent on the same sofa. The whole
 * interface is set in rem, so one class on the root scales it up by an eighth
 * (16px reads as 18px) without any component knowing about it.
 *
 * It follows the appearance setting's pattern rather than the language's: a
 * value in the browser, applied by an inline script before the first paint,
 * so a page never flashes small and then grows. Nothing is sent to the server,
 * because the server has nothing to do with it.
 */
export type TextSize = "default" | "large";

const STORAGE_KEY = "umbra-text";
const ROOT_CLASS = "umbra-text-large";

const subscribers = new Set<() => void>();

function read(): TextSize {
  try {
    return localStorage.getItem(STORAGE_KEY) === "large" ? "large" : "default";
  } catch {
    return "default";
  }
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

export function setTextSize(size: TextSize) {
  try {
    if (size === "large") localStorage.setItem(STORAGE_KEY, "large");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // A browser that refuses storage still gets the size for this page.
  }
  document.documentElement.classList.toggle(ROOT_CLASS, size === "large");
  for (const notify of subscribers) notify();
}

export function useTextSize(): TextSize {
  // The server does not know the setting, so it renders the default and the
  // inline script below has already put the class on the root by the time
  // React reads the real value here.
  return useSyncExternalStore(subscribe, read, () => "default");
}

/**
 * Applied before the first paint, the way the theme is. Inline because it has
 * to run before the stylesheet is used, and tiny because of that.
 */
export function TextSizeScript({ nonce }: { nonce?: string }) {
  const script = `try{if(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})==="large")document.documentElement.classList.add(${JSON.stringify(ROOT_CLASS)})}catch(e){}`;
  // Without the request's nonce the Content Security Policy refuses it.
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: script }} />;
}
