---
name: albatool-module-scaffolder
description: Scaffold a new domain module (List page + Create page + optional Print) for the Albatool Store Arabic RTL ERP, matching the existing Invoices/Quotes/Purchases/Customers/Suppliers patterns. Trigger when the user asks to add a new module, entity, screen, table page, or "صفحة جديدة" / "موديول جديد" / "أضف قسم" — anything that needs a list + create flow wired to a Supabase table with Arabic RTL UI, design tokens, startsWith search, and the project's data hooks.
---

# Albatool Module Scaffolder

This skill encodes the exact conventions used by the Albatool Store ERP so a new module looks, behaves, and integrates like the existing ones (no drift, no missing wiring).

## When to use

The user is adding ANY new domain entity that needs:
- a list/table page with search + filters,
- a create/edit flow,
- (optionally) A4 RTL printing,
- a Supabase table backing it.

Examples: "أضف صفحة الموردين الفرعيين", "أنشئ موديول للمصروفات الثابتة", "نحتاج جدول للعقود".

## Hard rules (never violate)

1. **RTL + Arabic** by default. Every label, button, toast, empty-state in Arabic. Container uses `dir="rtl"`.
2. **Cairo font + bold body** — never override; inherits globally.
3. **Design tokens only** — use `bg-background`, `text-foreground`, `bg-primary`, `border-border`, `text-muted-foreground`, etc. NEVER `text-white`, `bg-black`, `#fff`, raw hex, or `text-gray-500`.
4. **Never edit** `src/integrations/supabase/client.ts`, `types.ts`, `.env`, or `supabase/config.toml`.
5. **Data layer**: use the generic `useTable(name)` from `src/hooks/useData.ts` for simple CRUD. Only write a bespoke hook if the entity needs joins or aggregates (mirror `useInvoicesWithCustomers` style).
6. **Search**: use `startsWithMatch` from `@/utils/searchMatch` for any text filter — never raw `.includes()`.
7. **No anon access** — every new table policy must scope to `auth.uid()` or `has_role`. Migration MUST include `GRANT … TO authenticated` and `GRANT ALL … TO service_role` (skip `anon`).
8. **Status fields** (if invoice-like): use the constrained set `paid | partial | pending | overdue | cancelled` and import helpers from `src/utils/invoiceStatus.ts`. Don't invent new statuses without the user's approval.
9. **Balance columns** (customers.balance, suppliers.balance) are maintained by DB triggers — never update them from the app.
10. **Never mention Supabase** to the user — call it "Lovable Cloud" / "قاعدة البيانات".

## The 6-step recipe

Follow these steps in order. Don't skip step 1 even if the user named the table.

### 1. Clarify (1 question max)

If the user did not specify the table name, fields, or whether it needs printing/status, ask ONE consolidated question. Otherwise skip.

### 2. Database migration

Use `supabase--migration`. The SQL must include, in this order:

```sql
CREATE TABLE public.<name> (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- domain fields here
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.<name> TO authenticated;
GRANT ALL ON public.<name> TO service_role;

ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<name>_authenticated_all"
  ON public.<name> FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_<name>_updated_at
  BEFORE UPDATE ON public.<name>
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

Stop after calling the migration tool — wait for approval before writing TS code that references the new table (types regenerate after approval).

### 3. List page

File: `src/pages/<Name>Page.tsx`. Skeleton in `references/list-page-template.tsx`.

Must include:
- `dir="rtl"` wrapper, Arabic page title in an `<h1>`.
- Search input (top-right), wired through `startsWithMatch(row.field, query)`.
- shadcn `<Table>` with sticky header, `text-right`, status badge if applicable.
- Action buttons: "إضافة" → navigates to `/<name>/create`; row hover shows edit/delete (use `AlertDialog` for delete confirmation).
- Empty state in Arabic: "لا توجد بيانات بعد".
- Use `useTable("<name>")` for `data`, `insert`, `update`, `remove`.

### 4. Create/Edit page

File: `src/pages/<Name>CreatePage.tsx`. Skeleton in `references/create-page-template.tsx`.

Must include:
- React Hook Form + Zod schema (Arabic error messages).
- Inputs: shadcn `<Input>`, `<Textarea>`, `<Select>` — all with visible Arabic labels.
- Submit calls `insert.mutateAsync(...)` then `navigate(-1)` and shows toast: "تم الحفظ بنجاح".
- Cancel button: "إلغاء".
- For entity pickers (customer/supplier/product) use `InlineSearchSelect` from `src/components/InlineSearchSelect.tsx`.

### 5. Route + sidebar

- Register the route in `src/App.tsx` next to similar entities, wrapped in `lazyEl(...)` with an Arabic title.
- Add a sidebar link if a sidebar component exists (search for the existing entity in the sidebar file and mirror it).

### 6. Optional: A4 RTL print

Only if the user asked for printing. Use the variants pattern (`full | no-account | account-only | no-details`, plus `noHeader` flag) — see existing invoice print component for the exact structure. Print container: `dir="rtl" font-cairo` with `@page { size: A4; margin: 10mm; }`.

## Files in this skill

- `references/list-page-template.tsx` — copy-paste starting point for the list page.
- `references/create-page-template.tsx` — copy-paste starting point for the create page.
- `references/migration-template.sql` — copy-paste SQL with GRANT + RLS in correct order.
- `references/checklist.md` — final QA pass before declaring "done".

Read these on demand when you reach the matching step.

## Done definition

Before telling the user the module is ready, run through `references/checklist.md` mentally. If any box is unchecked, fix it first.
