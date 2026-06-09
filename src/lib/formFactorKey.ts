/**
 * formFactorKey — يبني مفتاح localStorage مفصولاً لكل (مستخدم × صيغة عرض × scope).
 *
 * الصيغة: `lov:u:{uid}:ff:{formFactor}:{scope}:{base}`
 *
 * الفائدة: تخصيص شاشة الهاتف لا يصل إلى سطح المكتب لنفس المستخدم، ولا
 * يتسرب بين المستخدمين (uid)، ويُزامَن سحابياً عبر `useUiPrefsCloudSync`
 * لأن البادئة `lov:u:` ضمن قائمة البادئات المُزامَنة.
 *
 * الترحيل: عند أول قراءة، إن كان المفتاح الجديد فارغاً نحاول قراءة:
 *   1. legacyKey كما هو (un-namespaced)
 *   2. `lov:u:{uid}:legacy:{legacyKey}` (المفتاح الحالي قبل إضافة form factor)
 *   3. `lov:u:guest:ff:{formFactor}:legacy:{legacyKey}` (تم كتابته قبل حلّ الجلسة)
 * وننسخ القيمة. لا نحذف القديم أبداً للأمان.
 */
import { useEffect, useState } from "react";
import { getCurrentUserIdSync, onUserChange } from "./userScopedKey";
import { getFormFactorSync, useFormFactor } from "@/hooks/useFormFactor";

export function formFactorKey(scope: string, base: string): string {
  const uid = getCurrentUserIdSync() ?? "guest";
  const ff = getFormFactorSync();
  return `lov:u:${uid}:ff:${ff}:${scope}:${base}`;
}

/**
 * Wraps a legacy un-namespaced key with `(user × form factor)` scope and silently
 * migrates the value on first read.
 */
export function formFactorScopedLegacyKey(legacyKey: string): string {
  const uid = getCurrentUserIdSync() ?? "guest";
  const ff = getFormFactorSync();
  const newKey = `lov:u:${uid}:ff:${ff}:legacy:${legacyKey}`;
  migrateIfEmpty(newKey, legacyKey, uid, ff);
  return newKey;
}

function migrateIfEmpty(newKey: string, legacyKey: string, uid: string, ff: string) {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(newKey) !== null) return;
    const candidates = [
      legacyKey,
      `lov:u:${uid}:legacy:${legacyKey}`,
      `lov:u:guest:ff:${ff}:legacy:${legacyKey}`,
      `lov:u:guest:legacy:${legacyKey}`,
    ];
    for (const k of candidates) {
      const v = localStorage.getItem(k);
      if (v !== null) {
        localStorage.setItem(newKey, v);
        const flag = localStorage.getItem(`${k}:userResized`);
        if (flag !== null && localStorage.getItem(`${newKey}:userResized`) === null) {
          localStorage.setItem(`${newKey}:userResized`, flag);
        }
        return;
      }
    }
  } catch {
    /* noop */
  }
}

/**
 * Reactive hook variant — يُعيد المفتاح ويُعيد العرض عند تغيّر المستخدم أو
 * صيغة العرض (تدوير الشاشة، تكبير النافذة).
 */
export function useFormFactorScopedLegacyKey(legacyKey: string): string {
  const ff = useFormFactor();
  const [uid, setUid] = useState<string | null>(getCurrentUserIdSync());

  useEffect(() => {
    setUid(getCurrentUserIdSync());
    return onUserChange((u) => setUid(u));
  }, []);

  const newKey = `lov:u:${uid ?? "guest"}:ff:${ff}:legacy:${legacyKey}`;

  // Migrate on every (uid, ff) change — safe because it's a no-op when target exists.
  migrateIfEmpty(newKey, legacyKey, uid ?? "guest", ff);

  return newKey;
}
