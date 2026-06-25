---
name: albatool-reports-validation
description: Cross-validate that financial numbers reconcile across CustomerStatement, CustomerDebtReport, AccountStatement, TrialBalance, IncomeStatement, and BalanceSheet for the same customer/period in Albatool. Use whenever the user reports "الأرقام لا تتطابق", before publishing, or after touching triggers/transactions/invoices.
---

# Albatool Reports Validation

## Invariants that MUST hold

For a given customer **C** and date range **[from, to]** with `source <> 'pos'`:

1. **Customer balance reconciliation**
   `customers.balance(C) == Σ GREATEST(invoices.total - invoices.paid_amount, 0)` for non-cancelled, non-pos invoices.
   - Source of truth: `recompute_customer_balance(_customer_id)`.
   - If mismatch → run "إعادة حساب الأرصدة" on `CustomerDebtReportPage` (calls `recalc_all_customer_balances`).

2. **Statement vs Debt report**
   `CustomerStatement.remaining(C)  ==  CustomerDebtReport.balance row for C`.
   Both MUST exclude `source='pos'` invoices AND POS-linked payment transactions (`transactions.reference_id IN pos invoice ids`).

3. **Account statement vs Trial balance**
   For account **A** over the same period:
   `Σ income to A − Σ expense from A + transfers net == TrialBalance.closing_balance(A) − TrialBalance.opening_balance(A)`.
   Source: `recompute_account_balance(_account_id)`.

4. **Income statement basis**
   `IncomeStatement` is **cash-basis** (transactions only). Unpaid invoices are NOT revenue here. Display the "أساس نقدي" badge.

5. **Trial balance basis**
   Same — cash-basis from transactions. Unpaid POs are not liabilities here.

6. **Cash isolation**
   No POS invoice or its payments may appear in:
   - `CustomerStatementPage`
   - `CustomerDebtReportPage`
   - `PublicCustomerStatementPage`

## Validation procedure

1. Pick a customer with mixed regular + cash activity.
2. Compute via `supabase--read_query`:
   ```sql
   SELECT
     (SELECT COALESCE(SUM(GREATEST(total - paid_amount, 0)),0)
        FROM invoices WHERE customer_id = $1 AND source <> 'pos' AND status <> 'cancelled') AS expected_balance,
     (SELECT balance FROM customers WHERE id = $1) AS stored_balance;
   ```
   They must be equal.
3. Sum `CustomerStatement` UI totals; compare to query above.
4. Open `CustomerDebtReport`; find C's row; compare.
5. Repeat for one account on `TrialBalancePage` vs `AccountStatementPage`.

## Output protocol

Return a table: `Invariant | Expected | Actual | Δ | Pass/Fail`. End with the customer/account IDs you tested.

## Common breakages

- New report fetches `transactions` without excluding POS-linked `reference_id` → silent leak.
- New trigger writes to `balance` directly → bypass `recompute_*` → drift.
- Edit invoice changes `customer_id` without re-running `recompute_customer_balance` on the old customer.
- Aggregations use `total` instead of `GREATEST(total - paid_amount, 0)`.
