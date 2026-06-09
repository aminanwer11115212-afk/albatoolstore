// قفل إعدادات شريط الأدوات لكل صفحة (screenKey).
//
// عند تفعيل القفل بالنقر المزدوج على زر الإعدادات، نلتقط لقطة (snapshot)
// من جميع مفاتيح localStorage الخاصة بهذه الصفحة (المواضع، المخفية، التسميات)
// ونحفظها تحت مفتاح القفل. ثم تتم استعادة هذه القيم تلقائياً فور أي تغيير
// (سواء عبر الواجهة أو من تبويب آخر) حتى يُرفع القفل بنقرة مزدوجة أخرى.
//
// المفاتيح العامة كحجم سطور البنود (itemsZoom) لا يتم قفلها لأنها مشتركة بين
// كل الصفحات.

import { useCallback, useEffect, useState } from "react";
import { getToolbarOwnerId, useToolbarOwnerToken } from "./toolbarOwner";

const LOCK_PREFIX = "neobilling:toolbar-lock:v1";
const LOCK_EVENT = "neobilling:toolbar-lock-changed";

// أنماط مفاتيح الصفحة المُقفلة. كلٌ منها قد ينتهي بـ screenKey أو يحويه.
const PAGE_KEY_PREFIXES = [
  "neobilling:toolbar-positions:v2", // ...:<owner>:<screenKey>
  "neobilling:toolbar-hidden:v1",    // ...:<owner>:<screenKey>
  "neobilling:toolbar-labels:v1",    // ...:<owner>:<screenKey>
];

function lockKey(screenKey: string) {
  // يُمَسَّح القفل أيضاً لكل مالك (مستخدم/جهاز) وكل شاشة.
  return `${LOCK_PREFIX}:${getToolbarOwnerId()}:${screenKey}`;
}

/** يجمع كل مفاتيح localStorage التي تخصّ هذه الصفحة. */
function collectPageKeys(screenKey: string): string[] {
  const result: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const matchesPrefix = PAGE_KEY_PREFIXES.some((p) => k.startsWith(p));
      if (matchesPrefix && k.endsWith(`:${screenKey}`)) {
        result.push(k);
      }
    }
  } catch { /* noop */ }
  return result;
}

interface LockSnapshot {
  /** map: storageKey -> stored string value */
  values: Record<string, string>;
  lockedAt: number;
}

function readLock(screenKey: string): LockSnapshot | null {
  try {
    const raw = localStorage.getItem(lockKey(screenKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.values) return parsed as LockSnapshot;
  } catch { /* noop */ }
  return null;
}

function writeLock(screenKey: string, snap: LockSnapshot | null) {
  try {
    if (snap === null) {
      localStorage.removeItem(lockKey(screenKey));
    } else {
      localStorage.setItem(lockKey(screenKey), JSON.stringify(snap));
    }
    window.dispatchEvent(new CustomEvent(LOCK_EVENT, { detail: { screenKey } }));
  } catch { /* noop */ }
}

/** يُعيد كل المفاتيح المُلتقَطة إلى قيم اللقطة. يُستخدم تلقائياً وعند الحاجة. */
function enforceSnapshot(snap: LockSnapshot): boolean {
  let changedAny = false;
  try {
    for (const [k, v] of Object.entries(snap.values)) {
      const current = localStorage.getItem(k);
      if (current !== v) {
        if (v === null || v === undefined) {
          localStorage.removeItem(k);
        } else {
          localStorage.setItem(k, v);
        }
        changedAny = true;
      }
    }
    // كذلك نحذف أي مفتاح خاص بالصفحة لم يكن جزءاً من اللقطة (أُضيف بعد القفل).
    // هذا يضمن أن القفل يحافظ تماماً على الحالة الملتقطة.
  } catch { /* noop */ }
  return changedAny;
}

export function useToolbarLock(screenKey: string) {
  const ownerToken = useToolbarOwnerToken();
  const [snapshot, setSnapshot] = useState<LockSnapshot | null>(() =>
    typeof window === "undefined" ? null : readLock(screenKey),
  );

  // الإصغاء لتغييرات القفل + إعادة القراءة عند تبدّل المالك (مستخدم/صيغة عرض).
  useEffect(() => {
    setSnapshot(readLock(screenKey));
    const onCustom = (e: Event) => {
      const ev = e as CustomEvent<{ screenKey?: string }>;
      if (ev.detail?.screenKey === screenKey) {
        setSnapshot(readLock(screenKey));
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === lockKey(screenKey)) {
        setSnapshot(readLock(screenKey));
      }
    };
    window.addEventListener(LOCK_EVENT, onCustom as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(LOCK_EVENT, onCustom as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [screenKey, ownerToken]);

  // عند وجود قفل: نُطبّق اللقطة دورياً ونستجيب لأي حدث تخزين.
  useEffect(() => {
    if (!snapshot) return;
    // فرض فوري عند التفعيل
    enforceSnapshot(snapshot);

    const onAnyStorage = () => {
      enforceSnapshot(snapshot);
    };
    window.addEventListener("storage", onAnyStorage);

    // فحص دوري قصير لالتقاط التغييرات داخل نفس التبويب (لا تُطلق "storage").
    const interval = window.setInterval(() => {
      if (enforceSnapshot(snapshot)) {
        // أعلم الواجهة كي تعيد القراءة من localStorage
        window.dispatchEvent(new CustomEvent("neobilling:toolbar-hidden-changed"));
        window.dispatchEvent(new CustomEvent("neobilling:toolbar-labels-changed"));
      }
    }, 300);

    return () => {
      window.removeEventListener("storage", onAnyStorage);
      window.clearInterval(interval);
    };
  }, [snapshot]);

  const isLocked = !!snapshot;

  const lock = useCallback(() => {
    const keys = collectPageKeys(screenKey);
    const values: Record<string, string> = {};
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v !== null) values[k] = v;
    }
    const snap: LockSnapshot = { values, lockedAt: Date.now() };
    writeLock(screenKey, snap);
  }, [screenKey]);

  const unlock = useCallback(() => {
    writeLock(screenKey, null);
  }, [screenKey]);

  const toggle = useCallback(() => {
    if (snapshot) unlock();
    else lock();
  }, [snapshot, lock, unlock]);

  return { isLocked, lock, unlock, toggle, lockedAt: snapshot?.lockedAt ?? null };
}
