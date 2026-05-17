import { useCallback, useEffect, useRef, useState } from "react";

/**
 * مفاتيح localStorage لترتيب أزرار شريط الأدوات.
 *
 * - الترتيب يُحفظ منفصلاً لكل شاشة عبر `screenKey` (مثل: quote-create-row1، invoice-view-row1...).
 * - localStorage بطبيعته خاص بكل جهاز/متصفح، لذا الترتيب لا يُشارَك بين الأجهزة.
 * - نضيف معرّف جهاز (`deviceId`) ضمن المفتاح للحماية من تداخل لو شُورك المتصفح،
 *   ولتسهيل التتبع/الترحيل لاحقاً.
 *
 * صيغة المفتاح: `neobilling:toolbar:v1:<deviceId>:<screenKey>`
 * المفتاح القديم (للتوافق الخلفي): `toolbar-order:<screenKey>`
 */

const PREFIX = "neobilling:toolbar:v1";
const LEGACY_PREFIX = "toolbar-order:";
const DEVICE_KEY = "neobilling:device-id";

function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      const rand =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      id = rand;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function buildKey(screenKey: string): string {
  return `${PREFIX}:${getDeviceId()}:${screenKey}`;
}

function legacyKey(screenKey: string): string {
  return `${LEGACY_PREFIX}${screenKey}`;
}

function readOrder(screenKey: string, defaults: string[]): string[] {
  try {
    const newKey = buildKey(screenKey);
    let raw = localStorage.getItem(newKey);

    // ترحيل من المفتاح القديم إن وُجد
    if (!raw) {
      const oldKey = legacyKey(screenKey);
      const legacy = localStorage.getItem(oldKey);
      if (legacy) {
        raw = legacy;
        try {
          localStorage.setItem(newKey, legacy);
          localStorage.removeItem(oldKey);
        } catch {
          /* noop */
        }
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
    localStorage.removeItem(legacyKey(screenKey));
  } catch {
    /* noop */
  }
}

export function useToolbarOrder(screenKey: string, defaultIds: string[]) {
  const defaultsRef = useRef(defaultIds);
  defaultsRef.current = defaultIds;

  const [order, setOrderState] = useState<string[]>(() => {
    const saved = readOrder(screenKey, defaultIds);
    const missing = defaultIds.filter((id) => !saved.includes(id));
    return [...saved, ...missing];
  });
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    setOrderState((prev) => {
      const missing = defaultIds.filter((id) => !prev.includes(id));
      if (missing.length === 0) return prev;
      const next = [...prev, ...missing];
      writeOrder(screenKey, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultIds.join("|")]);

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
