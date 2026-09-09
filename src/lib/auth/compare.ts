import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison, so response timing reveals nothing about
 * how much of a secret matched.
 */
export function safeEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
