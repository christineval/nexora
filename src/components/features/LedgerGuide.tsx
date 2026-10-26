export default function LedgerGuide() {
  return <div className="mt-5 space-y-6 text-sm leading-relaxed">
    <p>The ledger is the financial history of your business. Each event creates matching debit and credit entries. Nexora currently supports cash sales and cash payments to suppliers.</p>
    <section className="space-y-2"><h3 className="font-semibold">1. Complete a cash sale</h3>
      <p>Create a sales order (Pending), choose Confirm order (Confirmed), then choose Complete sale after collecting the full payment (Completed).</p>
      <p>For a ₱150 sale of an item costing ₱100, the ledger records:</p>
      <ul className="list-disc space-y-1 pl-5"><li>Debit Cash ₱150: money received.</li><li>Credit Sales Revenue ₱150: income earned from the sale.</li><li>Debit Cost of Goods Sold ₱100: the cost of the item sold.</li><li>Credit Inventory ₱100: the item leaves your stock value.</li></ul>
      <p>Gross profit is ₱50 (₱150 revenue − ₱100 cost), before other expenses. Stock quantities decrease at completion. A zero-cost item produces no cost entry.</p>
    </section>
    <section className="space-y-2"><h3 className="font-semibold">2. Receive a purchase</h3>
      <p>Create a purchase (Pending), enter the actual supplier unit costs, mark it Ordered, and receive it when the goods arrive (Received). Invoice imports save goods already received directly as Received.</p>
      <p>For a ₱1,000 delivery: debit Inventory ₱1,000 and credit Accounts Payable ₱1,000. Stock and its value increase. Accounts Payable means money owed to suppliers. Receiving goods does not record payment.</p>
    </section>
    <section className="space-y-2"><h3 className="font-semibold">3. Record a supplier payment</h3>
      <p>In Purchase Orders, open the received order’s actions menu and record the cash amount actually paid, payment date and optional receipt or voucher reference. Confirm the payment before saving.</p>
      <p>A ₱400 payment against a ₱1,000 purchase debits Accounts Payable ₱400 and credits Cash ₱400. The remaining balance is ₱600. Record later payments until the balance is zero. Payments do not add stock again or create another purchase expense.</p>
      <p>Payment records are permanent. Check the purchase’s payment history before entering another payment, especially after a connection error. Pending and cancelled purchases cannot be paid here.</p>
    </section>
    <section className="space-y-2"><h3 className="font-semibold">How moving weighted average works</h3>
      <p>The same product keeps one SKU even when its purchase price changes. Each purchase line retains its own unit cost.</p>
      <p>If you hold 10 units worth ₱1,000 and receive 10 more worth ₱1,200, you now hold 20 units worth ₱2,200: an average of ₱110 each. Selling 5 units removes ₱550 of inventory value.</p>
      <p>The average changes when stock is received. Saved purchase costs and completed sale costs stay in history. Selling prices are controlled separately. Inventory value retains cent-level totals so rounding the displayed average does not lose value.</p>
    </section>
    <section className="space-y-2"><h3 className="font-semibold">Debits, credits and balances</h3>
      <p>Debit and credit describe two sides of an entry. They do not always mean money in and money out.</p>
      <ul className="list-disc space-y-1 pl-5"><li>Cash and Inventory increase with debits and decrease with credits.</li><li>Accounts Payable increases with credits and decreases with debits.</li><li>Sales Revenue increases with credits; Cost of Goods Sold increases with debits.</li></ul>
      <p>Across a complete set of entries, total debits equal total credits. A zero difference means those entries balance; it does not mean zero profit or zero cash. Date, account, type and search filters may show only one side of an entry.</p>
      <p>Use Reference and entry details to identify the source order or payment. Cash balance requires opening cash and all cash transactions; this ledger does not yet track every business expense or bank account.</p>
    </section>
    <section className="space-y-2 rounded-lg bg-amber-50 p-4 dark:bg-amber-950/30"><h3 className="font-semibold">Existing records and corrections</h3>
      <p>These rules apply to new transactions after the accounting update. Earlier sales do not gain historical cost entries, and earlier purchases are not automatically marked paid. Review old records before using outstanding balances for decisions.</p>
      <p>Opening inventory is valued using the stored cost at the update date and needs review. Opening balances and stock adjustments need separate accounting reconciliation. Returns, payment reversals, tax calculation and accounting period closing are not available. Do not enter a second payment to correct a mistake; ask an administrator to review it.</p>
    </section>
  </div>;
}
