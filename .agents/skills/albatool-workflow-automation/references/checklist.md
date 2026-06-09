# Workflow automation — QA checklist

Run through this list before declaring an automation step done.

## Behavior

- [ ] Triggering the event on a fresh invoice in status `new` advances it correctly.
- [ ] Triggering the event on an invoice already past the target status is a NO-OP (no log spam, no downgrade).
- [ ] Triggering the event on an EMPTY invoice (no items / total = 0) does NOT advance past `preparing`.
- [ ] When `company_settings.workflow_automation_enabled = false`, the event does NOTHING.

## Logging

- [ ] A new row appears in `invoice_revisions` with `action = 'auto_workflow'`, `changed_by = 'system'`, and `changes` containing `{from, to, auto:true, reason}`.
- [ ] The reason text is meaningful Arabic that explains the cause.

## UI

- [ ] The status badge (`WorkflowStatusBadge`) shows the new label and color immediately (or after one event tick).
- [ ] The ⚡ icon appears on the badge with a tooltip showing the reason.
- [ ] `invoices:changed` is dispatched so the invoices list refreshes.

## Safety

- [ ] No direct `UPDATE invoices SET workflow_status = ...` was added — only the RPC.
- [ ] Stock deduction logic was not touched.
- [ ] Financial `status` field was not touched.
- [ ] No new status value was introduced without updating `workflow_rank`, `WORKFLOW_STATUS_OPTIONS`, and `WORKFLOW_STATUSES` together.

## Final smoke test

Run the full happy path end-to-end in the preview:
quote → WhatsApp (quote → sent) → convert (invoice = preparing via items trigger) → stocktake print (no change) → add packaging row (= preparing) → save packaging (= ready_to_ship) → add transport row (= in_transit) → upload receipt attachment (= done). Confirm 4 `auto_workflow` rows landed in `invoice_revisions`.
