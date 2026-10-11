import type { InventoryMovementRow } from "@/types/views";

export interface MovementFilters {
  query: string;
  type: string;
  productId: string;
  from: string;
  to: string;
}

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
});
const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric",
});

export function movementDateKey(timestamp: string) {
  const parts = dateKeyFormatter.formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatMovementDate(timestamp: string) {
  return dateFormatter.format(new Date(timestamp));
}

export function movementReference(row: InventoryMovementRow) {
  return [row.referenceType, row.referenceId === null ? null : `#${row.referenceId}`].filter(Boolean).join(" ") || "—";
}

export function filterInventoryMovements(rows: InventoryMovementRow[], filters: MovementFilters) {
  if (filters.from && filters.to && filters.from > filters.to) return [];
  const search = filters.query.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    const date = movementDateKey(row.timestamp);
    return (!filters.type || row.type === filters.type)
      && (!filters.productId || row.productId === filters.productId)
      && (!filters.from || date >= filters.from)
      && (!filters.to || date <= filters.to)
      && (!search || [row.productName, row.productSku, row.type, movementReference(row), row.createdBy]
        .some((value) => value.toLocaleLowerCase().includes(search)));
  });
}

export function paginateInventoryMovements(rows: InventoryMovementRow[], requestedPage: number, pageSize = 8) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.max(1, Math.min(pageCount, Math.trunc(requestedPage)));
  const offset = (page - 1) * pageSize;
  return {
    rows: rows.slice(offset, offset + pageSize), page, pageCount,
    start: rows.length ? offset + 1 : 0, end: Math.min(offset + pageSize, rows.length), total: rows.length,
  };
}
