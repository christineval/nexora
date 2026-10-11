import type { ProductRow } from "@/types/views";

export type StockFilter = "all" | "in-stock" | "low-stock" | "out-of-stock";
export interface ProductFilters { query: string; status: string; stock: StockFilter }

export function filterProducts(rows: ProductRow[], { query, status, stock }: ProductFilters) {
  const search = query.trim().toLocaleLowerCase();
  return rows.filter((product) => {
    const matchesSearch = !search || [product.sku, product.name, product.size ?? ""].some((value) => value.toLocaleLowerCase().includes(search));
    const matchesStatus = !status || product.status === status;
    const matchesStock = stock === "all" || (stock === "in-stock" && product.stockQty > 10) || (stock === "low-stock" && product.stockQty > 0 && product.stockQty <= 10) || (stock === "out-of-stock" && product.stockQty === 0);
    return matchesSearch && matchesStatus && matchesStock;
  });
}

export function paginateProducts(rows: ProductRow[], requestedPage: number, pageSize = 8) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.trunc(requestedPage)));
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), page, pageCount, start: rows.length ? start + 1 : 0, end: Math.min(start + pageSize, rows.length), total: rows.length };
}
