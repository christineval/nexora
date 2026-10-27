import { api, checkOrigin } from "@/lib/api";
import { createGuestSession } from "@/lib/auth";

export async function POST(request: Request) {
  return api(request, async () => {
    checkOrigin(request);
    await createGuestSession();
    return { message: "Viewing as Guest." };
  });
}
