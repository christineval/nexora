import { Prisma } from "@prisma/client";
import { BusinessError } from "@/lib/errors";

type CostStock = { stock_qty: number; unit_cost: Prisma.Decimal; inventory_value: Prisma.Decimal };
const CostDecimal = Prisma.Decimal.clone({ precision: 40 });

// Keep the total value, rather than a rounded per-unit average, authoritative.
export function inventoryCostChange(product: CostStock, quantity: number, direction: "in" | "out", receiptCost?: Prisma.Decimal) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new BusinessError("Enter a positive whole quantity.", 400);
  const stock = product.stock_qty;
  const value = new CostDecimal(product.inventory_value.toString());
  if (stock < 0 || value.lt(0) || (stock === 0 && !value.isZero())) throw new BusinessError("Inventory valuation needs review before this product can be processed.");
  if (direction === "out" && quantity > stock) throw new BusinessError("Insufficient stock.");
  const amount = direction === "in"
    ? new CostDecimal((receiptCost ?? (stock ? value.div(stock) : product.unit_cost)).toString()).mul(quantity).toDecimalPlaces(2)
    : quantity === stock ? value : value.mul(quantity).div(stock).toDecimalPlaces(2);
  const nextStock = stock + (direction === "in" ? quantity : -quantity);
  if (nextStock > 2147483647) throw new BusinessError("The stock quantity exceeds 2,147,483,647.");
  const nextValue = direction === "in" ? value.add(amount) : value.sub(amount);
  const averageCost = nextStock ? nextValue.div(nextStock).toDecimalPlaces(2) : product.unit_cost;
  return { amount, stock: nextStock, value: nextValue, averageCost };
}
