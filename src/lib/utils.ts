export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
export const formatDateTime = (value: string) => new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
  hour: "numeric", minute: "2-digit", hour12: true,
}).format(new Date(value));
