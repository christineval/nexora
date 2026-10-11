export const roles = ["ADMIN", "SALES", "INVENTORY", "FINANCE"] as const;
export type Role = typeof roles[number];
export type Module = "sales" | "customers" | "inventory" | "purchasing" | "suppliers" | "finance" | "reports" | "settings";
export const moduleRoles: Record<Module, readonly string[]> = {
  sales: ["ADMIN", "SALES"], customers: ["ADMIN", "SALES"],
  inventory: ["ADMIN", "INVENTORY", "SALES"], purchasing: ["ADMIN", "INVENTORY"],
  suppliers: ["ADMIN", "INVENTORY"], finance: ["ADMIN", "FINANCE"],
  reports: ["ADMIN", "FINANCE"], settings: ["ADMIN"],
};
export function canAccess(role: string, module: Module) { return role === "GUEST" || moduleRoles[module].includes(role); }
export function canWrite(role: string, module: Module) {
  return role !== "GUEST" && canAccess(role, module) && !(module === "inventory" && role === "SALES");
}
