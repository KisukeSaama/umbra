"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Appearance follows the operating system by default. The override lives in the
 * account menu, not as a switch in the header: it is a preference, not a
 * navigation item.
 */
export function ThemeProvider({
  children,
  nonce,
}: {
  children: ReactNode;
  /** The inline script that sets the theme before paint needs it to run. */
  nonce?: string;
}) {
  return (
    <NextThemesProvider
      nonce={nonce}
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
