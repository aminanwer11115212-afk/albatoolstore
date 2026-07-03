import { useCallback, useEffect, useRef, useState } from "react";

/**
 * تحديد/حذف صفوف جدول البنود عبر مفتاح Shift:
 *
 * - ضغط Shift مرة (بدون أي مفتاح آخر بينها وبين الإفلات) وأنت على صف
 *   → تُبدَّل حالة تحديد ذلك الصف.
 * - ضغطتان متتاليتان على Shift خلال 350ms
 *   → تحذف كل الصفوف المحدَّدة.
 * - Escape → يمسح كل التحديدات.
 *
 * لا يتعارض مع Space/Enter/الأسهم/الكتابة: هذه المفاتيح إن ضُغطت بين
 * ضغطتَي Shift تُلوّث الضغطة فلا تُحسب كنقرة تحديد.
 *
 * التوقيع محفوظ لتوافق الصفحات: isPending / handleRowKeyDown.
 * الصفحات يجب أن تضع data-row-uid على عنصر <tr> لكل صف.
 */
const DOUBLE_SHIFT_WINDOW_MS = 350;

export function useSpaceToDelete(onDelete: (uid: string) => void | Promise<void>) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectedRef = useRef<Set<string>>(new Set());
  const pollutedRef = useRef(false);
  const shiftDownAtRef = useRef<number>(0);
  const lastShiftTapAtRef = useRef<number>(0);
  const onDeleteRef = useRef(onDelete);

  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const focusedRowUid = (): string | null => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const row = el.closest("[data-row-uid]") as HTMLElement | null;
    return row?.getAttribute("data-row-uid") || null;
  };

  const runDelete = useCallback(async () => {
    const uids = Array.from(selectedRef.current);
    if (uids.length === 0) return;

    // احفظ موقع أوّل صف محدَّد لنقل التركيز بعد الحذف.
    const firstUid = uids[0];
    const firstRow = document.querySelector<HTMLElement>(
      `[data-row-uid="${firstUid}"]`,
    );
    const tableName = firstRow?.getAttribute("data-nav-table")
      || firstRow?.querySelector("[data-nav-table]")?.getAttribute("data-nav-table")
      || null;
    const rowIdx = firstRow
      ? parseInt(firstRow.getAttribute("data-nav-row") || "-1", 10)
      : -1;

    setSelected(new Set());
    for (const u of uids) {
      try { await Promise.resolve(onDeleteRef.current(u)); } catch { /* ignore */ }
    }
    if (rowIdx >= 0 && tableName) {
      window.setTimeout(() => {
        const sel = (r: number) => document.querySelector<HTMLElement>(
          `[data-nav-table="${tableName}"][data-nav-row="${r}"][data-nav-col="product"]`,
        );
        let next: HTMLElement | null = null;
        for (let r = rowIdx; r >= 0 && !next; r--) next = sel(r);
        if (!next) next = document.querySelector<HTMLElement>(
          `.quick-add-row [data-nav-col="product"]`,
        );
        next?.focus();
      }, 30);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedRef.current.size > 0) setSelected(new Set());
        return;
      }
      if (e.key === "Shift") {
        if (!e.repeat) {
          shiftDownAtRef.current = Date.now();
          pollutedRef.current = false;
        }
        return;
      }
      // أي مفتاح آخر يُلوّث ضغطة Shift الحالية.
      pollutedRef.current = true;
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Shift") return;
      const held = Date.now() - shiftDownAtRef.current;
      // إن كان Shift مضغوطاً كمُعدِّل مع مفتاح آخر، لا تعتبره نقرة.
      if (pollutedRef.current || held > 600) {
        pollutedRef.current = false;
        return;
      }
      const uid = focusedRowUid();
      const now = Date.now();
      const isDoubleTap = now - lastShiftTapAtRef.current <= DOUBLE_SHIFT_WINDOW_MS;
      lastShiftTapAtRef.current = now;

      if (isDoubleTap) {
        // احذف كل المحدَّدين (مع تضمين الصف الحالي إن وُجد).
        if (uid) {
          setSelected((prev) => {
            const next = new Set(prev);
            next.add(uid);
            selectedRef.current = next;
            return next;
          });
        }
        // نفّذ الحذف بعد تحديث الحالة.
        setTimeout(() => { void runDelete(); }, 0);
        lastShiftTapAtRef.current = 0;
        return;
      }

      // نقرة مفردة → بدّل تحديد الصف الحالي.
      if (!uid) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(uid)) next.delete(uid); else next.add(uid);
        return next;
      });
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [runDelete]);

  const isPending = useCallback((uid: string) => selected.has(uid), [selected]);

  // handleRowKeyDown محفوظ للتوافق فقط — الحذف يُدار عبر Shift عالمياً.
  const handleRowKeyDown = useCallback(
    (_uid: string, _e: React.KeyboardEvent) => { /* no-op */ },
    [],
  );

  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    pendingUids: selected,
    isPending,
    handleRowKeyDown,
    clear,
  };
}
