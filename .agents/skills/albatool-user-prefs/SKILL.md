---
name: albatool-user-prefs
description: Use when adding/editing any per-user UI customization in Albatool — column widths, row heights, dialog sizes, toolbar order/lock/labels, sidebars, zoom — to ensure mobile and desktop prefs stay isolated per user and sync to Lovable Cloud.
---

# Albatool User Preferences Architecture

Every customizable UI element in Albatool must follow the same contract so that:

1. **Each user has their own settings** — never shared across accounts.
2. **Mobile and desktop are separate buckets** for the same user. A user resizing a column on their phone must NOT affect the same column on desktop, and vice versa.
3. **Settings persist via Lovable Cloud** (`user_ui_preferences` table), pulled on login and pushed debounced on change.
4. **Nothing changes unless the user changes it.** Auto-fit / re-clamp logic must respect a "user-pinned" flag.

## The canonical key format

```
lov:u:{userId}:ff:{formFactor}:{scope}:{base}
```

- `userId`: `auth.uid()` or `guest` before login.
- `formFactor`: `mobile` (≤640px) or `desktop` (otherwise). Tablet folds into desktop.
- `scope`: short namespace, e.g. `colwidths`, `rowh`, `dlg`, `toolbar`, `zoom`, `sidebar`, `ui`.
- `base`: page/component identifier, e.g. `customers`, `invoice-create-row1`, `transport_dialog`.

Any key starting with `lov:u:` is automatically synced by `src/hooks/useUiPrefsCloudSync.tsx` (the `lov:u:` prefix is in `SYNCED_PREFIXES`).

## The three building blocks

| File | Purpose |
|---|---|
| `src/hooks/useFormFactor.ts` | Reactive `mobile`/`desktop` (640px breakpoint) + `getFormFactorSync()` for non-React code. |
| `src/lib/formFactorKey.ts` | `formFactorKey(scope, base)` and `useFormFactorScopedLegacyKey(legacyKey)` with silent migration from older keys. |
| `src/hooks/useUiPrefsCloudSync.tsx` | Already mounted in App — handles pull/push to `user_ui_preferences`. Do NOT modify unless adding a new prefix. |

## Recipe — adding a new customizable element

1. **Pick a scope + base.** Example: row height on the products page → `scope="rowh"`, `base="products"`.
2. **In the hook/component, build the key with `formFactorKey` or `useFormFactorScopedLegacyKey`** (the second one when you need to keep backward compat with an existing un-namespaced key).
3. **Add a "إعادة افتراضي" button** using the existing `ColumnsResetButton` (or a sibling for non-column prefs) that clears the user's key — DO NOT touch other users' values.
4. **(Optional)** Add a "حفظ كافتراضي لي" button if the user should be able to snapshot the current state as their personal default.
5. **(Optional)** Add a "قفل/فتح" toggle if the layout must resist passive recomputation.

## Per-screen QA checklist (run before declaring a batch done)

- [ ] Resize/customize on mobile (375×667). Refresh. State persists.
- [ ] Switch to desktop (1440×900). State is INDEPENDENT (defaults or that user's desktop prefs).
- [ ] Customize on desktop. Switch back to mobile. Mobile state UNCHANGED.
- [ ] Sign out and sign in as a different user. New user does NOT see previous user's customization.
- [ ] Click "إعادة افتراضي" — returns to defaults, toast confirms in Arabic.
- [ ] No console errors, no flicker on mount, no extra network requests beyond the debounced upsert.

## Hooks map (when to use what)

| Hook | Use for |
|---|---|
| `useColumnWidths(key, defaults)` | Column widths + locked + saveAsUserDefault. Pass a key built via `formFactorKey('colwidths', '<page>')`. |
| `useRowHeights(key)` | Per-row height table. Use `formFactorKey('rowh', '<page>')`. |
| `useQuickRowWidths` | Inline single-row width adjustment. Use `formFactorKey('qroww', '<page>')`. |
| `useDialogSize(dialogKey, open)` | Resizable dialogs. Already user-scoped; wrap the dialogKey with form factor: `${formFactor}:${dialogKey}`. |
| `useToolbarOrder(screenKey, defaults)` | Toolbar button order. After batch 2, internally uses form factor. |
| `useToolbarLock`, `useToolbarLabels`, `useToolbarHidden` | Per-screen toolbar state. Same treatment as `useToolbarOrder`. |
| `useSuggestionsWidth`, `useItemsZoom`, `useScreenZoom` | Misc. Use `formFactorKey('ui', '<purpose>')`. |
| `useAppearance` | Global theme. NOT split by form factor (intentional — color/font are user-wide). |

## Hard "do not"s

- ❌ Never write a fixed un-namespaced `localStorage.setItem("widths:...")`.
- ❌ Never reuse `deviceId` (random per browser). Always use `userId`.
- ❌ Never delete a legacy key during migration — only copy.
- ❌ Never call `useFormFactor` outside React. Use `getFormFactorSync()` instead.
- ❌ Never split `useAppearance` by form factor — color/font are user-wide.
- ❌ Never put `formFactor` segments inside a single `localStorage.setItem` value — it belongs in the KEY so cloud sync handles each independently.

## Rollout tracking

Batches still to ship (one screen per batch — see `.lovable/plan.md`):

- [x] Batch 0 — Foundation (`useFormFactor`, `formFactorKey`, tests, sync prefix).
- [x] Batch 1 — This skill.
- [x] Batch 2 — `useToolbarOrder` + lock/labels/hidden (owner is now `u_<uid>:ff:<ff>`).
- [ ] Batch 3 — `CustomersPage`.
- [ ] Batch 4 — `ProductsPage`.
- [ ] Batch 5 — `InvoiceCreatePage`.
- [ ] Batch 6 — `QuoteCreatePage`.
- [ ] Batch 7 — `PurchaseCreatePage`.
- [ ] Batch 8 — `StockReturnCreatePage`.
- [ ] Batch 9 — `CompanySettingsPage`.
- [ ] Batch 10 — Twelve dialogs (`useDialogSize` consumers).
- [ ] Batch 11 — `RecentItemsSidebar` + `FloatingSideTools`.
- [ ] Batch 12 — Full-system QA + memory update.

When you complete a batch, tick the box here.
