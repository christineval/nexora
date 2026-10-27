"use client";
import { useState } from "react";
import { ArrowRight, FilePenLine } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { getAuditChanges } from "@/lib/audit-changes";

export default function AuditChanges({ before, after, eventId }: { before: unknown; after: unknown; eventId: string }) {
  const [open, setOpen] = useState(false);
  const changes = getAuditChanges(before, after);
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={"View changes for event #" + eventId} className="inline-flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 font-medium text-violet-700 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-500 dark:text-violet-300 dark:hover:bg-violet-950/30"><FilePenLine aria-hidden="true" className="size-4" />View changes</button>
    <Modal wide open={open} title={"Changes for audit event #" + eventId} onClose={() => setOpen(false)}>
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 dark:border-neutral-700">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
          <p className="font-semibold">{before === null ? "Record created" : after === null ? "Record removed" : "Changes recorded"}</p>
          <span className="ml-auto whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700 dark:bg-violet-950 dark:text-violet-300">{changes.length} {changes.length === 1 ? "field" : "fields"}</span>
        </div>
        {changes.length ? <>
          <div aria-hidden="true" className="hidden grid-cols-3 gap-4 border-b border-slate-100 px-4 py-3 text-xs font-medium text-slate-500 sm:grid dark:border-neutral-800 dark:text-neutral-400"><span>Field</span><span>Before</span><span>After</span></div>
          <dl className="max-h-[55dvh] divide-y divide-slate-100 overflow-y-auto dark:divide-neutral-800">{changes.map(change => <div key={change.path} className="grid grid-cols-2 gap-4 p-4 text-sm sm:grid-cols-3">
            <div className="col-span-2 min-w-0 sm:col-span-1"><dt className="sr-only">Field</dt><dd className="break-words font-medium">{change.label}{change.kind !== "updated" && <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-neutral-400">{change.kind === "added" ? "Added" : "Removed"}</span>}</dd></div>
            <div className="min-w-0"><dt className="mb-1 text-xs text-slate-500 sm:sr-only dark:text-neutral-400">Before</dt><dd className="break-words text-slate-500 dark:text-neutral-400">{change.before}</dd></div>
            <div className="min-w-0"><dt className="mb-1 text-xs text-slate-500 sm:sr-only dark:text-neutral-400">After</dt><dd className="flex items-start gap-2 break-words font-medium text-violet-800 dark:text-violet-200"><ArrowRight aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-violet-500" /><span className="min-w-0 break-words">{change.after}</span></dd></div>
          </div>)}</dl>
        </> : <p className="px-4 py-5 text-sm text-slate-500 dark:text-neutral-400">No field values changed in the recorded details.</p>}
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-neutral-400">Only changed fields are shown. Contact details and credentials are excluded from audit history.</p>
    </Modal>
  </>;
}
