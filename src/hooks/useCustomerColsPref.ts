import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFormFactor, type FormFactor } from "@/hooks/useFormFactor";

/**
 * تفضيلات أعمدة صفحة إدارة العملاء لكل مستخدم × شكل الجهاز.
 *
 * تشمل:
 *   - ترتيب الأعمدة الوسطى (10 أعمدة قابلة للتخصيص).
 *   - قائمة الأعمدة المخفية.
 *
 * تُحفظ في localStorage بمفاتيح منفصلة لكل form-factor:
 *   lov:u:{uid}:ff:mobile:customers:cols
 *   lov:u:{uid}:ff:desktop:customers:cols
 *
 * التبديل بين الموبايل وسطح المكتب في نفس الجلسة يقرأ الدلو المناسب فورًا،
 * ولا يخلط تفضيلات جهاز بآخر أبدًا. يتم ذلك عبر مراقبة `useFormFactor`.
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

export function customerColsStorageKey(uid: string, ff: FormFactor): string {
  return `lov:u:${uid}:ff:${ff}:customers:cols`;
}

/**
 * مفاتيح قديمة يمكن أن تحتوي على تفضيلات المستخدم قبل الفصل بين
 * الموبايل والديسكتوب. عند غياب المفتاح الحالي، نُرقّي أول قيمة صالحة
 * منها بصمت — دون حذف الأصل لتظل قابلة للاستعادة.
 */
function legacyKeyCandidates(uid: string): string[] {
  return [
    `lov:u:${uid}:customers:cols`,
    `lov:u:${uid}:legacy:customers:cols`,
    `customers:cols`,
    `lov:customers:cols`,
  ];
}

function sanitize(raw: any): Prefs {
  const order = Array.isArray(raw?.order)
    ? (raw.order.filter((k: any) => CUSTOMERS_MIDDLE_KEYS.includes(k)) as CustomerColKey[])
    : [];
  const seen = new Set<CustomerColKey>();
  const dedupOrder = order.filter((k) => (seen.has(k) ? false : (seen.add(k), true)));
  const missing = CUSTOMERS_MIDDLE_KEYS.filter((k) => !seen.has(k));
  const fullOrder = [...dedupOrder, ...missing];
  const hidden = Array.isArray(raw?.hidden)
    ? (raw.hidden.filter((k: any) => CUSTOMERS_MIDDLE_KEYS.includes(k)) as CustomerColKey[])
    : [];
  return { order: fullOrder, hidden };
}

function tryReadKey(key: string): Prefs | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return sanitize(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * ترقية صامتة: إن لم يكن هناك تفضيل تحت المفتاح الجديد، نبحث عن أول
 * قيمة صالحة في المفاتيح القديمة ونكتبها تحت المفتاح الجديد. لا نلمس
 * القيمة القديمة (توافق رجوعي مع كود قد يقرأها لاحقاً).
 */
function migrateLegacyIfNeeded(uid: string, ff: FormFactor): Prefs | null {
  const newKey = customerColsStorageKey(uid, ff);
  if (localStorage.getItem(newKey) != null) return null;
  for (const legacy of legacyKeyCandidates(uid)) {
    const val = tryReadKey(legacy);
    if (val) {
      try {
        localStorage.setItem(newKey, JSON.stringify(val));
      } catch {
        /* ignore quota */
      }
      return val;
    }
  }
  return null;
}

function readPrefs(uid: string, ff: FormFactor): Prefs {
  const migrated = (() => {
    try { return migrateLegacyIfNeeded(uid, ff); } catch { return null; }
  })();
  if (migrated) return migrated;
  const direct = tryReadKey(customerColsStorageKey(uid, ff));
  if (direct) return direct;
  return { order: [...DEFAULT_ORDER], hidden: [] };
}

function writePrefs(uid: string, ff: FormFactor, prefs: Prefs) {
  try {
    localStorage.setItem(customerColsStorageKey(uid, ff), JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function useCustomerColsPref() {
  const ff = useFormFactor();
  const [uid, setUid] = useState<string>("guest");
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs("guest", ff));

  // Load uid once.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const id = data?.user?.id || "guest";
      setUid(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-read prefs whenever uid or form-factor changes → mobile/desktop
  // buckets never bleed into each other during a live viewport resize.
  useEffect(() => {
    setPrefs(readPrefs(uid, ff));
  }, [uid, ff]);

  // Toast مُجمَّع: أي تغيير على التفضيلات يُظهر إشعار «تم الحفظ» واحد بعد
  // 400ms من آخر تعديل — يمنع فيضان الإشعارات أثناء السحب/التبديل السريع.
  const toastTimerRef = useRef<number | null>(null);
  const suppressToastRef = useRef(false);
  const flashSavedToast = useCallback((msg = "تم حفظ تفضيلات الأعمدة") => {
    if (suppressToastRef.current) return;
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      toast.success(msg, {
        id: "customer-cols-saved",
        description: ff === "mobile" ? "على هذا الموبايل فقط" : "على سطح المكتب فقط",
      });
    }, 400);
  }, [ff]);
  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  const persist = useCallback(
    (next: Prefs) => {
      setPrefs(next);
      writePrefs(uid, ff, next);
      flashSavedToast();
    },
    [uid, ff, flashSavedToast],
  );

  const moveUp = useCallback((key: CustomerColKey) => {
    setPrefs((cur) => {
      const idx = cur.order.indexOf(key);
      if (idx <= 0) return cur;
      const next = [...cur.order];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      const nextPrefs = { ...cur, order: next };
      writePrefs(uid, ff, nextPrefs);
      flashSavedToast();
      return nextPrefs;
    });
  }, [uid, ff, flashSavedToast]);

  const moveDown = useCallback((key: CustomerColKey) => {
    setPrefs((cur) => {
      const idx = cur.order.indexOf(key);
      if (idx < 0 || idx >= cur.order.length - 1) return cur;
      const next = [...cur.order];
      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      const nextPrefs = { ...cur, order: next };
      writePrefs(uid, ff, nextPrefs);
      flashSavedToast();
      return nextPrefs;
    });
  }, [uid, ff, flashSavedToast]);

  const moveToEnd = useCallback((key: CustomerColKey) => {
    setPrefs((cur) => {
      const idx = cur.order.indexOf(key);
      if (idx < 0 || idx === cur.order.length - 1) return cur;
      const next = cur.order.filter((k) => k !== key);
      next.push(key);
      const nextPrefs = { ...cur, order: next };
      writePrefs(uid, ff, nextPrefs);
      flashSavedToast();
      return nextPrefs;
    });
  }, [uid, ff, flashSavedToast]);

  /**
   * إعادة ترتيب بسحب/إفلات: انقل `sourceKey` إلى موضع `targetKey`.
   * إذا `before=true` يوضع قبل الهدف، وإلا بعده.
   */
  const reorder = useCallback((sourceKey: CustomerColKey, targetKey: CustomerColKey, before = true) => {
    if (sourceKey === targetKey) return;
    setPrefs((cur) => {
      const without = cur.order.filter((k) => k !== sourceKey);
      const targetIdx = without.indexOf(targetKey);
      if (targetIdx < 0) return cur;
      const insertAt = before ? targetIdx : targetIdx + 1;
      const next = [...without.slice(0, insertAt), sourceKey, ...without.slice(insertAt)];
      const nextPrefs = { ...cur, order: next };
      writePrefs(uid, ff, nextPrefs);
      flashSavedToast();
      return nextPrefs;
    });
  }, [uid, ff, flashSavedToast]);

  const toggleHidden = useCallback((key: CustomerColKey) => {
    setPrefs((cur) => {
      const has = cur.hidden.includes(key);
      const hidden = has ? cur.hidden.filter((k) => k !== key) : [...cur.hidden, key];
      const nextPrefs = { ...cur, hidden };
      writePrefs(uid, ff, nextPrefs);
      flashSavedToast(has ? "تم إظهار العمود" : "تم إخفاء العمود");
      return nextPrefs;
    });
  }, [uid, ff, flashSavedToast]);

  /**
   * إعادة التعيين للحالة الافتراضية: كل الأعمدة ظاهرة بالترتيب الأصلي —
   * فقط للـ form-factor الحالي، بحيث لا نمس تفضيلات الجهاز الآخر.
   */
  const reset = useCallback(() => {
    // اكتم الـtoast الافتراضي من `persist` واعرض توست إعادة الضبط بدلاً منه.
    suppressToastRef.current = true;
    persist({ order: [...DEFAULT_ORDER], hidden: [] });
    suppressToastRef.current = false;
    toast.success("تمت إعادة تعيين تفضيلات الأعمدة", {
      id: "customer-cols-reset",
      description: ff === "mobile" ? "على هذا الموبايل فقط" : "على سطح المكتب فقط",
    });
  }, [persist, ff]);

  const visibleOrder = useMemo(
    () => prefs.order.filter((k) => !prefs.hidden.includes(k)),
    [prefs.order, prefs.hidden],
  );

  return {
    formFactor: ff,
    order: prefs.order,
    hidden: prefs.hidden,
    visibleOrder,
    moveUp,
    moveDown,
    moveToEnd,
    reorder,
    toggleHidden,
    reset,
  };
}
