# Albatool Module — Final QA Checklist

Run this before saying "تم".

## Database
- [ ] Migration uses CREATE → GRANT → ALTER RLS → POLICY → TRIGGER order
- [ ] `GRANT … TO authenticated` and `GRANT ALL … TO service_role` present
- [ ] No `GRANT … TO anon` unless table is intentionally public
- [ ] RLS enabled, at least one policy exists
- [ ] `updated_at` trigger attached using existing `public.update_updated_at_column()`
- [ ] No manual writes to `customers.balance` / `suppliers.balance` (triggers own those)

## UI
- [ ] All labels, placeholders, toasts in Arabic
- [ ] Top-level `dir="rtl"`
- [ ] No hardcoded colors — only design tokens (`bg-background`, `text-foreground`, …)
- [ ] No `text-white` / `bg-black` / raw hex / `text-gray-500`
- [ ] Cairo font + bold inheritance preserved (no overriding `font-weight`)
- [ ] Mobile-safe: inputs ≥16px font (don't override the global rule)
- [ ] Search uses `startsWithMatch` from `@/utils/searchMatch`, not `.includes`

## Wiring
- [ ] Route registered in `src/App.tsx` with `lazyEl` and Arabic title
- [ ] Sidebar link added if a sidebar exists
- [ ] Uses `useTable("<name>")` (or a justified bespoke hook)
- [ ] Delete confirmed via `AlertDialog` (no raw `window.confirm`)
- [ ] Status field (if any) uses the constrained set: paid/partial/pending/overdue/cancelled

## Communication
- [ ] Never said "Supabase" to the user — used "Lovable Cloud" / "قاعدة البيانات"
- [ ] Did NOT edit `client.ts`, `types.ts`, `.env`, or `supabase/config.toml`
