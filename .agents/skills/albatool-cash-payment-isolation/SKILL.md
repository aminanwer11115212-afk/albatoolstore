---
name: albatool-cash-payment-isolation
description: Enforce strict isolation between POS/cash invoices (source='pos') and regular invoices in Albatool — lists, reports, statements, payment transactions, and dispatch badges. Use whenever you add a report, statement, share link, or any query that touches invoices/transactions for a customer.
---

# Cash (POS) Isolation Contract

POS sales must NEVER bleed into the regular customer credit cycle. Customers in cash mode are anonymous/walk-in; their debts and payments are owned by the cash drawer, not their customer card.

## The four exclusion points

1. **Invoices queries** scoped to a customer for regular reporting MUST add:
   ```ts
   .neq("source", "pos")
   ```
   Pages: `CustomerStatementPage`, `CustomerDebtReportPage`, `PublicCustomerStatementPage`, `InvoicesPage` (default — no `posOnly`), `TodayInvoicesPage` (regular tab), exports.

2. **Cash invoices list** at `/invoices/cash/list` MUST add:
   ```ts
   .eq("source", "pos")
   ```
   and use the amber theme (`invoices-cash-theme`). Regular list uses blue (`invoices-regular-theme`).

3. **Transactions linked to POS invoices** must be excluded from regular customer statements. `transactions.reference_id` stores the invoice UUID. Pattern:
   ```ts
   const { data: posInvs } = await supabase
     .from("invoices").select("id")
     .eq("customer_id", custId).eq("source", "pos");
   const posIds = new Set((posInvs || []).map(r => r.id));
   // ...fetch transactions, then:
   return (data || []).filter(t => !t.reference_id || !posIds.has(t.reference_id));
   ```
   Applied in `CustomerStatementPage.tsx` (June 2026). Re-apply in any new statement.

4. **Dispatch visual** — `ReadyToShipPanel` MUST show amber background + `POS` badge for `source='pos'` rows, and link to `/invoices/cash/edit/:id` not `/invoices/view/:id`.

## Verification recipe (per new report/view)

- [ ] No row with `source='pos'` appears.
- [ ] No transaction whose `reference_id` matches a POS invoice ID appears.
- [ ] Totals match: regular-only `Σ remaining` == `customers.balance` (which is computed by `recompute_customer_balance` from non-cancelled invoices only — but the cash bleed was via transactions, not balance).
- [ ] Stock tracking POS rows show the amber `كاش` badge and the correct edit URL.

## Anti-patterns

- ❌ Fetching `transactions` for a customer without excluding POS-linked refs.
- ❌ A "unified" invoices list mode that mixes both without the `posOnly` boolean.
- ❌ Linking POS invoices to a real customer card and showing the debt in their statement.
- ❌ Adding a new doc type to share-tokens without also handling its POS variant for cash flows.
