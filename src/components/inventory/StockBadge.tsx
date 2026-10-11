export default function StockBadge({ quantity }: { quantity: number }) {
  const label = quantity === 0 ? "Out of Stock" : quantity <= 10 ? "Low Stock" : "In Stock";
  const style = quantity === 0 ? "bg-red-100 text-red-500 dark:bg-red-950 dark:text-red-300" : quantity <= 10 ? "bg-yellow-100 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-300" : "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-300";
  return <span className={`px-3 py-1 rounded-full text-xs font-bold ${style}`}>{label}</span>;
}
