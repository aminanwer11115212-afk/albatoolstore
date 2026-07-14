import { useCallback, useEffect, useRef, useState } from "react";
import { onUserChange, getCurrentUserIdSync } from "@/lib/userScopedKey";
import { getFormFactorSync, useFormFactor } from "@/hooks/useFormFactor";


const STEP = 60;

/**
 * Build a per-(user × form factor) storage key, migrating from older shapes:
 *   1. legacy un-namespaced key
 *   2. `lov:u:{uid}:qrw:{legacyKey}` (pre-form-factor)
 * Mobile starts clean; desktop inherits.
 */
function resolveUserKey(legacyKey: string): string {
  const uid = getCurrentUserIdSync() ?? "guest";
  const ff = getFormFactorSync();
  const newKey = `lov:u:${uid}:ff:${ff}:qrw:${legacyKey}`;
  try {
    if (typeof window !== "undefined" && localStorage.getItem(newKey) === null && ff === "desktop") {
      const candidates = [
        `lov:u:${uid}:qrw:${legacyKey}`,
        legacyKey,
      ];
      for (const k of candidates) {
        const v = localStorage.getItem(k);
        if (v !== null) { localStorage.setItem(newKey, v); break; }
      }
    }
  } catch { /* noop */ }
  return newKey;
}

/**
 * Per-field "extra width" (in pixels) added on top of a base CSS grid template.
 * - One click on the expand button adds +STEP px to that column.
 * - Double-click resets that column.
 * - Stored in localStorage under a **per-user** key so each user keeps their
 *   own layout preferences.
 *
 * The base columns are passed to `getGridTemplate(base)` and the extras are
 * folded in via `minmax(calc(<base> + Npx), 1fr)`. If extra is 0 the original
 * base value is used unchanged.
 */
export function useQuickRowWidths(storageKey: string, length: number) {
  // Reactive per-user × per-form-factor key.
  const ff = useFormFactor();
  const [resolvedKey, setResolvedKey] = useState<string>(() => resolveUserKey(storageKey));
  const resolvedKeyRef = useRef(resolvedKey);
  resolvedKeyRef.current = resolvedKey;

  // Re-resolve when form factor changes (mobile <-> desktop).
  useEffect(() => {
    const next = resolveUserKey(storageKey);
    setResolvedKey(next);
    try {
      const raw = localStorage.getItem(next);
      if (raw) {
        const parsed = JSON.parse(raw) as number[];
        if (Array.isArray(parsed) && parsed.length === length) {
          setExtras(parsed.map((v) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : 0)));
          return;
        }
      }
    } catch { /* noop */ }
    setExtras(new Array(length).fill(0));
  }, [ff, storageKey, length]);


  useEffect(() => {
    // Re-resolve whenever the logged-in user changes (login / logout).
    const off = onUserChange(() => {
      const next = resolveUserKey(storageKey);
      setResolvedKey(next);
      // Reload extras from the new user's stored values.
      try {
        const raw = localStorage.getItem(next);
        if (raw) {
          const parsed = JSON.parse(raw) as number[];
          if (Array.isArray(parsed) && parsed.length === length) {
            setExtras(parsed.map((v) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : 0)));
            return;
          }
        }
      } catch { /* noop */ }
      setExtras(new Array(length).fill(0));
    });
    return off;
  }, [storageKey, length]);

  const [extras, setExtras] = useState<number[]>(() => {
    const initial = new Array(length).fill(0) as number[];
    if (typeof window === "undefined") return initial;
    try {
      const key = resolveUserKey(storageKey);
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      const parsed = JSON.parse(raw) as number[];
      if (!Array.isArray(parsed) || parsed.length !== length) return initial;
      return parsed.map((v) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : 0));
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(resolvedKey, JSON.stringify(extras));
    } catch {
      /* noop */
    }
  }, [extras, resolvedKey]);

  const expand = useCallback((index: number) => {
    setExtras((prev) => {
      const arr = prev.slice();
      arr[index] = (arr[index] || 0) + STEP;
      return arr;
    });
  }, []);

  const setExtra = useCallback((index: number, value: number) => {
    setExtras((prev) => {
      const arr = prev.slice();
      arr[index] = Math.max(0, value);
      return arr;
    });
  }, []);

  const reset = useCallback((index: number) => {
    setExtras((prev) => {
      const arr = prev.slice();
      arr[index] = 0;
      return arr;
    });
  }, []);

  const getGridTemplate = useCallback(
    (base: string[]): string => {
      // الأعمدة "تتنفّس": تكبر حسب تخصيص المستخدم لمّا تتوفر مساحة،
      // وتنكمش تلقائياً عند تضييق الشاشة بدلاً من الخروج عن العرض.
      //  - px ثابت + extra: minmax(<base>, <base+extra>px) — يكبر إلى المخصَّص ويصغر للقاعدة.
      //  - fr مرن + extra: يزداد وزنه بمعدل 1fr لكل STEP بكسل (يبقى نسبياً).
      //  - auto وغيره: minmax(0, <base>) لتفادي الفيضان.
      // نلفّ الكلّ بـ minmax(0, ...) عند الحاجة للسماح بالانكماش داخل الحاويات الضيقة.
      const STEP = 60;
      const parts: string[] = [];
      for (let i = 0; i < base.length; i++) {
        const b = base[i];
        const extra = extras[i] || 0;
        const pxMatch = b.match(/^(\d+(?:\.\d+)?)px$/);
        const frMatch = b.match(/^(\d+(?:\.\d+)?)fr$/);
        if (i < length && extra > 0) {
          if (pxMatch) {
            const n = parseFloat(pxMatch[1]);
            // يكبر للحدّ الأقصى المخصَّص لكنه يصغر للقاعدة عند ضيق الشاشة.
            parts.push(`minmax(${n}px,${n + extra}px)`);
          } else if (frMatch) {
            const n = parseFloat(frMatch[1]);
            const addedFr = extra / STEP;
            parts.push(`minmax(0,${n + addedFr}fr)`);
          } else {
            parts.push(`minmax(0,${b})`);
          }
        } else {
          // extra == 0 → لا نلفّ في minmax، نبقي التعبير كما هو (test contract).
          parts.push(b);
        }
      }
      return parts.join(" ");
    },
    [extras, length],
  );

  return { extras, expand, setExtra, reset, getGridTemplate };
}

// Re-export ExpandFieldButton from its dedicated component file.
// Keeping this re-export here preserves all existing import paths.
export { ExpandFieldButton } from "@/components/ExpandFieldButton";
