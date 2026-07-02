import { useCallback, useEffect, useRef, useState } from "react";

/**
 * اختصار المسطرة (Space) في جدول البنود:
 *
 * وضع "التنقّل" (افتراضي بعد Focus): Space يُحدِّد/يحذف الصف.
 * وضع "التحرير": بعد ضغط Enter داخل الحقل، أو نقر بالماوس لوضع المؤشر،
 *                 يعمل Space كمسطرة عادية ولا يُفعّل التحديد.
 * الخروج من وضع التحرير: مغادرة الحقل (blur) أو Escape أو Tab/Arrow.
 */
const DOUBLE_PRESS_WINDOW_MS = 250;

// عناصر الإدخال التي دخلت "وضع التحرير" (Enter أو نقر بالماوس)
const editingElements = new WeakSet<HTMLElement>();

function isEditing(el: HTMLElement | null): boolean {
  return !!el && editingElements.has(el);
}

// مُستمِعات عالمية لضبط وضع التحرير — تُسجَّل مرّة واحدة.
if (typeof window !== "undefined" && !(window as any).__spaceEditingHooked) {
  (window as any).__spaceEditingHooked = true;

  // Enter داخل حقل نصّي → ادخل وضع التحرير
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter") return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag === "TEXTAREA" || (t as HTMLElement).isContentEditable) {
        editingElements.add(t);
        return;
      }
      if (tag === "INPUT") {
        const type = ((t as HTMLInputElement).type || "text").toLowerCase();
        const textLike = ["text", "search", "email", "tel", "url", "password"];
        if (textLike.includes(type)) editingElements.add(t);
      }
    },
    true,
  );

  // نقر بالماوس داخل حقل نصّي → ادخل وضع التحرير
  window.addEventListener(
    "mousedown",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag === "TEXTAREA" || t.isContentEditable) {
        editingElements.add(t);
        return;
      }
      if (tag === "INPUT") {
        const type = ((t as HTMLInputElement).type || "text").toLowerCase();
        const textLike = ["text", "search", "email", "tel", "url", "password"];
        if (textLike.includes(type)) editingElements.add(t);
      }
    },
    true,
  );

  // Tab / السهم / Escape → خروج من وضع التحرير
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        e.key === "Tab" ||
        e.key === "Escape" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        const t = e.target as HTMLElement | null;
        if (t) editingElements.delete(t);
      }
    },
    true,
  );

  // مغادرة الحقل تُنهي وضع التحرير
  window.addEventListener(
    "blur",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (t) editingElements.delete(t);
    },
    true,
  );
}


export function useSpaceToDelete(onDelete: (uid: string) => void | Promise<void>) {
  const [pendingUids, setPendingUids] = useState<Set<string>>(() => new Set());
  const pendingRef = useRef<Set<string>>(new Set());
  const lastPressUidRef = useRef<string | null>(null);
  const lastPressAtRef = useRef<number>(0);

  useEffect(() => {
    pendingRef.current = pendingUids;
  }, [pendingUids]);

  const isPending = useCallback(
    (uid: string) => pendingUids.has(uid),
    [pendingUids],
  );

  const handleRowKeyDown = useCallback(
    (uid: string, e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pendingRef.current.size > 0) {
          setPendingUids(new Set());
          lastPressUidRef.current = null;
        }
        return;
      }
      if (e.key !== " " && e.code !== "Space") return;

      const t = e.target as HTMLElement;
      const tag = t.tagName;

      // منطق الحقول النصية:
      // - إذا كان المؤشر داخل النص (المستخدم نقر لتعديل) → اترك Space يكتب مسافة.
      // - إذا كان الحقل مُركَّزاً حديثاً عبر التنقل (النص كله محدَّد أو فارغ) → Space يُحدِّد الصف.
      if (tag === "TEXTAREA" || t.isContentEditable) {
        // في textarea/contentEditable لا نستطيع الجزم بسهولة → اترك السلوك الطبيعي دائماً.
        return;
      }
      if (tag === "INPUT") {
        const input = t as HTMLInputElement;
        const type = (input.type || "text").toLowerCase();
        const textLike = ["text", "search", "email", "tel", "url", "password"];
        if (textLike.includes(type)) {
          const val = input.value ?? "";
          const start = input.selectionStart ?? 0;
          const end = input.selectionEnd ?? 0;
          const fullySelected = val.length > 0 && start === 0 && end === val.length;
          const emptyField = val.length === 0;
          // مؤشر كتابة نشط (نقر لتعديل) → اترك المسطرة تكتب مسافة
          if (!fullySelected && !emptyField) return;
          // خلاف ذلك (تنقل عبر Tab/Arrow → النص كله محدد) → استمرّ لتحديد الصف
        }
      }


      const isInput = tag === "INPUT" || tag === "SELECT";
      if (!isInput) return;

      // موحَّد لحقول رقمية/اختيار: Space يُحدِّد فقط، لا يكتب ولا يغيّر القيمة.
      e.preventDefault();

      const now = Date.now();
      const isDoublePress =
        lastPressUidRef.current === uid &&
        now - lastPressAtRef.current <= DOUBLE_PRESS_WINDOW_MS;

      if (isDoublePress) {
        // ضغطتان متتاليتان على نفس الصف → احذف كل المحددين (مع ضمان تضمين هذا الصف)
        const uidsToDelete = new Set(pendingRef.current);
        uidsToDelete.add(uid);

        // احفظ موقع الصف الحالي لنقل التركيز لاحقاً
        const rowEl = t.closest("[data-nav-row]") as HTMLElement | null;
        const tableName = rowEl?.getAttribute("data-nav-table") || null;
        const rowIdx = rowEl
          ? parseInt(rowEl.getAttribute("data-nav-row") || "-1", 10)
          : -1;

        setPendingUids(new Set());
        lastPressUidRef.current = null;
        lastPressAtRef.current = 0;

        // نفّذ الحذف بالتسلسل
        const runDeletes = async () => {
          for (const u of uidsToDelete) {
            try {
              await Promise.resolve(onDelete(u));
            } catch {
              /* تجاهل */
            }
          }
        };

        runDeletes().then(() => {
          if (rowIdx < 0 || !tableName) return;
          window.setTimeout(() => {
            const sel = (r: number) =>
              document.querySelector<HTMLElement>(
                `[data-nav-table="${tableName}"][data-nav-row="${r}"][data-nav-col="product"]`,
              );
            // ابحث عن أول صف موجود بدءاً من نفس الفهرس ثم تنازلياً
            let target: HTMLElement | null = null;
            for (let r = rowIdx; r >= 0 && !target; r--) {
              target = sel(r);
            }
            if (!target) {
              // لا توجد صفوف → اذهب إلى Quick Add
              target = document.querySelector<HTMLElement>(
                `.quick-add-row [data-nav-col="product"]`,
              );
            }
            if (target) {
              target.focus();
              if (target instanceof HTMLInputElement) target.select();
            }
          }, 30);
        });
        return;
      }

      // غير ضغطة مزدوجة → Toggle لذلك الصف
      setPendingUids((prev) => {
        const next = new Set(prev);
        if (next.has(uid)) {
          next.delete(uid);
        } else {
          next.add(uid);
        }
        return next;
      });
      lastPressUidRef.current = uid;
      lastPressAtRef.current = now;
    },
    [onDelete],
  );

  const clear = useCallback(() => {
    setPendingUids(new Set());
    lastPressUidRef.current = null;
    lastPressAtRef.current = 0;
  }, []);

  return { pendingUids, isPending, handleRowKeyDown, clear };
}
