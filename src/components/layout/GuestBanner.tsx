import { guestSnapshotInfo } from "@/server/demo/guest-data";
import { formatDateTime } from "@/lib/utils";

export default function GuestBanner() {
  return <div className="mb-5 space-y-1 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200">
    <p>Viewing as Guest. Guest access is for viewing only and only mock data are seen. Creating, editing, deleting, payments and administration are unavailable.</p>
  </div>;
}
