---
name: albatool-workflow-automation
description: Use this skill when adding, modifying, or debugging any automation that changes an invoice's `workflow_status` (حالة التجهيز) in the Albatool Store ERP — including reactions to events like printing, packaging, transport, document uploads, payments, or quote conversions. Also use it as the reference when building NEW automation chains for other modules in this project. Triggers on Arabic phrases like "أتمتة"، "حالة التجهيز"، "نقل الحالة"، "automation".
---

# Albatool — Workflow Automation Reference

This skill is the **single source of truth** for the invoice workflow lifecycle and the patterns used to build any automated state transition.

## The 5 unified workflow statuses

| value           | Arabic label         | color   | rank |
|-----------------|----------------------|---------|------|
| `new`           | مقبول                | gray    | 0    |
| `preparing`     | قيد التجهيز          | yellow  | 1    |
| `ready_to_ship` | جاهزة للرفع          | orange  | 2    |
| `in_transit`    | في الطريق للترحيلات | purple  | 3    |
| `done`          | تم                   | green   | 4    |

Sources kept in sync:
- UI labels/colors: `src/components/StatusButton.tsx` → `WORKFLOW_STATUS_OPTIONS`
- Badge labels/colors: `src/components/invoice/WorkflowStatusBadge.tsx` → `WORKFLOW_STATUSES`
- DB rank: `public.workflow_rank(text) -> int`

Any change to the set MUST update all three together.

## The automation map (current truth)

```
event                                    → target           where
──────────────────────────────────────────────────────────────────────
new invoice created                       → new             default column value
quote → invoice (items inserted)         → preparing       trigger: auto_workflow_on_item
stocktake print (variant=stocktake)      → preparing       InvoiceCreatePage.handlePrint
invoice print                             → preparing       InvoiceCreatePage / InvoiceViewPage handlePrint
packaging row inserted                    → preparing       trigger: auto_workflow_on_packaging
packaging save                            → ready_to_ship   PackagingDialog (RPC)
invoice_transports row inserted           → in_transit      trigger: auto_workflow_on_transport
TransportDialog print                     → in_transit      TransportDialog.handlePrintAndTransit
dispatch page print "fawatir jahza"      → in_transit      ShippingDispatchDialog / ReadyToShipPanel
receipt attachment uploaded               → done            InvoiceAttachmentsDialog
paid_amount >= total                      → done            trigger: auto_workflow_on_payment
quote sent via WhatsApp / printed         → quote.status=sent  markQuoteAsSent
```

`ready_to_ship` is reached **only** via packaging — never via plain invoice printing.

## Golden rules (never break)

1. **Always go through the RPC** `public.advance_invoice_workflow(invoice_id, target, reason)`. Never write `UPDATE invoices SET workflow_status = ...` from the app — it skips logging, the rank guard, the empty-invoice guard, and the kill switch.
2. **Never downgrade.** The RPC refuses to lower the rank. Don't try to work around this.
3. **Empty invoices are capped at `preparing`.** The RPC refuses `ready_to_ship | in_transit | done` if `invoice_items` is empty or `total <= 0`.
4. **Kill switch.** `company_settings.workflow_automation_enabled` (boolean, default true) disables ALL automation. Honor it.
5. **Every transition logs to `invoice_revisions`** with `action = 'auto_workflow'`, full `changes = {from, to, auto:true, reason}`. The badge reads this to show the ⚡ tooltip.
6. After any automation, call `invalidateWorkflowAutoCache(invoiceId)` from `WorkflowStatusBadge.tsx` and dispatch `window.dispatchEvent(new Event("invoices:changed"))` so dependent screens refresh.
7. **Stock deduction is separate.** It triggers when an invoice leaves `new` for the first time, handled by `src/utils/stockDeduction.ts`. Do NOT bundle stock logic into a workflow automation.
8. **Financial status (`status`: paid/partial/pending/overdue/cancelled) is independent.** Don't conflate it with `workflow_status`.

## How to add a NEW automation step (3-step recipe)

1. **Pick the event source.**
   - If the event is a DB row insert/update → write a Postgres trigger (`references/db-pattern.sql`).
   - If the event is a pure UI action (print, button click) → call the RPC from the click handler in TS.
2. **Pick the target status** from the 5-value table. Be conservative — pick the lowest defensible status. The rank guard makes "no-op upgrades" safe.
3. **Wire it.**
   - TS:
     ```ts
     await supabase.rpc("advance_invoice_workflow" as any, {
       _invoice_id: id,
       _target: "<status>",
       _reason: "<Arabic reason that will show in the tooltip>",
     });
     try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
     ```
   - DB: see `references/db-pattern.sql`.

Then verify with `references/checklist.md`.

## Files in this skill

- `references/db-pattern.sql` — template for a new trigger that calls the RPC.
- `references/checklist.md` — mandatory QA pass before declaring an automation done.

## Do NOT propose

- Adding new statuses without explicit user approval.
- Per-row direct UPDATE of `workflow_status`.
- Auto-downgrading the status.
- New CHECK constraints on `workflow_status` (would conflict with future statuses).
- Mentioning Supabase to the user — call it "Lovable Cloud".
