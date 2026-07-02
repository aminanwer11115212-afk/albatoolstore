import { useCallback, useEffect, useRef, useState } from "react";

/**
 * اختصار المسطرة (Space) لتحديد متعدد للصفوف ثم حذفها دفعة واحدة:
 * - الضغطة على صف غير محدد: تُضيفه إلى مجموعة المحددين.
 * - الضغطة على صف آخر: تُضاف أيضاً (تحديد متعدد).
 * - ضغطتان سريعتان جداً ("ططق" خلال 250ms) على نفس الصف: تحذف كل المحددين.
 * - أي ضغطة بطيئة على صف محدد: تُلغي تحديده فقط (Toggle).
 * - Esc: يمسح كل التحديدات.
 */
const DOUBLE_PRESS_WINDOW_MS = 250;

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

      // إذا كان الحقل نصياً (text/search/email/tel/url/textarea) أو contentEditable
      // → اترك المسطرة تعمل بشكل طبيعي (كتابة مسافة) ولا تُفعّل تحديد الصف.
      if (tag === "TEXTAREA" || t.isContentEditable) return;
      if (tag === "INPUT") {
        const type = ((t as HTMLInputElement).type || "text").toLowerCase();
        const textLike = ["text", "search", "email", "tel", "url", "password"];
        if (textLike.includes(type)) return;
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
