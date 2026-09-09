import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { UmbraWordmark } from "@/components/brand";
import { SignInFlow } from "@/components/sign-in-flow";
import { currentAccount } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getTranslator } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  const account = await currentAccount();
  if (account?.status === "approved") redirect("/");

  const t = await getTranslator();

  return (
    <main className="umbra-glow flex min-h-dvh flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <UmbraWordmark forLabel={t("brand.for")} />
          <p className="text-muted-foreground text-sm">{t("brand.tagline")}</p>
        </div>

        <SignInFlow
          devLoginEnabled={env().DEV_LOGIN && env().NODE_ENV !== "production"}
        />
      </div>
    </main>
  );
}
