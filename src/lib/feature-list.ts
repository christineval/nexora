export function philippineDate(timestamp: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp)); }
export function filterFeatureRows<T>(rows: T[], { query = "", status = "", from = "", to = "" }: { query?: string; status?: string; from?: string; to?: string }, searchText: (row: T) => string, statusValue: (row: T) => string, timestamp?: (row: T) => string) {
  if (from && to && from > to) return [];
  return rows.filter(row => {
    if (query && !searchText(row).toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (status && statusValue(row) !== status) return false;
    if (timestamp && (from || to)) {
      const date = philippineDate(timestamp(row));
      if ((from && date < from) || (to && date > to)) return false;
    }
    return true;
  });
}
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  return '"' + (/^\s*[=+\-@]|^[\t\r\n]/.test(text) ? "'" : "") + text.replaceAll('"', '""') + '"';
}
