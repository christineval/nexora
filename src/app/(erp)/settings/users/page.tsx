import UserManager from "@/components/features/UserManager";
import { listUsers } from "@/server/data/erp-data";
import { requirePageAccess } from "@/lib/auth";
import { canWrite } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function UsersPage() { const user = await requirePageAccess("settings"); return <UserManager canEdit={canWrite(user.role, "settings")} rows={await listUsers(user)} currentId={user.id.toString()} />; }
