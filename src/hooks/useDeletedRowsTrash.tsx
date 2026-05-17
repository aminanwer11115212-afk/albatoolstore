import { useCallback, useRef, useState } from "react";

/**
 * سلة بنود محذوفة محلية داخل فورم الفاتورة/عرض السعر:
 * - تحفظ آخر دفعة محذوفة قبل الحفظ.
 * - تتيح "استرجاع" أو "إفراغ".
 * - تَدمج النقر المزدوج على زر/خلية الحذف لتنفيذ الحذف فعلياً.
 */
export interface TrashedRow<T> {
  row: T;
  at: number;
}

export function useDeletedRowsTrash<T extends { uid: string; product_name?: string }>() {
  const [trash, setTrash] = useState<TrashedRow<T>[]>([]);
  const [open, setOpen] = useState(false);

  const push = useCallback((rows: T[]) => {
    if (!rows.length) return;
    const at = Date.now();
    setTrash((prev) => [...rows.map((row) => ({ row, at })), ...prev]);
  }, []);

  const restore = useCallback((uid: string): T | null => {
    let restored: T | null = null;
    setTrash((prev) => {
      const idx = prev.findIndex((t) => t.row.uid === uid);
      if (idx === -1) return prev;
      restored = prev[idx].row;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
    return restored;
  }, []);

  const restoreAll = useCallback((): T[] => {
    const all = trash.map((t) => t.row);
    setTrash([]);
    return all;
  }, [trash]);

  const clear = useCallback(() => setTrash([]), []);

  // Double-click bookkeeping
  const lastClickRef = useRef<{ uid: string; at: number } | null>(null);
  const DOUBLE_MS = 350;

  /** يعيد true إذا كانت ضغطة مزدوجة سريعة على نفس الصف */
  const isDoubleClick = useCallback((uid: string) => {
    const now = Date.now();
    const last = lastClickRef.current;
    if (last && last.uid === uid && now - last.at <= DOUBLE_MS) {
      lastClickRef.current = null;
      return true;
    }
    lastClickRef.current = { uid, at: now };
    return false;
  }, []);

  return {
    trash,
    open,
    setOpen,
    push,
    restore,
    restoreAll,
    clear,
    isDoubleClick,
    count: trash.length,
  };
}
