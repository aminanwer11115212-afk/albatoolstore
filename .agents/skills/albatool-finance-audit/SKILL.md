---
name: albatool-finance-audit
description: Audit & verification recipe for Albatool finance pages — Accounts, Transactions (income/expense/transfer/bank deposit), Account Statement, Trial Balance, Income Statement, Bank Transfers report, Filtered Transactions. Use for any change, fix, or "تأكد من صفحات المالية" / "فحص الإيرادات والمصروفات" request.
---

# Albatool Finance Audit — مهارة فحص الصفحات المالية

The finance layer in Albatool is fully driven by **two** Postgres triggers + RPCs (no manual balance writes anywhere). Any audit, change, or new report MUST respect them.

## The truth source (DB)

| concept | function/trigger | rule |
|---|---|---|
| Account balance | `recompute_account_balance(_account_id)` via `trg_tx_recompute_account_balance` | `Σ(income to A) − Σ(expense from A) + Σ(transfer in − out)`; runs on insert/update/delete of `transactions` |
| Customer balance | `recompute_customer_balance` | non-cancelled invoices only; POS-bleed excluded by callers, NOT by DB |
| Supplier balance | `recompute_supplier_balance` | non-cancelled `purchase_orders` only |
| Cash-basis reports | `IncomeStatement`, `TrialBalance` | computed from `transactions` only, never from invoices |

**Never write to `accounts.balance`, `customers.balance`, `suppliers.balance` from the app.** Always insert/update/delete in `transactions` (or `invoices`/`purchase_orders`) and let the trigger recompute.

## The 6 finance pages (scope of this skill)

1. **`/accounts`** — list + Sheet/inline form for new bank/cash/wallet account. Default account flag (`is_default`) is non-deletable.
2. **`/transactions`** — income/expense with method=cash|bank|card|mobile. For `method='bank'` the account picker filters to `account_type='bank'` AND `isAllowedBank()` AND the chosen `bank_name`.
3. **`/transactions/transfer`** — between two accounts. MUST use `type='transfer'` + both `account_id` (from) AND `to_account_id` (to). The trigger handles both sides.
4. **`/reports/account-statement`** — per-account ledger; uses `recompute_account_balance` invariant.
5. **`/reports/trial-balance`** — opening + period movement + closing per account; cash-basis (transactions only).
6. **`/reports/income-statement`** — total income − expense per period; cash-basis. Display "أساس نقدي" badge.

Plus: `/reports/bank-transfers`, `/transactions/income`, `/transactions/expenses` (FilteredTransactionsPage), `/reports/expense-statement`, `/reports/financial-preview`.

## Hard rules (every PR touching finance)

1. **Saving guard**: every insert/update mutation uses `savingRef` + `setSaving(true)` + try/finally + `disabled={saving}` to prevent double-submit. Bank transfers especially.
2. **Transfer sanity**: `from != to`; amount > 0; `from.balance >= amount` (read fresh — accept stale ±1s); record with `type='transfer'`, `account_id=from`, `to_account_id=to`. Don't fake debit/credit on a single side — let `recompute_account_balance` handle it.
3. **Bank-method validation**: when `method='bank'` use `validateBankTransferPayment` from `@/lib/bankTransferValidation` BEFORE insert; reference_no is encouraged but optional (already optional today).
4. **Default account guard**: `accounts.is_default = true` rows must NOT be deletable from UI.
5. **Token-only colors**: never `bg-blue-500`, `text-green-600` — always `bg-primary`, `text-foreground`, semantic tokens.
6. **RTL/Arabic**: every label/toast/empty-state in Arabic; container `dir="rtl"` (inherited).
7. **Cash isolation** (per `albatool-cash-payment-isolation`): any new statement/report MUST exclude POS-linked transactions if scoped to a customer.
8. **Reports**: cash-basis statements MUST read from `transactions`, never `invoices`. Mark unpaid invoices as NOT revenue.
9. **Cache invalidation**: after insert/update, invalidate `["transactions"]`, `["transactionsWithAccounts"]`, `["accounts"]`, and (if customer/supplier touched) `["customers"]`/`["suppliers"]`.
10. **Bank deposit / deduction**: "خصم من الحساب الأساسي" = `type='expense'`, `account_id=<main>`; "إضافة حساب بنكي جديد" = row in `accounts` with `account_type='bank'` + `bank_name` set.

## Verification recipe (per change)

For each finance page touched, run BOTH viewports (1280×1800 + 375×812) via Playwright (see `<browser-use>`):

1. Open page → screenshot.
2. Click "جديد/إضافة" → ensure form opens (Sheet on mobile, inline panel/Dialog on desktop).
3. Fill required field(s); click save twice quickly → verify only ONE row inserted (saving guard).
4. Re-fetch `accounts.balance` of any account that received a transaction and assert it equals the SQL recomputation:
   ```sql
   SELECT COALESCE(SUM(CASE
     WHEN type='income' AND account_id=$1 THEN amount
     WHEN type='expense' AND account_id=$1 THEN -amount
     WHEN type='transfer' AND to_account_id=$1 THEN amount
     WHEN type='transfer' AND account_id=$1 THEN -amount
     ELSE 0 END), 0)
   FROM transactions WHERE account_id=$1 OR to_account_id=$1;
   ```
5. Open `/reports/trial-balance` for the same period → row for the account must show the same closing balance.
6. Open `/reports/account-statement` for the account → running balance at the last row equals `accounts.balance`.

## Common breakages (regression catalog)

| symptom | likely cause | fix |
|---|---|---|
| Account balance off by one transaction | mutation didn't invalidate `["accounts"]` | add `queryClient.invalidateQueries({ queryKey: ['accounts'] })` after success |
| Trial balance ≠ account statement | report queried `invoices` instead of `transactions` | rewrite to use `transactions` cash-basis |
| Transfer shows wrong sign | UI infers from `debit`/`credit` instead of `type+account_id/to_account_id` | render based on which side the current account is |
| Double-charged transaction | no saving guard → user clicked twice | add `savingRef` + disabled button |
| Bank deposit allowed without bank_name | bypassed `validateBankTransferPayment` | call validator in `handleSubmit` before `insert.mutateAsync` |
| Default account deleted | UI didn't check `is_default` | conditional render of delete button |

## Output protocol

After audit, return a markdown table: `Page | Check | Status (✅/❌) | Evidence (file:line or screenshot)`. End with `🎯 Finance layer: healthy/needs-fix`.

## Skill aliases (auto-trigger)

"فحص المالية", "تأكد من صفحات الحسابات", "audit finance", "بنوك وإيرادات", "كشف حساب وميزان مراجعة", "مهارة المالية".
