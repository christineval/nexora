import { writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { PrismaClient, Prisma } from "@prisma/client";

nextEnv.loadEnvConfig(process.cwd());

const sourceUrl = process.env.GUEST_DATABASE_URL;
if (!sourceUrl) throw new Error("Set GUEST_DATABASE_URL locally before exporting the guest snapshot. DATABASE_URL is never used as a fallback.");
try {
  const connection = new URL(sourceUrl);
  if (!["postgres:", "postgresql:"].includes(connection.protocol) || decodeURIComponent(connection.pathname.slice(1)) !== "erp_lite") throw new Error();
} catch { throw new Error("GUEST_DATABASE_URL must be a valid PostgreSQL URL for the approved erp_lite demo database."); }
const db = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const destination = fileURLToPath(new URL("../src/server/demo/guest-snapshot.json", import.meta.url));

try {
  const snapshot = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const identity = await tx.$queryRaw`SELECT current_database() AS name`;
    if (identity[0]?.name !== "erp_lite") throw new Error("Connected database is not erp_lite. Export stopped.");
    const columns = await tx.$queryRaw`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('products', 'purchase_payments')`;
    const hasColumn = (table, column) => columns.some(row => row.table_name === table && row.column_name === column);
    const hasPayments = columns.some(row => row.table_name === "purchase_payments");
    const hasValuation = hasColumn("products", "inventory_value");
    // Explicit selections exclude password hashes, sessions, secrets and audit data.
    const products = await tx.products.findMany({ select: { id: true, sku: true, name: true, size: true, stock_qty: true, unit_cost: true, selling_price: true, status: true, supplier_product_code: hasColumn("products", "supplier_product_code"), inventory_value: hasValuation }, orderBy: [{ name: "asc" }, { id: "asc" }] });
    const customers = await tx.customers.findMany({ select: { id: true, name: true, email: true, phone: true, address: true, status: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
    const suppliers = await tx.suppliers.findMany({ select: { id: true, name: true, email: true, phone: true, address: true, status: true, contact_person: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
    const sales = await tx.orders.findMany({ select: { id: true, customer_id: true, order_date: true, status: true, total_amount: true, users: { select: { name: true } }, customers: { select: { name: true } }, order_items: { orderBy: { id: "asc" }, select: { id: true, product_id: true, quantity: true, unit_price: true, line_total: true, products: { select: { name: true, sku: true } } } } }, orderBy: [{ order_date: "desc" }, { id: "desc" }] });
    const purchases = await tx.purchase_orders.findMany({ select: { id: true, supplier_id: true, purchase_date: true, status: true, total_amount: true, users: { select: { name: true } }, suppliers: { select: { name: true } }, purchase_items: { orderBy: { id: "asc" }, select: { id: true, product_id: true, quantity: true, unit_price: true, line_total: true, products: { select: { name: true, sku: true } } } } }, orderBy: [{ purchase_date: "desc" }, { id: "desc" }] });
    const payments = hasPayments ? await tx.purchase_payments.findMany({ select: { id: true, purchase_order_id: true, amount: true, payment_date: true, reference: true }, orderBy: [{ payment_date: "asc" }, { id: "asc" }] }) : [];
    const movements = await tx.inventory_movements.findMany({ select: { id: true, created_at: true, product_id: true, type: true, quantity: true, reference_type: true, reference_id: true, users: { select: { name: true } }, products: { select: { name: true, sku: true } } }, orderBy: [{ created_at: "desc" }, { id: "desc" }] });
    const ledger = await tx.ledger_entries.findMany({ select: { id: true, transaction_date: true, account_name: true, entry_type: true, amount: true, reference_type: true, reference_id: true, description: true, users: { select: { name: true } } }, orderBy: [{ transaction_date: "desc" }, { id: "desc" }] });
    const contact = row => ({ id: row.id.toString(), name: row.name, email: row.email, phone: row.phone, address: row.address, status: row.status });
    const item = row => ({ id: row.id.toString(), productId: row.product_id.toString(), name: row.products.name, sku: row.products.sku, quantity: row.quantity, unitPrice: row.unit_price.toFixed(2), lineTotal: row.line_total.toFixed(2) });
    return {
      version: 2, source: "erp_lite", capturedAt: new Date().toISOString(), capabilities: { purchasePayments: hasPayments, inventoryValuation: hasValuation },
      data: {
        products: products.map(row => ({ productId: row.id.toString(), sku: row.sku, name: row.name, size: row.size, stockQty: row.stock_qty, unitCost: row.unit_cost.toNumber(), sellingPrice: row.selling_price.toNumber(), status: row.status, ...(row.supplier_product_code !== undefined ? { supplierProductCode: row.supplier_product_code } : {}), ...(hasValuation ? { inventoryValue: row.inventory_value.toFixed(2) } : {}) })),
        customers: customers.map(contact), suppliers: suppliers.map(row => ({ ...contact(row), contactPerson: row.contact_person })),
        sales: sales.map(row => ({ id: row.id.toString(), party: row.customers.name, partyId: row.customer_id.toString(), timestamp: row.order_date.toISOString(), status: row.status, total: row.total_amount.toFixed(2), createdBy: row.users.name, items: row.order_items.map(item) })),
        purchases: purchases.map(row => ({ id: row.id.toString(), party: row.suppliers.name, partyId: row.supplier_id.toString(), timestamp: row.purchase_date.toISOString(), status: row.status, total: row.total_amount.toFixed(2), createdBy: row.users.name, items: row.purchase_items.map(item), ...(hasPayments ? { payments: payments.filter(payment => payment.purchase_order_id === row.id).map(payment => ({ id: payment.id.toString(), amount: payment.amount.toFixed(2), date: payment.payment_date.toISOString().slice(0, 10), reference: payment.reference })) } : {}) })),
        movements: movements.map(row => ({ id: row.id.toString(), timestamp: row.created_at.toISOString(), productId: row.product_id.toString(), productName: row.products.name, productSku: row.products.sku, type: row.type, quantity: row.quantity, referenceType: row.reference_type, referenceId: row.reference_id?.toString() ?? null, createdBy: row.users.name })),
        ledger: ledger.map(row => ({ id: row.id.toString(), timestamp: row.transaction_date.toISOString(), account: row.account_name, type: row.entry_type, amount: row.amount.toFixed(2), reference: row.reference_id ? `${row.reference_type ?? "Reference"} #${row.reference_id}` : row.reference_type ?? "—", description: row.description, createdBy: row.users.name })),
      },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
  const text = JSON.stringify(snapshot, null, 2) + "\n";
  if (/"(?:password_hash|password|token_hash|session_secret|database_url)"\s*:/i.test(text)) throw new Error("Forbidden credential field found. Export stopped.");
  await writeFile(destination + ".tmp", text, { encoding: "utf8" });
  await rename(destination + ".tmp", destination);
  console.log("Guest snapshot exported from erp_lite in a read-only transaction.");
  console.log(JSON.stringify(Object.fromEntries(Object.entries(snapshot.data).map(([name, rows]) => [name, rows.length]))));
  console.log("Rebuild and redeploy Nexora to publish these demo records. No database connection is needed to serve this snapshot.");
} catch (error) {
  console.error("Guest snapshot export failed:", error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof Prisma.PrismaClientInitializationError ? "Check the local connection and credentials." : error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[connection hidden]") : "Unknown error");
  process.exitCode = 1;
} finally { await db.$disconnect(); }
