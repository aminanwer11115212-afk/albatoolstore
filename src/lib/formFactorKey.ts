/**
 * formFactorKey — يبني مفتاح localStorage مفصولاً لكل (مستخدم × صيغة عرض × scope).
 *
 * الصيغة: `lov:u:{uid}:ff:{formFactor}:{scope}:{base}`
 *
 * الفائدة: تخصيص شاشة الهاتف لا يصل إلى سطح المكتب لنفس المستخدم، ولا
 * يتسرب بين المستخدمين (uid)، ويُزامَن سحابياً عبر `useUiPrefsCloudSync`
 * لأن البادئة `lov:u:` ضمن قائمة البادئات المُزامَنة.
 *
 * قاعدة وراثة سطح المكتب (Desktop Inheritance):
 *   - عند أوّل قراءة على سطح المكتب، نسخ القيم القديمة (un-namespaced /
 *     `lov:u:{uid}:legacy:...`) إلى bucket desktop ⇒ المستخدم لا يفقد تخصيصاته.
 *   - عند أوّل قراءة على الهاتف، نبدأ نظيفاً ⇒ تخصيصات desktop لا تتسرّب
 *     إلى تجربة الهاتف الضيقة.
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
 * Like `userKey(scope, base)` but adds the `ff:{formFactor}` segment.
 * Migrates from the non-ff equivalent (`lov:u:{uid}:{scope}:{base}`) into
 * the desktop bucket only on first read.
 */
export function formFactorUserKey(scope: string, base: string): string {
  const uid = getCurrentUserIdSync() ?? "guest";
  const ff = getFormFactorSync();
  const newKey = `lov:u:${uid}:ff:${ff}:${scope}:${base}`;
  if (typeof window === "undefined") return newKey;
  try {
    if (localStorage.getItem(newKey) !== null) return newKey;
    if (uid !== "guest" && ff === "desktop") {
      const oldKey = `lov:u:${uid}:${scope}:${base}`;
      const v = localStorage.getItem(oldKey);
      if (v !== null) localStorage.setItem(newKey, v);
    }
  } catch { /* noop */ }
  return newKey;
}

/**
 * Wraps a legacy un-namespaced key with `(user × form factor)` scope and silently
 * migrates the value on first read. Mobile starts clean; desktop inherits the
 * existing legacy value so users keep their customizations after rollout.
 *
 * `suffixes` allows the caller to migrate companion keys built by composing
 * `${legacyKey}${suffix}` (e.g. `:locked`, `:global`, `:userResized`).
 */
export function formFactorScopedLegacyKey(
  legacyKey: string,
  suffixes: readonly string[] = [":userResized"],
): string {
  const uid = getCurrentUserIdSync() ?? "guest";
  const ff = getFormFactorSync();
  const newKey = `lov:u:${uid}:ff:${ff}:legacy:${legacyKey}`;
  migrateIfEmpty(newKey, legacyKey, uid, ff, suffixes);
  return newKey;
}

function migrateIfEmpty(
  newKey: string,
  legacyKey: string,
  uid: string,
  ff: string,
  suffixes: readonly string[],
) {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(newKey) !== null) return;

    // Mobile starts clean — never inherit desktop/un-scoped layouts.
    if (ff !== "desktop") return;

    const candidates = [
      legacyKey,
      `lov:u:${uid}:legacy:${legacyKey}`,
      `lov:u:guest:ff:desktop:legacy:${legacyKey}`,
      `lov:u:guest:legacy:${legacyKey}`,
    ];
    for (const k of candidates) {
      const v = localStorage.getItem(k);
      if (v !== null) {
        localStorage.setItem(newKey, v);
        for (const s of suffixes) {
          const oldS = localStorage.getItem(k + s);
          if (oldS !== null && localStorage.getItem(newKey + s) === null) {
            localStorage.setItem(newKey + s, oldS);
          }
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
export function useFormFactorScopedLegacyKey(
  legacyKey: string,
  suffixes: readonly string[] = [":userResized"],
): string {
  const ff = useFormFactor();
  const [uid, setUid] = useState<string | null>(getCurrentUserIdSync());

  useEffect(() => {
    setUid(getCurrentUserIdSync());
    return onUserChange((u) => setUid(u));
  }, []);

  const newKey = `lov:u:${uid ?? "guest"}:ff:${ff}:legacy:${legacyKey}`;
  migrateIfEmpty(newKey, legacyKey, uid ?? "guest", ff, suffixes);
  return newKey;
}
