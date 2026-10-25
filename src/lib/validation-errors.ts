import type { ZodIssue } from "zod";

const labels: Record<string, string> = { name: "Name", email: "Email", phone: "Phone", address: "Address", contactPerson: "Contact person", role: "Role", password: "Password", currentPassword: "Current password", confirmPassword: "Confirm password", size: "Size", supplierProductCode: "Supplier product code", unitCost: "Unit cost", sellingPrice: "Selling price", quantity: "Quantity", productId: "Product" };

export function validationMessages(issues: readonly ZodIssue[], lineLabel = "Invoice line"): string[] {
  return [...new Set(issues.map(issue => {
    const field = String(issue.path.at(-1) ?? "");
    const label = labels[field];
    const message = label && !issue.message.toLowerCase().includes(label.toLowerCase()) ? `${label}: ${issue.message}` : issue.message;
    const itemIndex = issue.path.indexOf("items");
    const line = itemIndex >= 0 ? issue.path[itemIndex + 1] : undefined;
    return typeof line === "number" ? `${lineLabel} ${line + 1}: ${message}` : message;
  }))];
}
