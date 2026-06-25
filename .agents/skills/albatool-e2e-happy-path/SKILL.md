---
name: albatool-e2e-happy-path
description: Run the 18-step end-to-end happy path for Albatool ERP/POS — from adding product/category/customer through quote→invoice→payment→packaging→dispatch→share link→print→reports→cash-isolation→stock return→delete→trace. Use before any release/publish, or when the user asks for "full system check / اختبار شامل / from A to Z".
---

# Albatool End-to-End Happy Path

Authoritative ordered checklist of the full business cycle. Reuse it identically before every publish — do **not** invent new steps; if a step is irrelevant, mark it `skipped (reason)`.

## How to run

- Read-only scan first (file inspection). Spawn 6 sector agents per `albatool-ui-audit` for parallel coverage.
- Then runtime verification via Playwright (see `<browser-use>`) on `localhost:8080`, two viewports: 1280×1800 and 375×812. Screenshot every checkpoint marked 📸.

## The 18 steps

1. **Master data** — Add فئة + ماركة + شركة منتجات + مستودع (Products → Categories/Brands/Companies; Warehouses page).
2. **Add product** — name, sale price, cost price, opening stock, unit. 📸
3. **Add customer** — WhatsApp, city, group, opening balance via `transactions` (never direct `balance` write).
4. **Create quote** — one line + discount + tax, save (uses `savingRef` + `generateRandomDocNumber('quote')`), print, WhatsApp share. 📸
5. **Convert quote → invoice** — via `convertQuoteToInvoice`; verify no duplicate numbers/items, stock NOT yet deducted.
6. **Edit invoice** — add lines, line discount; verify stock deducted exactly once (`stock_deduction_id` guard in `deductStockForInvoiceOnce`). 📸
7. **Partial payment (cash)** — record via payment dialog; `trg_auto_workflow_on_item` already moved invoice to `preparing`.
8. **Add packaging record** — verify `trg_auto_workflow_on_packaging` keeps `preparing`.
9. **Dispatch** — pick transporter + destination in `DispatchPage`, تثبيت, click "طباعة وتحويل"; verify `advance_invoice_workflow(_,'in_transit',_)` RPC fired and POS rows show amber badge. 📸
10. **Complete payment (مدى)** — full payment triggers `trg_auto_workflow_on_payment` → `advance_invoke_safe` → `done`.
11. **Share link** — Click share, open URL incognito; verify `share_link_events` rows for `created`/`viewed`/`printed`/`downloaded` (uses `log-share-event`). 📸
12. **Print A4 RTL** — all 5 variants: `full` / `no-account` / `account-only` / `no-details` / `noHeader`. 📸 each.
13. **Reports** — كشف حساب العميل، تقرير ديون العملاء، المبيعات اليومية، الترحيلات/التغليف، التقرير المالي، الميزانية، ميزان المراجعة. Numbers must reconcile per `albatool-reports-validation`.
14. **Cash (POS) invoice** — new from `/invoices/cash/new`; record payment; verify exclusion per `albatool-cash-payment-isolation`. 📸
15. **Stock return** — return one line; stock restored (positive delta in `StockTrackingPage`).
16. **Delete invoice** — via `deleteInvoiceWithStockRestore`; verify quantities returned.
17. **Stock tracking** — every row in `StockTrackingPage` resolves to its source doc; POS badge correct; cash links → `/invoices/cash/edit/:id`.
18. **Deleted items trash** — restore a line from `deleted_invoice_items` via `delete_invoke_items_silent`; no side-effect triggers.

## Output protocol

After running, return a markdown table with columns: `Step | Status (✅/❌/skipped) | Evidence (file:line or screenshot path) | Notes`. Then a single closing line: `🎯 Release-ready: yes/no`.

## Hard rules

- Do not edit code while running the path — read-only.
- Never bypass triggers (no direct `workflow_status`/`balance` writes).
- Always use both viewports.
- Skill-name aliases: "اختبار شامل", "from A to Z", "happy path", "pre-release check".
