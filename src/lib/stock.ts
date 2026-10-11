export function stockDelta(type: string, quantity: number): number {
  return (type === "SALE" || type === "ADJUSTMENT_OUT" ? -1 : 1) * Math.abs(quantity);
}
