import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { loadTs } from "./load-ts.mjs";
const prisma = new PrismaClient();
const rollback = new Error("Intentional test rollback");
try {
  await prisma.$transaction(async tx => {
    const actor = await tx.users.findFirst({ where: { role: "ADMIN" }, select: { id: true, name: true, role: true } });
    assert.ok(actor, "An existing administrator is required for audit references.");
    const product = await tx.products.create({ data: { sku: "TEST-" + randomUUID(), name: "Rollback test product", selling_price: "0.10", unit_cost: "0.05", stock_qty: 10 } });
    const customer = await tx.customers.create({ data: { name: "Rollback test customer" } });
    const supplier = await tx.suppliers.create({ data: { name: "Rollback test supplier" } });
    const boundary = { orders: tx.orders, purchase_orders: tx.purchase_orders, async $transaction(operation) {
      await tx.$executeRawUnsafe("SAVEPOINT erp_workflow_test");
      try { const result = await operation(tx); await tx.$executeRawUnsafe("RELEASE SAVEPOINT erp_workflow_test"); return result; }
      catch (error) { await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT erp_workflow_test"); await tx.$executeRawUnsafe("RELEASE SAVEPOINT erp_workflow_test"); throw error; }
    } };
    const service = loadTs("src/services/transaction.service.ts", { "@/lib/prisma": { prisma: boundary } });
    const contacts = loadTs("src/services/contact.service.ts", { "@/lib/prisma": { prisma: { ...tx, $transaction: boundary.$transaction } } });
    const contactInput = { name: "Rollback contact", email: "", phone: "", address: "", status: "ACTIVE" };
    const contact = await contacts.saveContact("customers", contactInput, actor.id);
    await contacts.saveContact("customers", { ...contactInput, status: "INACTIVE" }, actor.id, contact.id);
    assert.equal((await tx.customers.findUnique({ where: { id: BigInt(contact.id) } })).status, "INACTIVE");
    const vendor = await contacts.saveContact("suppliers", { ...contactInput, contactPerson: "Test contact" }, actor.id);
    assert.equal((await tx.suppliers.findUnique({ where: { id: BigInt(vendor.id) } })).contact_person, "Test contact");
    const inventory = loadTs("src/services/inventory.service.ts", { "@/lib/prisma": { prisma: { ...tx, $transaction: boundary.$transaction } } });
    await inventory.updateProduct(product.id.toString(), { name: product.name, size: "", unitCost: "0.05", sellingPrice: "0.10", status: "ACTIVE", stockQty: 999 }, actor.id);
    assert.equal((await tx.products.findUnique({ where: { id: product.id } })).stock_qty, 10);
    const users = loadTs("src/services/user.service.ts", { "@/lib/prisma": { prisma: { ...boundary, users: tx.users } } });
    const newUser = await users.saveUser({ name: "Rollback user", email: randomUUID() + "@test.invalid", role: "SALES", password: "Temporary-test-123!" }, actor.id);
    const savedUser = await tx.users.findUnique({ where: { id: BigInt(newUser.id) } });
    assert.ok(savedUser.password_hash.startsWith("$2"));
    assert.equal(Object.hasOwn(newUser, "password_hash"), false);
    await assert.rejects(users.saveUser({ name: "Test admin", email: "admin@test.invalid", role: "SALES" }, actor.id, actor.id.toString()));
    const input = { partyId: customer.id.toString(), date: "2026-10-10", items: [{ productId: product.id.toString(), quantity: 3 }] };
    const sale = await service.createTransaction("sales", input, actor);
    const otherActor = { id: savedUser.id, name: savedUser.name, role: savedUser.role };
    assert.equal((await service.listTransactions("sales", otherActor)).some(row => row.id === sale.id), false);
    await assert.rejects(service.editTransaction("sales", sale.id, input, otherActor), error => error.status === 404);
    for (const action of ["confirm", "complete", "cancel"]) await assert.rejects(service.transitionTransaction("sales", sale.id, action, otherActor), error => error.status === 404);
    assert.equal((await tx.orders.findUnique({ where: { id: BigInt(sale.id) } })).total_amount.toFixed(2), "0.30");
    await service.editTransaction("sales", sale.id, { ...input, items: [{ productId: product.id.toString(), quantity: 2 }] }, actor);
    await service.transitionTransaction("sales", sale.id, "confirm", actor);
    await assert.rejects(service.editTransaction("sales", sale.id, input, actor));
    const orderCount = await tx.orders.count();
    const itemCount = await tx.order_items.count();
    await assert.rejects(service.createTransaction("sales", { ...input, items: [{ productId: product.id.toString(), quantity: 100 }] }, actor), /Insufficient stock/);
    assert.equal(await tx.orders.count(), orderCount);
    assert.equal(await tx.order_items.count(), itemCount);
    // This pending order fits now, but the first sale will reduce available stock.
    const failed = await service.createTransaction("sales", { ...input, items: [{ productId: product.id.toString(), quantity: 9 }] }, actor);
    await service.transitionTransaction("sales", sale.id, "complete", actor);
    assert.equal((await tx.products.findUnique({ where: { id: product.id } })).stock_qty, 8);
    const movement = await tx.inventory_movements.findFirst({ where: { reference_id: BigInt(sale.id), reference_type: "ORDER" } });
    assert.equal(movement.type, "SALE"); assert.equal(movement.quantity, 2);
    const entries = await tx.ledger_entries.findMany({ where: { reference_id: BigInt(sale.id), reference_type: "ORDER" } });
    assert.equal(entries.length, 2); assert.ok(entries[0].amount.equals(entries[1].amount));
    await assert.rejects(service.transitionTransaction("sales", sale.id, "complete", actor));
    await service.transitionTransaction("sales", failed.id, "confirm", actor);
    await assert.rejects(service.transitionTransaction("sales", failed.id, "complete", actor));
    assert.equal((await tx.orders.findUnique({ where: { id: BigInt(failed.id) } })).status, "CONFIRMED");
    assert.equal(await tx.inventory_movements.count({ where: { reference_id: BigInt(failed.id), reference_type: "ORDER" } }), 0);
    assert.equal(await tx.ledger_entries.count({ where: { reference_id: BigInt(failed.id), reference_type: "ORDER" } }), 0);
    const purchase = await service.createTransaction("purchasing", { ...input, partyId: supplier.id.toString() }, actor);
    await service.transitionTransaction("purchasing", purchase.id, "confirm", actor);
    await service.transitionTransaction("purchasing", purchase.id, "complete", actor);
    assert.equal((await tx.products.findUnique({ where: { id: product.id } })).stock_qty, 11);
    await assert.rejects(service.transitionTransaction("purchasing", purchase.id, "complete", actor));
    const adjust = loadTs("src/services/adjustment.service.ts", { "@/lib/prisma": { prisma: boundary } });
    await adjust.adjustStock({ productId: product.id.toString(), type: "ADJUSTMENT_OUT", quantity: 1 }, actor.id);
    await assert.rejects(adjust.adjustStock({ productId: product.id.toString(), type: "ADJUSTMENT_OUT", quantity: 100 }, actor.id));
    assert.equal((await tx.products.findUnique({ where: { id: product.id } })).stock_qty, 10);
    const audit = await tx.audit_logs.findMany({ where: { actor_id: actor.id, entity_type: "ORDER", entity_id: BigInt(sale.id) }, orderBy: { id: "asc" } });
    assert.deepEqual(audit.map(row => row.action), ["ORDER_CREATED", "ORDER_UPDATED", "ORDER_CONFIRMED", "ORDER_COMPLETED"]);
    assert.equal(audit[0].actor_role, "ADMIN");
    assert.equal(audit[1].before.total_amount, "0.3");
    assert.equal(audit[1].after.total_amount, "0.2");
    assert.equal(await tx.audit_logs.count({ where: { entity_type: "ORDER", entity_id: BigInt(failed.id), action: "ORDER_COMPLETED" } }), 0);
    for (const statement of ["UPDATE audit_logs SET action = action WHERE false", "DELETE FROM audit_logs WHERE false"]) {
      await tx.$executeRawUnsafe("SAVEPOINT audit_immutability_test");
      await assert.rejects(tx.$executeRawUnsafe(statement), /Audit logs are append-only/);
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT audit_immutability_test");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT audit_immutability_test");
    }
    console.log("Database checks passed: contacts, supplier contacts, product edits, password hashing, decimal pricing, pending edit, sales completion, receiving, adjustment, duplicate prevention, insufficient-stock rollback, audit event snapshots, and append-only audit protection.");
    throw rollback;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
} catch (error) {
  if (error !== rollback) throw error;
  console.log("All temporary test records were rolled back; existing business records were not modified.");
} finally { await prisma.$disconnect(); }
