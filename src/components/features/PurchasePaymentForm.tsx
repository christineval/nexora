"use client";
import { useRef, useState } from "react";
import FormLabel from "@/components/ui/FormLabel";
import { useGuestPreview } from "@/components/ui/GuestPreviewProvider";
import { useNotifications } from "@/components/ui/SnackbarProvider";
import { control, primaryButton } from "@/components/ui/feature-styles";
import { numericInputProps } from "@/lib/numeric-input";
import { philippineDate } from "@/lib/feature-list";
import { formatCurrency } from "@/lib/utils";
import { fromMinorUnits, sumMoney, toMinorUnits } from "@/lib/money";
import { purchasePaymentSchema } from "@/validations/purchase-payment.schema";
import type { TransactionRow } from "@/types/features";

export default function PurchasePaymentForm({ row, canEdit, saving, onSave }: { row: TransactionRow; canEdit: boolean; saving: boolean; onSave: (data: { paymentKey: string; amount: string; date: string; reference: string }) => void }) {
  const guest = useGuestPreview();
  const { notify } = useNotifications();
  const key = useRef<string | null>(null);
  const paid = sumMoney((row.payments ?? []).map(payment => payment.amount));
  const balance = fromMinorUnits(toMinorUnits(row.total) - toMinorUnits(paid));
  const [amount, setAmount] = useState(balance);
  const [date, setDate] = useState(philippineDate(new Date().toISOString()));
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  return <form className="mt-5 space-y-4 rounded-lg border border-slate-200 p-4 dark:border-neutral-700" onSubmit={event => {
    event.preventDefault();
    if (guest || !canEdit || !confirmed) return;
    key.current ??= crypto.randomUUID();
    const result = purchasePaymentSchema.safeParse({ paymentKey: key.current, amount, date, reference });
    if (!result.success) { notify(result.error.issues[0].message, "error"); return; }
    if (toMinorUnits(amount) > toMinorUnits(balance)) { notify("Payment exceeds the outstanding balance.", "error"); return; }
    onSave(result.data);
  }}>
    <h3 className="font-semibold">Record cash payment</h3>
    <p className="text-sm text-slate-500 dark:text-neutral-400">Outstanding: {formatCurrency(Number(balance))}. Record money already paid to the supplier. This reduces Accounts Payable and Cash; stock stays unchanged.</p>
    <fieldset disabled={saving} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormLabel label="Payment amount (PHP)" required><input {...numericInputProps(true)} className={control} type="text" required inputMode="decimal" pattern="[0-9]{1,10}([.][0-9]{1,2})?" value={amount} onChange={event => { setAmount(event.target.value); key.current = null; setConfirmed(false); }} /></FormLabel>
        <FormLabel label="Payment date" required><input className={control} type="date" required min={philippineDate(row.timestamp)} max={philippineDate(new Date().toISOString())} value={date} onChange={event => { setDate(event.target.value); key.current = null; setConfirmed(false); }} /></FormLabel>
      </div>
      <FormLabel label="Payment reference (optional)"><input className={control} maxLength={150} value={reference} onChange={event => { setReference(event.target.value); key.current = null; setConfirmed(false); }} placeholder="Cash voucher or receipt number" /></FormLabel>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm this cash payment has been made. Saved payments cannot be edited or deleted.</label>
      <button type="submit" className={primaryButton} disabled={guest || !canEdit || saving || !confirmed || toMinorUnits(balance) <= 0n}>{saving ? "Recording payment..." : "Record cash payment"}</button>
    </fieldset>
  </form>;
}
