"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "./SnackbarProvider";
export default function useMutation() {
  const router = useRouter();
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  const { notify, dismiss, dismissError } = useNotifications();
  async function submit(url: string, method: string, data: unknown, onSuccess?: (result: { id?: string }) => void) {
    if (lock.current) return;
    lock.current = true; setSaving(true); dismiss();
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Unable to save. Please try again.");
      onSuccess?.(result); router.refresh();
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to save. Please try again.", "error"); }
    finally { lock.current = false; setSaving(false); }
  }
  return { saving, submit, clearError: dismissError };
}
