import { BusinessError } from "./errors";
export type TransactionKind = "sales" | "purchasing";
export function nextStatus(kind: TransactionKind, current: string, action: string): string {
  const middle = kind === "sales" ? "CONFIRMED" : "ORDERED";
  const final = kind === "sales" ? "COMPLETED" : "RECEIVED";
  if (action === "confirm" && current === "PENDING") return middle;
  if (action === "complete" && current === middle) return final;
  if (action === "cancel" && ["PENDING", middle].includes(current)) return "CANCELLED";
  throw new BusinessError("This transaction cannot be changed from its current status.");
}
