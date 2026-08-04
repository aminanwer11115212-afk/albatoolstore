import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFormFactor, type FormFactor } from "@/hooks/useFormFactor";

/**
 * تفضيلات أعمدة أيّ جدول إدارة، لكل مستخدم × شكل الجهاز.
 *
 * ## لماذا عامّة
 * كانت هذه المنظومة مكتوبةً لصفحة العملاء وحدها. ولمّا طُلب الشيءُ نفسه في
 * صفحة المنتجات كان أمامنا نسخُها — وهو النمط الذي كرّر أعطال هذا المشروع:
 * يُصلَح موضعٌ ويبقى الآخر. فاستُخرج المنطق هنا، وصارت صفحة العملاء غلافاً
 * فوقه لا نسخةً منه.
 *
 * تشمل:
 *   - ترتيب الأعمدة الوسطى.
 *   - قائمة الأعمدة المخفية.
 *
 * تُحفظ في localStorage بمفاتيح منفصلة لكل form-factor:
 *   lov:u:{uid}:ff:{mobile|desktop}:{screen}:cols
 *
 * التبديل بين الموبايل وسطح المكتب في نفس الجلسة يقرأ الدلو المناسب فوراً،
 * ولا يخلط تفضيلات جهاز بآخر أبداً.
 *
 * الأعمدة الطرفية (# للفهرس + الإعدادات) ثابتة ولا تُخفى ولا تُنقل.
 */

export interface TableColsConfig<K extends string> {
  /** اسم الشاشة في مفتاح التخزين — مثل "customers" أو "products" */
  screen: string;
  /** كل المفاتيح القابلة للتخصيص بترتيبها الافتراضي */
  keys: readonly K[];
  /** تسميةٌ عربية لكل مفتاح */
  labels: Record<K, string>;
  /** مفاتيح تخزينٍ قديمة تُرقَّى بصمت عند غياب الحالي */
  legacyKeys?: (uid: string) => string[];
  /** معرّف التوست — يمنع تكدّس إشعارات شاشتين */
  toastId?: string;
}

type Prefs<K extends string> = { order: K[]; hidden: K[] };

export function tableColsStorageKey(screen: string, uid: string, ff: FormFactor): string {
  return `lov:u:${uid}:ff:${ff}:${screen}:cols`;
}

export function useTableColsPref<K extends string>(config: TableColsConfig<K>) {
  const { screen, keys, labels, legacyKeys, toastId = `${config.screen}-cols-saved` } = config;
  const ff = useFormFactor();
  const [uid, setUid] = useState<string>("guest");

  const sanitize = useCallback((raw: any): Prefs<K> => {
    const order = Array.isArray(raw?.order)
      ? (raw.order.filter((k: any) => (keys as readonly string[]).includes(k)) as K[])
      : [];
    const seen = new Set<K>();
    const dedupOrder = order.filter((k) => (seen.has(k) ? false : (seen.add(k), true)));
    const missing = (keys as readonly K[]).filter((k) => !seen.has(k));
    const hidden = Array.isArray(raw?.hidden)
      ? (raw.hidden.filter((k: any) => (keys as readonly string[]).includes(k)) as K[])
      : [];
    return { order: [...dedupOrder, ...missing], hidden };
  }, [keys]);

  const tryReadKey = useCallback((key: string): Prefs<K> | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return sanitize(JSON.parse(raw));
    } catch {
      return null;
    }
  }, [sanitize]);

  /**
   * ترقية صامتة: إن لم يكن هناك تفضيل تحت المفتاح الجديد، نبحث عن أوّل قيمة
   * صالحة في المفاتيح القديمة ونكتبها تحته. ولا نلمس القيمة القديمة — توافقٌ
   * رجعيّ مع كودٍ قد يقرأها.
   */
  const readPrefs = useCallback((u: string, f: FormFactor): Prefs<K> => {
    const newKey = tableColsStorageKey(screen, u, f);
    try {
      if (localStorage.getItem(newKey) == null && legacyKeys) {
        for (const legacy of legacyKeys(u)) {
          const val = tryReadKey(legacy);
          if (val) {
            try { localStorage.setItem(newKey, JSON.stringify(val)); } catch { /* quota */ }
            return val;
          }
        }
      }
    } catch { /* ignore */ }
    return tryReadKey(newKey) || { order: [...(keys as readonly K[])], hidden: [] };
  }, [screen, keys, legacyKeys, tryReadKey]);

  const [prefs, setPrefs] = useState<Prefs<K>>(() => readPrefs("guest", ff));

  const writePrefs = useCallback((u: string, f: FormFactor, p: Prefs<K>) => {
    try { localStorage.setItem(tableColsStorageKey(screen, u, f), JSON.stringify(p)); } catch { /* ignore */ }
  }, [screen]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setUid(data?.user?.id || "guest");
    });
    return () => { cancelled = true; };
  }, []);

  // إعادة القراءة عند تغيّر المستخدم أو شكل الجهاز → لا تختلط الدلاء.
  useEffect(() => { setPrefs(readPrefs(uid, ff)); }, [uid, ff, readPrefs]);

  // توست مُجمَّع: إشعار «تم الحفظ» واحد بعد 400ms من آخر تعديل — يمنع فيضان
  // الإشعارات أثناء السحب أو التبديل السريع.
  const toastTimerRef = useRef<number | null>(null);
  const suppressToastRef = useRef(false);
  const flashSavedToast = useCallback((msg = "تم حفظ تفضيلات الأعمدة") => {
    if (suppressToastRef.current) return;
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      toast.success(msg, {
        id: toastId,
        description: ff === "mobile" ? "على هذا الموبايل فقط" : "على سطح المكتب فقط",
      });
    }, 400);
  }, [ff, toastId]);
  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  const commit = useCallback((mutate: (cur: Prefs<K>) => Prefs<K> | null) => {
    setPrefs((cur) => {
      const next = mutate(cur);
      if (!next) return cur;
      writePrefs(uid, ff, next);
      return next;
    });
  }, [uid, ff, writePrefs]);

  const persist = useCallback((next: Prefs<K>) => {
    setPrefs(next);
    writePrefs(uid, ff, next);
    flashSavedToast();
  }, [uid, ff, writePrefs, flashSavedToast]);

  const moveUp = useCallback((key: K) => {
    commit((cur) => {
      const idx = cur.order.indexOf(key);
      if (idx <= 0) return null;
      const next = [...cur.order];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      flashSavedToast();
      return { ...cur, order: next };
    });
  }, [commit, flashSavedToast]);

  const moveDown = useCallback((key: K) => {
    commit((cur) => {
      const idx = cur.order.indexOf(key);
      if (idx < 0 || idx >= cur.order.length - 1) return null;
      const next = [...cur.order];
      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      flashSavedToast();
      return { ...cur, order: next };
    });
  }, [commit, flashSavedToast]);

  const moveToEnd = useCallback((key: K) => {
    commit((cur) => {
      const idx = cur.order.indexOf(key);
      if (idx < 0 || idx === cur.order.length - 1) return null;
      const next = cur.order.filter((k) => k !== key);
      next.push(key);
      flashSavedToast();
      return { ...cur, order: next };
    });
  }, [commit, flashSavedToast]);

  /** سحب وإفلات: انقل `sourceKey` إلى موضع `targetKey` — قبله أو بعده. */
  const reorder = useCallback((sourceKey: K, targetKey: K, before = true) => {
    if (sourceKey === targetKey) return;
    commit((cur) => {
      const without = cur.order.filter((k) => k !== sourceKey);
      const targetIdx = without.indexOf(targetKey);
      if (targetIdx < 0) return null;
      const insertAt = before ? targetIdx : targetIdx + 1;
      flashSavedToast();
      return { ...cur, order: [...without.slice(0, insertAt), sourceKey, ...without.slice(insertAt)] };
    });
  }, [commit, flashSavedToast]);

  const toggleHidden = useCallback((key: K) => {
    commit((cur) => {
      const has = cur.hidden.includes(key);
      flashSavedToast(has ? "تم إظهار العمود" : "تم إخفاء العمود");
      return { ...cur, hidden: has ? cur.hidden.filter((k) => k !== key) : [...cur.hidden, key] };
    });
  }, [commit, flashSavedToast]);

  /** الحالة الافتراضية: كل الأعمدة ظاهرة بالترتيب الأصلي — لهذا الجهاز وحده. */
  const reset = useCallback(() => {
    suppressToastRef.current = true;
    persist({ order: [...(keys as readonly K[])], hidden: [] });
    suppressToastRef.current = false;
    toast.success("تمت إعادة تعيين تفضيلات الأعمدة", {
      id: `${screen}-cols-reset`,
      description: ff === "mobile" ? "على هذا الموبايل فقط" : "على سطح المكتب فقط",
    });
  }, [persist, ff, keys, screen]);

  const visibleOrder = useMemo(
    () => prefs.order.filter((k) => !prefs.hidden.includes(k)),
    [prefs.order, prefs.hidden],
  );

  const isHidden = useCallback((key: K) => prefs.hidden.includes(key), [prefs.hidden]);

  return {
    formFactor: ff,
    keys,
    labels,
    order: prefs.order,
    hidden: prefs.hidden,
    visibleOrder,
    isHidden,
    moveUp,
    moveDown,
    moveToEnd,
    reorder,
    toggleHidden,
    reset,
  };
}

export type TableColsPref<K extends string> = ReturnType<typeof useTableColsPref<K>>;
