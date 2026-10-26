export const roles = ["ADMIN", "SALES", "INVENTORY", "FINANCE"] as const;
export type Role = typeof roles[number];
export type Module = "sales" | "customers" | "inventory" | "purchasing" | "suppliers" | "finance" | "reports" | "settings" | "audit";
export const moduleRoles: Record<Module, readonly string[]> = {
  sales: ["ADMIN", "SALES"], customers: ["ADMIN", "SALES"],
  inventory: ["ADMIN", "INVENTORY", "SALES"], purchasing: ["ADMIN", "INVENTORY"],
  suppliers: ["ADMIN", "INVENTORY"], finance: ["ADMIN", "FINANCE"],
  reports: ["ADMIN", "FINANCE"], settings: ["ADMIN"], audit: ["ADMIN"],
};
const guestModules = new Set<Module>(["sales", "customers", "inventory", "purchasing", "suppliers", "finance", "reports"]);
export function canAccess(role: string, module: Module) {
  if (role === "GUEST") return guestModules.has(module);
  return Object.prototype.hasOwnProperty.call(moduleRoles, module) && moduleRoles[module].includes(role);
}
export function canWrite(role: string, module: Module) {
  return role !== "GUEST" && canAccess(role, module) && !(module === "inventory" && role === "SALES");
}
