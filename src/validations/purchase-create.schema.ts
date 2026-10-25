import { z } from "zod";
import { createProductSchema } from "./product.schema";
import { idSchema, transactionSchema } from "./shared";
import { productBarcodesDuplicate, productsDuplicate } from "@/lib/record-identity";

export const purchaseQuantitySchema = z.number({ error: "Enter a valid quantity." }).int("Quantity must be a whole number.").positive("Quantity must be greater than zero.").max(2147483647, "Quantity cannot exceed 2,147,483,647.");
const productId = z.string({ error: "Select a product for this line." }).refine(value => idSchema.safeParse(value).success, "Select a valid product for this line.");
const supplierId = z.string({ error: "Select a supplier before saving." }).superRefine((value, context) => {
  if (!idSchema.safeParse(value).success) context.addIssue({ code: "custom", message: value.trim() ? "Select a valid supplier." : "Select a supplier before saving." });
});
const purchaseItem = z.object({ productId: productId.optional(), newProduct: createProductSchema.optional(), quantity: purchaseQuantitySchema }).superRefine((item, context) => {
  if ((item.productId !== undefined) === (item.newProduct !== undefined)) context.addIssue({ code: "custom", path: ["productId"], message: "Choose either an existing product or create a new product for this line." });
});

export const purchaseCreateSchema = transactionSchema.omit({ items: true }).extend({
  partyId: supplierId,
  date: z.string({ error: "Choose a purchase date." }).refine(value => transactionSchema.shape.date.safeParse(value).success, "Choose a valid purchase date."),
  items: z.array(purchaseItem).min(1, "Add at least one product.").max(100, "A purchase supports up to 100 products."),
}).superRefine((data, context) => {
  const existing = new Set<string>();
  data.items.forEach((item, index) => {
    if (item.newProduct) {
      const product = item.newProduct;
      if (data.items.slice(0, index).some(other => other.newProduct && productBarcodesDuplicate(product, other.newProduct))) context.addIssue({ code: "custom", path: ["items", index, "newProduct", "supplierProductCode"], message: "Repeated barcode: combine quantities for the same product instead of creating it again." });
      if (data.items.slice(0, index).some(other => other.newProduct && productsDuplicate(product, other.newProduct))) context.addIssue({ code: "custom", path: ["items", index, "newProduct", "name"], message: "Repeated product name: use different, non-empty sizes or combine quantities for the same product." });
    } else if (item.productId) {
      if (existing.has(item.productId)) context.addIssue({ code: "custom", path: ["items", index], message: "Each product can appear only once. Combine quantities for repeated products." });
      existing.add(item.productId);
    }
  });
});

export type PurchaseCreateInput = z.infer<typeof purchaseCreateSchema>;

export const purchaseInvoiceSchema = purchaseCreateSchema.safeExtend({
  importKey: z.uuid({ error: "The invoice import session is invalid. Close this form and import the invoice again." }).transform(value => value.toLowerCase()),
});
