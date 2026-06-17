---
name: ui-personalization
description: Per-user, per-form-factor UI customization contract — column widths, row heights, dialog sizes, toolbar order/lock/labels.
type: feature
---
All customizable UI state is keyed `lov:u:{uid}:ff:{mobile|desktop}:{scope}:{base}`. Mobile and desktop are independent buckets for the same user; switching between them must never bleed prefs across. **As of 2026-06-17 cloud sync is DISABLED by owner request — `useUiPrefsCloudSync` is now a no-op. Customizations live ONLY in the device's localStorage; each laptop/phone/browser has its own settings even for the same user.** Do not re-enable cloud sync without explicit permission. Building blocks: `src/hooks/useFormFactor.ts`, `src/lib/formFactorKey.ts`. Every customizable screen must have a "إعادة افتراضي" button. Migration from older keys (un-namespaced, `lov:u:{uid}:legacy:*`, deviceId-based) is silent — never delete legacy values. `useAppearance` (color/font/theme) is intentionally NOT split by form factor. Reference skill: `albatool-user-prefs`.
