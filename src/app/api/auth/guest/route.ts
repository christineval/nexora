import { api, checkOrigin } from "@/lib/api";
import { createGuestSession } from "@/lib/auth";

export async function POST(request: Request) {
  return api(async () => {
    checkOrigin(request);
    await createGuestSession();
    return { message: "Viewing as Guest." };
  });
}
