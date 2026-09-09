import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { jsonBody, route } from "@/lib/api";
import { currentAccount } from "@/lib/auth/session";
import { isProduction } from "@/lib/env";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALES } from "@/lib/i18n";
import { checkRate, clientAddress, perMinute } from "@/lib/rate-limit";

const schema = z.object({ locale: z.enum([...LOCALES, "auto"]) });

/**
 * Records the language the visitor wants to read, or hands the choice back to
 * the browser with `auto`. It is a cookie on the visitor's own browser, so no
 * account is needed: the sign-in screen benefits from it too.
 */
export async function POST(request: NextRequest) {
  return route(async () => {
    const account = await currentAccount();
    checkRate(
      "locale",
      account?.id ?? clientAddress(request.headers),
      perMinute(20),
    );

    const { locale } = await jsonBody(request, schema);
    const store = await cookies();
    if (locale === "auto") {
      store.delete(LOCALE_COOKIE);
    } else {
      store.set(LOCALE_COOKIE, locale, {
        sameSite: "lax",
        secure: isProduction(),
        path: "/",
        maxAge: LOCALE_COOKIE_MAX_AGE,
      });
    }
    return { locale };
  });
}
