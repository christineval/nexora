export function toMinorUnits(amount: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new Error("Invalid monetary amount");
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function fromMinorUnits(amount: bigint): string {
  const absolute = amount < 0n ? -amount : amount;
  return (amount < 0n ? "-" : "") + (absolute / 100n).toString() + "." + (absolute % 100n).toString().padStart(2, "0");
}
export function sumMoney(amounts: string[]): string { return fromMinorUnits(amounts.reduce((sum, amount) => sum + toMinorUnits(amount), 0n)); }

export function suggestSellingPrice(unitCost: string, markupPercent: number): string | null {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(unitCost) || !Number.isInteger(markupPercent) || markupPercent < 0 || markupPercent > 100) return null;
  // Round half up to the nearest cent using integer monetary values.
  const suggested = (toMinorUnits(unitCost) * BigInt(100 + markupPercent) + 50n) / 100n;
  return suggested <= 999999999999n ? fromMinorUnits(suggested) : null;
}
