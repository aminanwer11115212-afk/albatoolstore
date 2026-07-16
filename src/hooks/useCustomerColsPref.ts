import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getFormFactorSync } from "@/hooks/useFormFactor";

/**
 * تفضيلات أعمدة صفحة إدارة العملاء لكل مستخدم × شكل الجهاز.
 *
 * تشمل:
 *   - ترتيب الأعمدة الوسطى (10 أعمدة قابلة للتخصيص).
 *   - قائمة الأعمدة المخفية.
 *
 * تُحفظ في localStorage بالمفتاح:
 *   lov:u:{uid}:ff:{mobile|desktop}:customers:cols
 *
 * الأعمدة الطرفية (# للفهرس + الإعدادات) ثابتة ولا يمكن إخفاؤها أو نقلها.
 */

export const CUSTOMERS_MIDDLE_KEYS = [
  "name",
  "address",
  "phone",
  "region",
  "state",
  "city",
  "locality",
  "group",
  "transporter",
  "destination",
] as const;

export type CustomerColKey = (typeof CUSTOMERS_MIDDLE_KEYS)[number];

export const CUSTOMERS_COL_LABELS: Record<CustomerColKey, string> = {
  name: "اسم العميل",
  address: "العنوان",
  phone: "واتساب / الهاتف",
  region: "الاتجاه",
  state: "الولاية",
  city: "المدينة",
  locality: "المحلية",
  group: "المجموعة",
  transporter: "الترحيلات",
  destination: "الوجهة",
};

const DEFAULT_ORDER = [...CUSTOMERS_MIDDLE_KEYS];

type Prefs = { order: CustomerColKey[]; hidden: CustomerColKey[] };

const DEFAULTS: Prefs = { order: [...DEFAULT_ORDER], hidden: [] };

function storageKey(uid: string): string {
  const ff = getFormFactorSync();
  return `lov:u:${uid}:ff:${ff}:customers:cols`;
}

function sanitize(raw: any): Prefs {
  const order = Array.isArray(raw?.order)
    ? (raw.order.filter((k: any) => CUSTOMERS_MIDDLE_KEYS.includes(k)) as CustomerColKey[])
    : [];
  const missing = CUSTOMERS_MIDDLE_KEYS.filter((k) => !order.includes(k));
  const fullOrder = [...order, ...missing];
  const hidden = Array.isArray(raw?.hidden)
    ? (raw.hidden.filter((k: any) => CUSTOMERS_MIDDLE_KEYS.includes(k)) as CustomerColKey[])
    : [];
  return { order: fullOrder, hidden };
}

function readPrefs(uid: string): Prefs {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return { ...DEFAULTS, order: [...DEFAULT_ORDER] };
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS, order: [...DEFAULT_ORDER] };
  }
}

function writePrefs(uid: string, prefs: Prefs) {
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function useCustomerColsPref() {
  const [uid, setUid] = useState<string>("guest");
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs("guest"));

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const id = data?.user?.id || "guest";
      setUid(id);
      setPrefs(readPrefs(id));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    (next: Prefs) => {
      setPrefs(next);
      writePrefs(uid, next);
    },
    [uid],
  );

  const moveUp = useCallback(
    (key: CustomerColKey) => {
      setPrefs((cur) => {
        const idx = cur.order.indexOf(key);
        if (idx <= 0) return cur;
        const next = [...cur.order];
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        const nextPrefs = { ...cur, order: next };
        writePrefs(uid, nextPrefs);
        return nextPrefs;
      });
    },
    [uid],
  );

  const moveDown = useCallback(
    (key: CustomerColKey) => {
      setPrefs((cur) => {
        const idx = cur.order.indexOf(key);
        if (idx < 0 || idx >= cur.order.length - 1) return cur;
        const next = [...cur.order];
        [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
        const nextPrefs = { ...cur, order: next };
        writePrefs(uid, nextPrefs);
        return nextPrefs;
      });
    },
    [uid],
  );

  const moveToEnd = useCallback(
    (key: CustomerColKey) => {
      setPrefs((cur) => {
        const idx = cur.order.indexOf(key);
        if (idx < 0 || idx === cur.order.length - 1) return cur;
        const next = cur.order.filter((k) => k !== key);
        next.push(key);
        const nextPrefs = { ...cur, order: next };
        writePrefs(uid, nextPrefs);
        return nextPrefs;
      });
    },
    [uid],
  );

  const toggleHidden = useCallback(
    (key: CustomerColKey) => {
      setPrefs((cur) => {
        const has = cur.hidden.includes(key);
        const hidden = has ? cur.hidden.filter((k) => k !== key) : [...cur.hidden, key];
        const nextPrefs = { ...cur, hidden };
        writePrefs(uid, nextPrefs);
        return nextPrefs;
      });
    },
    [uid],
  );

  const reset = useCallback(() => {
    persist({ order: [...DEFAULT_ORDER], hidden: [] });
  }, [persist]);

  const visibleOrder = prefs.order.filter((k) => !prefs.hidden.includes(k));

  return {
    order: prefs.order,
    hidden: prefs.hidden,
    visibleOrder,
    moveUp,
    moveDown,
    moveToEnd,
    toggleHidden,
    reset,
  };
}
