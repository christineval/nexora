import type { products } from "@prisma/client";
// Database model type; serialize BigInt, Decimal and Date fields at the API boundary.
export type Product = products;
