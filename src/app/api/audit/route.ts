import { api } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  return api(request, async () => {
    const user = await requireUser("audit");
    const { listAuditLogs } = await import("@/services/audit.service");
    const filters = Object.fromEntries([...new URL(request.url).searchParams].filter(([, value]) => value !== ""));
    return listAuditLogs(user, filters);
  });
}
