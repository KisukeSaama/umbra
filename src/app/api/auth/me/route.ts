import { route } from "@/lib/api";
import { currentAccount } from "@/lib/auth/session";

/** Who is signed in, if anyone. Used by client components after a sign-in. */
export async function GET() {
  return route(async () => {
    const account = await currentAccount();
    return { account };
  });
}

export const dynamic = "force-dynamic";
