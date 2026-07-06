import { useCallback, useEffect, useRef, useState } from "react";

/**
 * تحديد/حذف صفوف جدول البنود عبر مفتاح Space في وضع التنقّل:
 *
 * - وضع التنقّل (افتراضي عند وصول التركيز بالكيبورد): ضغطة Space مفردة
 *   تُبدِّل حالة تحديد الصف الذي تركّز فيه (data-row-uid).
 * - ضغطتان متتاليتان على Space خلال 350ms → تحذف كل المحدَّدين.
 * - Escape → يمسح كل التحديدات.
 *
 * وضع التعديل (بعد نقر ماوس على الحقل — يُدار في `spaceColumnNav.ts`)
 * يُعطّل هذا السلوك بالكامل: Space يكتب مسافة عادية، ولا تحديد.
 *
 * الصفحات يجب أن تضع data-row-uid على عنصر <tr> لكل صف.
 * التوقيع محفوظ: isPending / handleRowKeyDown / pendingUids / clear.
 */
const DOUBLE_TAP_WINDOW_MS = 350;

function isNavModeCell(el: Element | null): boolean {
  if (!el) return false;
  const he = el as HTMLElement;
  if (!he.hasAttribute?.("data-nav-col")) return false;
  if (he.getAttribute("data-edit-mode") === "true") return false;
  return true;
}

export function useSpaceToDelete(onDelete: (uid: string) => void | Promise<void>) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectedRef = useRef<Set<string>>(new Set());
  const lastTapAtRef = useRef<number>(0);
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
      if (e.key !== " " && e.code !== "Space") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // فقط في وضع التنقّل داخل خلية جدول البنود.
      if (!isNavModeCell(document.activeElement)) return;

      e.preventDefault();

      const uid = focusedRowUid();
      const now = Date.now();
      const isDoubleTap = now - lastTapAtRef.current <= DOUBLE_TAP_WINDOW_MS;
      lastTapAtRef.current = now;

      if (isDoubleTap && selectedRef.current.size > 0) {
        // ضمّن الصف الحالي ثم احذف الجميع.
        if (uid && !selectedRef.current.has(uid)) {
          setSelected((prev) => {
            const next = new Set(prev);
            next.add(uid);
            selectedRef.current = next;
            return next;
          });
        }
        setTimeout(() => { void runDelete(); }, 0);
        lastTapAtRef.current = 0;
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
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [runDelete]);

  const isPending = useCallback((uid: string) => selected.has(uid), [selected]);

  // Compatibility no-op: pages still pass a per-row keydown handler.
  const handleRowKeyDown = useCallback(
    (_uid: string, _e: React.KeyboardEvent) => { /* handled globally */ },
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
