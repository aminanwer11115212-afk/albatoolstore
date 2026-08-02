/**
 * Arrow-key navigation between cells in items tables
 * (Invoices, Quotes, Stock Returns, Purchases).
 *
 * Layout (RTL UI but the keys work intuitively):
 *  - ArrowUp / ArrowDown: move to the same column in the previous/next row.
 *  - ArrowRight: visually next column (toward the total side).
 *  - ArrowLeft:  visually previous column (toward the product side).
 *
 * Cells must carry:
 *   data-nav-table="<tableId>"
 *   data-nav-row="<rowIndex>"
 *   data-nav-col="<colKey>"
 *
 * The "total" column is read-only; we still focus it (tabIndex=0) but skip
 * any value mutation. The product autocomplete owns ArrowUp/ArrowDown when
 * its suggestions list is open — pass `skipVertical` from the input handler
 * in that case.
 */
export function makeRowNavHandler(opts: {
  tableId: string;
  cols: string[];
  getRowCount: () => number;
}) {
  const focusCell = (rowIndex: number, colKey: string) => {
    const sel = `[data-nav-table="${opts.tableId}"][data-nav-row="${rowIndex}"][data-nav-col="${colKey}"]`;
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return false;
    el.focus();
    /**
     * تحديد المحتوى عند الوصول بالمفاتيح — فتكتب فيُستبدل مباشرةً.
     *
     * كان التنقّل يترك المؤشّر في موضعه بلا تحديد، فمن ينتقل إلى «الكمية» ليضع
     * 5 مكان 12 يجد نفسه يكتب «512» أو «125» بحسب موضع المؤشّر، فيمسح ثم
     * يكتب. والتحديد يجعل الضغطة الواحدة تكفي — وهو سلوك جداول الإدخال
     * المعروف: الوصول بالمفاتيح نيّةُ استبدالٍ لا نيّةُ تصحيحٍ داخل الرقم.
     *
     * ولا يُطبَّق على النقر بالماوس: من ينقر موضعاً بعينه يريد المؤشّر هناك.
     */
    if (el instanceof HTMLInputElement && el.type !== "checkbox" && el.type !== "radio") {
      try { el.select(); } catch { /* بعض الأنواع لا تدعم التحديد */ }
    }
    return true;
  };


  return function handleKeyDown(
    rowIndex: number,
    colKey: string,
    e: React.KeyboardEvent,
    flags?: { skipVertical?: boolean }
  ) {
    const colIdx = opts.cols.indexOf(colKey);
    if (colIdx < 0) return;
    const rowCount = opts.getRowCount();

    if (e.key === "ArrowUp") {
      if (flags?.skipVertical) return;
      if (rowIndex > 0 && focusCell(rowIndex - 1, colKey)) {
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      if (flags?.skipVertical) return;
      if (rowIndex < rowCount - 1 && focusCell(rowIndex + 1, colKey)) {
        e.preventDefault();
      }
      return;
    }
    // RTL semantics: ArrowRight = visually previous column (toward product),
    // ArrowLeft = visually next column (toward total).
    if (e.key === "ArrowLeft") {
      if (colIdx < opts.cols.length - 1 && focusCell(rowIndex, opts.cols[colIdx + 1])) {
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowRight") {
      if (colIdx > 0 && focusCell(rowIndex, opts.cols[colIdx - 1])) {
        e.preventDefault();
      }
      return;
    }
  };
}
