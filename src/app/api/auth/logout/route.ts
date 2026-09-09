import { route } from "@/lib/api";
import { destroySession } from "@/lib/auth/session";

export async function POST() {
  return route(async () => {
    await destroySession();
    return { ok: true };
  });
}
