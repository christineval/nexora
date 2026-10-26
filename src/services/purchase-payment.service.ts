import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth";
import { BusinessError } from "@/lib/errors";
import { philippineDate } from "@/lib/feature-list";
import { orderAccessWhere } from "@/server/order-access";
import { postLedgerEntries } from "@/server/ledger-posting";
import { recordAudit } from "@/server/audit";
import { idSchema } from "@/validations/shared";
import { purchasePaymentSchema } from "@/validations/purchase-payment.schema";

export async function recordPurchasePayment(recordId: string, input: unknown, user: CurrentUser) {
  const scope = orderAccessWhere(user, "purchasing", true);
  const id = BigInt(idSchema.parse(recordId));
  const data = purchasePaymentSchema.parse(input);
  const amount = new Prisma.Decimal(data.amount);
  return prisma.$transaction(async tx => {
    const order = await tx.purchase_orders.findUnique({ where: { id, ...scope }, include: { purchase_payments: true } });
    if (!order) throw new BusinessError("Purchase order not found.", 404);
    const previous = await tx.purchase_payments.findUnique({ where: { created_by_payment_key: { created_by: user.id, payment_key: data.paymentKey } } });
    if (previous) {
      if (previous.purchase_order_id !== id || !previous.amount.equals(amount) || previous.payment_date.toISOString().slice(0, 10) !== data.date || (previous.reference ?? "") !== data.reference) throw new BusinessError("This payment request was already used. Review payment history before recording another payment.");
      return { id: previous.id.toString() };
    }
    if (order.status !== "RECEIVED") throw new BusinessError("Receive the purchase before recording payment.");
    if (data.date < philippineDate(order.purchase_date.toISOString())) throw new BusinessError("Payment date cannot be before the purchase date.", 400);
    const paid = order.purchase_payments.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
    const balance = order.total_amount.sub(paid);
    if (amount.gt(balance)) throw new BusinessError(`Payment exceeds the outstanding balance of PHP ${balance.toFixed(2)}.`);
    // Serialize every payment against the scoped order header to prevent overpayment.
    const guard = await tx.purchase_orders.updateMany({ where: { id, ...scope, status: "RECEIVED" }, data: { updated_at: new Date() } });
    if (guard.count !== 1) throw new BusinessError("The purchase changed. Refresh and review its balance.");
    const payment = await tx.purchase_payments.create({ data: { purchase_order_id: id, created_by: user.id, payment_key: data.paymentKey, amount, payment_date: new Date(data.date + "T00:00:00Z"), reference: data.reference || null } });
    await postLedgerEntries(tx, ["Accounts Payable", "Cash"].map((account, index) => ({
      account_name: account, entry_type: index === 0 ? "DEBIT" : "CREDIT", amount,
      transaction_date: new Date(data.date + "T00:00:00+08:00"),
      reference_type: "PURCHASE_PAYMENT", reference_id: payment.id,
      description: `Cash payment for purchase #${id}`, created_by: user.id,
    })));
    await recordAudit(tx, user, { action: "PURCHASE_PAYMENT_RECORDED", entity: "PURCHASE_ORDER", entityId: id, after: { id: payment.id, amount, payment_date: payment.payment_date, reference_type: "PURCHASE_PAYMENT", reference_id: payment.id, balance: balance.sub(amount) } });
    return { id: payment.id.toString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
