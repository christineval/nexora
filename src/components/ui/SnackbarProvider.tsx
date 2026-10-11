"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from "lucide-react";

type Severity = "success" | "error" | "warning" | "info";
type Notification = { id: number; message: string; severity: Severity };
type Notifications = {
  notify: (message: string, severity?: Severity) => void;
  dismiss: () => void;
  dismissError: () => void;
};

const NotificationContext = createContext<Notifications | null>(null);
const variants = {
  success: { label: "Success", icon: CheckCircle2, color: "bg-emerald-700" },
  error: { label: "Error", icon: CircleAlert, color: "bg-red-700" },
  warning: { label: "Warning", icon: TriangleAlert, color: "bg-amber-700" },
  info: { label: "Information", icon: Info, color: "bg-blue-700" },
};

export function SnackbarMessage({ notification, onDismiss }: { notification: Notification; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const { label, icon: Icon, color } = variants[notification.severity];

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [paused, onDismiss]);

  return <div
    data-severity={notification.severity}
    onMouseEnter={() => setPaused(true)}
    onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}
    className={"flex items-start gap-3 rounded-xl p-4 text-white shadow-xl " + color}
  >
    <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
    <div role={notification.severity === "error" || notification.severity === "warning" ? "alert" : "status"} aria-atomic="true" className="min-w-0 flex-1 text-sm">
      <p className="font-semibold">{label}</p>
      <p className="mt-1 break-words leading-5">{notification.message}</p>
    </div>
    <button type="button" aria-label="Dismiss notification" onClick={onDismiss} className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
      <X aria-hidden="true" className="size-4" />
    </button>
  </div>;
}

export default function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [notification, setNotification] = useState<Notification | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const sequence = useRef(0);
  const viewport = useRef<HTMLDivElement>(null);
  const notify = useCallback((message: string, severity: Severity = "success") => {
    setNotification({ id: ++sequence.current, message, severity });
  }, []);
  const dismiss = useCallback(() => setNotification(null), []);
  const dismissError = useCallback(() => setNotification(current => current?.severity === "error" ? null : current), []);

  useEffect(() => {
    // Keep notifications interactive inside a modal and move them back when it closes.
    const updateTarget = () => {
      const dialogs = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
      setTarget(dialogs.item(dialogs.length - 1) ?? document.body);
    };
    updateTarget();
    const observer = new MutationObserver(updateTarget);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Native popovers sit above dialog backdrops without taking keyboard focus.
    const element = viewport.current;
    if (notification && element?.isConnected && !element.matches(":popover-open")) element.showPopover();
  }, [notification, target]);

  return <NotificationContext.Provider value={{ notify, dismiss, dismissError }}>
    {children}
    {target && notification && createPortal(
      <div ref={viewport} popover="manual" className="snackbar-viewport">
        <SnackbarMessage key={notification.id} notification={notification} onDismiss={dismiss} />
      </div>, target,
    )}
  </NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("Notifications require SnackbarProvider.");
  return context;
}
