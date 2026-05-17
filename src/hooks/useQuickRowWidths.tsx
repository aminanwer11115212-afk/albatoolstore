import { useCallback, useEffect, useRef, useState } from "react";
import { onUserChange, getCurrentUserIdSync } from "@/lib/userScopedKey";


const STEP = 60;

/** Build a per-user storage key, migrating from the old shared key on first use. */
function resolveUserKey(legacyKey: string): string {
  const uid = getCurrentUserIdSync() ?? "guest";
  const newKey = `lov:u:${uid}:qrw:${legacyKey}`;
  try {
    if (typeof window !== "undefined" && localStorage.getItem(newKey) === null) {
      const old = localStorage.getItem(legacyKey);
      if (old !== null) localStorage.setItem(newKey, old);
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
  // Reactive per-user key: re-resolves when auth changes.
  const [resolvedKey, setResolvedKey] = useState<string>(() => resolveUserKey(storageKey));
  const resolvedKeyRef = useRef(resolvedKey);
  resolvedKeyRef.current = resolvedKey;

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
            parts.push(`minmax(${n}px, ${n + extra}px)`);
          } else if (frMatch) {
            const n = parseFloat(frMatch[1]);
            const addedFr = extra / STEP;
            parts.push(`minmax(0, ${n + addedFr}fr)`);
          } else {
            parts.push(`minmax(0, ${b})`);
          }
        } else {
          if (frMatch) {
            parts.push(`minmax(0, ${b})`);
          } else {
            parts.push(b);
          }
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
