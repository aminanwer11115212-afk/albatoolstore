import { useCallback, useEffect, useRef, useState } from "react";
import { toolbarStorageKey, useToolbarOwnerToken } from "@/components/toolbar/toolbarOwner";

/**
 * ترتيب أزرار شريط الأدوات لكل (مستخدم × صيغة عرض × شاشة).
 *
 * المفتاح يُبنى عبر `toolbarStorageKey` فيصبح:
 *   `neobilling:toolbar-order:v2:<owner>:<screenKey>`
 * حيث `<owner>` = `u_<uid>:ff:<mobile|desktop>` للمستخدم المسجَّل،
 * أو `<deviceId>:ff:<ff>` قبل تسجيل الدخول.
 *
 * الترحيل (يحدث صامتاً عند أول قراءة):
 *   1. مفتاح v1 القديم القائم على deviceId:
 *      `neobilling:toolbar:v1:<deviceId>:<screenKey>` (سطح المكتب فقط).
 *   2. أقدم مفتاح: `toolbar-order:<screenKey>`.
 */

const PREFIX = "neobilling:toolbar-order:v2";
const LEGACY_V1_PREFIX = "neobilling:toolbar:v1";
const LEGACY_FLAT_PREFIX = "toolbar-order:";
const DEVICE_KEY = "neobilling:device-id";

function readDeviceId(): string {
  try {
    return localStorage.getItem(DEVICE_KEY) ?? "";
  } catch {
    return "";
  }
}

function buildKey(screenKey: string): string {
  return toolbarStorageKey(PREFIX, screenKey);
}

function legacyV1Key(screenKey: string): string {
  return `${LEGACY_V1_PREFIX}:${readDeviceId()}:${screenKey}`;
}

function legacyFlatKey(screenKey: string): string {
  return `${LEGACY_FLAT_PREFIX}${screenKey}`;
}

function readOrder(screenKey: string, defaults: string[]): string[] {
  try {
    const newKey = buildKey(screenKey);
    let raw = localStorage.getItem(newKey);

    // ترحيل من v1 (deviceId) — فقط إن لم تكن صيغة العرض mobile (راجع toolbarStorageKey).
    // هنا نحاول استرجاع v1 كاحتياط ثانوي بعد ترحيل toolbarStorageKey الداخلي.
    if (!raw) {
      const v1 = readDeviceId() ? localStorage.getItem(legacyV1Key(screenKey)) : null;
      if (v1) {
        raw = v1;
        try { localStorage.setItem(newKey, v1); } catch { /* noop */ }
      }
    }

    // ترحيل من أقدم صيغة بدون أي بادئة.
    if (!raw) {
      const flat = localStorage.getItem(legacyFlatKey(screenKey));
      if (flat) {
        raw = flat;
        try { localStorage.setItem(newKey, flat); } catch { /* noop */ }
      }
    }

    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;
    const filtered = parsed.filter((id: unknown): id is string => typeof id === "string");
    const seen = new Set<string>();
    return filtered.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  } catch {
    return defaults;
  }
}

function writeOrder(screenKey: string, order: string[]) {
  try {
    localStorage.setItem(buildKey(screenKey), JSON.stringify(order));
  } catch {
    /* noop */
  }
}

function clearOrder(screenKey: string) {
  try {
    localStorage.removeItem(buildKey(screenKey));
  } catch {
    /* noop */
  }
}

export function useToolbarOrder(screenKey: string, defaultIds: string[]) {
  const defaultsRef = useRef(defaultIds);
  defaultsRef.current = defaultIds;

  const ownerToken = useToolbarOwnerToken();

  const computeInitial = useCallback(
    (defaults: string[]) => {
      const saved = readOrder(screenKey, defaults);
      const missing = defaults.filter((id) => !saved.includes(id));
      return [...saved, ...missing];
    },
    [screenKey],
  );

  const [order, setOrderState] = useState<string[]>(() => computeInitial(defaultIds));
  const [customizing, setCustomizing] = useState(false);

  // إعادة قراءة الترتيب عند تغيُّر المالك (مستخدم/صيغة عرض).
  useEffect(() => {
    const next = computeInitial(defaultsRef.current);
    setOrderState((prev) => {
      if (prev.length === next.length && prev.every((v, i) => v === next[i])) return prev;
      return next;
    });
  }, [ownerToken, screenKey, computeInitial]);

  // تكميل أي عناصر افتراضية جديدة أُضيفت بعد آخر حفظ.
  useEffect(() => {
    setOrderState((prev) => {
      const missing = defaultIds.filter((id) => !prev.includes(id));
      if (missing.length === 0) return prev;
      const next = [...prev, ...missing];
      writeOrder(screenKey, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultIds.join("|"), ownerToken]);

  const setOrder = useCallback(
    (next: string[]) => {
      setOrderState(next);
      writeOrder(screenKey, next);
    },
    [screenKey],
  );

  const toggleCustomizing = useCallback(() => setCustomizing((c) => !c), []);

  const resetOrder = useCallback(() => {
    clearOrder(screenKey);
    setOrderState(defaultsRef.current);
  }, [screenKey]);

  const moveItem = useCallback(
    (fromId: string, toId: string) => {
      setOrderState((prev) => {
        const from = prev.indexOf(fromId);
        const to = prev.indexOf(toId);
        if (from === -1 || to === -1 || from === to) return prev;
        const next = [...prev];
        const [m] = next.splice(from, 1);
        next.splice(to, 0, m);
        writeOrder(screenKey, next);
        return next;
      });
    },
    [screenKey],
  );

  const removeItem = useCallback(
    (id: string) => {
      setOrderState((prev) => {
        if (!prev.includes(id)) return prev;
        const next = prev.filter((x) => x !== id);
        writeOrder(screenKey, next);
        return next;
      });
    },
    [screenKey],
  );

  const insertItem = useCallback(
    (id: string, beforeId?: string) => {
      setOrderState((prev) => {
        const without = prev.filter((x) => x !== id);
        if (!beforeId) {
          const next = [...without, id];
          writeOrder(screenKey, next);
          return next;
        }
        const idx = without.indexOf(beforeId);
        if (idx === -1) {
          const next = [...without, id];
          writeOrder(screenKey, next);
          return next;
        }
        const next = [...without.slice(0, idx), id, ...without.slice(idx)];
        writeOrder(screenKey, next);
        return next;
      });
    },
    [screenKey],
  );

  return { order, setOrder, customizing, toggleCustomizing, resetOrder, moveItem, removeItem, insertItem };
}
