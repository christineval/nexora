import { api, checkOrigin } from "@/lib/api";
import { deleteSession } from "@/lib/auth";
export async function POST(request: Request) { return api(async () => { checkOrigin(request); await deleteSession(); return { message: "Signed out." }; }); }
