import type { Metadata, Viewport } from "next";
import { Instrument_Serif, JetBrains_Mono, Manrope } from "next/font/google";

import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";

/**
 * Type pairing: an editorial serif for the few large lines that carry the mood,
 * a warm geometric grotesk for everything that has to be read, and a mono kept
 * for codes and job names.
 */
const display = Instrument_Serif({
  variable: "--font-display",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});
const body = Manrope({ variable: "--font-body", subsets: ["latin"] });
const code = JetBrains_Mono({ variable: "--font-code", subsets: ["latin"] });

/**
 * Umbra is a private hub. It is never meant to be indexed, so the whole app
 * carries `noindex` on top of `robots.txt` and the `X-Robots-Tag` header set in
 * `next.config.ts`.
 */
export const metadata: Metadata = {
  title: { default: "Umbra", template: "%s - Umbra" },
  description: "Private media community hub.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d11" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${display.variable} ${body.variable} ${code.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <LocaleProvider locale={locale}>
            {children}
            <Toaster position="bottom-right" />
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
