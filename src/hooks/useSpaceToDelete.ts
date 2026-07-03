import { useCallback } from "react";

/**
 * اختصار حذف صف البنود بلوحة المفاتيح.
 *
 * المفهوم الجديد (مثل Excel):
 *   - كل الحقول تقبل الكتابة فور التركيز. لا يوجد وضع تنقّل/تعديل.
 *   - Space / Enter / Tab / الأسهم: تعمل كالمعتاد.
 *   - Ctrl+Delete أو Ctrl+Backspace: يحذف الصف الحالي فوراً.
 *
 * التوقيع محفوظ (isPending / handleRowKeyDown) لتوافق الصفحات القائمة،
 * لكن isPending تُرجع دائماً false — لا يوجد "تحديد معلّق".
 */
export function useSpaceToDelete(onDelete: (uid: string) => void | Promise<void>) {
  const isPending = useCallback((_uid: string) => false, []);

  const handleRowKeyDown = useCallback(
    (uid: string, e: React.KeyboardEvent) => {
      const isDelete = e.key === "Delete" || e.key === "Backspace";
      if (!isDelete) return;
      // اشترط Ctrl (أو Meta على macOS) حتى لا نتعارض مع تحرير النص العادي.
      if (!e.ctrlKey && !e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();

      // احفظ موقع الصف الحالي لنقل التركيز بعد الحذف.
      const target = e.target as HTMLElement | null;
      const rowEl = target?.closest("[data-nav-row]") as HTMLElement | null;
      const tableName = rowEl?.getAttribute("data-nav-table") || null;
      const rowIdx = rowEl
        ? parseInt(rowEl.getAttribute("data-nav-row") || "-1", 10)
        : -1;

      Promise.resolve(onDelete(uid)).then(() => {
        if (rowIdx < 0 || !tableName) return;
        window.setTimeout(() => {
          const sel = (r: number) =>
            document.querySelector<HTMLElement>(
              `[data-nav-table="${tableName}"][data-nav-row="${r}"][data-nav-col="product"]`,
            );
          let next: HTMLElement | null = null;
          for (let r = rowIdx; r >= 0 && !next; r--) next = sel(r);
          if (!next) {
            next = document.querySelector<HTMLElement>(
              `.quick-add-row [data-nav-col="product"]`,
            );
          }
          next?.focus();
        }, 30);
      });
    },
    [onDelete],
  );

  const clear = useCallback(() => {}, []);

  return {
    pendingUids: new Set<string>(),
    isPending,
    handleRowKeyDown,
    clear,
  };
}
