import SettingsPanel from "@/components/features/SettingsPanel";
import { requirePageAccess } from "@/lib/auth";
export default async function SettingsPage() { const user = await requirePageAccess("settings"); return <SettingsPanel user={{ name: user.name, role: user.role }} />; }
