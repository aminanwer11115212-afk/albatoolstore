---
name: ui-personalization
description: Per-user, per-form-factor UI customization contract — column widths, row heights, dialog sizes, toolbar order/lock/labels.
type: feature
---
All customizable UI state is keyed `lov:u:{uid}:ff:{mobile|desktop}:{scope}:{base}`. Mobile and desktop are independent buckets for the same user; switching between them must never bleed prefs across. Sync to Lovable Cloud is automatic via `useUiPrefsCloudSync` (any `lov:u:` key is synced). Building blocks: `src/hooks/useFormFactor.ts`, `src/lib/formFactorKey.ts`. Every customizable screen must have a "إعادة افتراضي" button. Migration from older keys (un-namespaced, `lov:u:{uid}:legacy:*`, deviceId-based) is silent — never delete legacy values. `useAppearance` (color/font/theme) is intentionally NOT split by form factor. Rollout is one screen per batch — see `.lovable/plan.md`. Reference skill: `albatool-user-prefs`.
