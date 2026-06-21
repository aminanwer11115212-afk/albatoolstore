import { useEffect, useState, RefObject } from "react";

/**
 * يُنتج صفوف <tr> فارغة لتعبئة المساحة المتبقية في حاوية تمرير الجدول
 * حتى يبدو الجدول مكتملاً وتلتصق الأزرار بنهايته دون فراغ أبيض.
 *
 * - aria-hidden + pointer-events:none → لا تتفاعل ولا تظهر للقارئات.
 * - يقيس ارتفاع thead و tfoot وارتفاع الصف الفعلي من DOM (بعد تطبيق
 *   --items-zoom) لتجنّب اختلال الحساب عند تغيير الزوم. كان الـ rowHeight
 *   ثابتاً 28px بينما الصف الحقيقي 32 * zoom → ينتج صفوف فارغة أكثر من
 *   اللازم ويظهر scrollbar زائف عند 100%.
 * - يعيد الحساب عند تغيّر حجم الحاوية أو الهيدر/الفوتر أو عدد الصفوف.
 */
interface TableFillerProps {
  scrollRef: RefObject<HTMLElement>;
  realRowsCount: number;
  /** Fallback فقط إن تعذّر قياس صف فعلي */
  rowHeight?: number;
  /** Fallback فقط إذا تعذّر قياس thead الفعلي */
  headerHeight?: number;
  columnsCount: number;
}

export function TableFiller({
  scrollRef,
  realRowsCount,
  rowHeight = 28,
  headerHeight = 32,
  columnsCount,
}: TableFillerProps) {
  const [emptyRows, setEmptyRows] = useState(0);
  const [measuredRowH, setMeasuredRowH] = useState(rowHeight);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const measureNode = (node: Element | null, fallback: number) => {
      if (!node) return fallback;
      const h = (node as HTMLElement).getBoundingClientRect().height;
      return h > 0 ? h : fallback;
    };

    const measureRowH = (): number => {
      // أول صف حقيقي (ليس filler) داخل tbody
      const realRow = el.querySelector(
        "tbody tr.excel-row:not([aria-hidden='true'])"
      ) as HTMLElement | null;
      if (realRow) {
        const h = realRow.getBoundingClientRect().height;
        if (h > 0) return h;
      }
      // fallback: أي filler موجود (يعكس ارتفاعاً قريباً)
      const anyRow = el.querySelector("tbody tr.excel-row") as HTMLElement | null;
      if (anyRow) {
        const h = anyRow.getBoundingClientRect().height;
        if (h > 0) return h;
      }
      return rowHeight;
    };

    const calc = () => {
      const h = el.clientHeight;
      const thead = el.querySelector("thead");
      const tfoot = el.querySelector("tfoot");
      const headH = measureNode(thead, headerHeight);
      const footH = measureNode(tfoot, 0);
      const actualRowH = measureRowH();
      setMeasuredRowH(actualRowH);
      const used = headH + footH + realRowsCount * actualRowH;
      const remaining = h - used;
      // نخصم 2px احترازياً لتفادي اهتزاز sub-pixel يُظهر scrollbar
      const n = remaining > 2 ? Math.floor((remaining - 2) / actualRowH) : 0;
      setEmptyRows(Math.max(0, n));
    };

    calc();

    const ro = new ResizeObserver(calc);
    ro.observe(el);
    const thead = el.querySelector("thead");
    const tfoot = el.querySelector("tfoot");
    if (thead) ro.observe(thead);
    if (tfoot) ro.observe(tfoot);
    // راقب tbody لاكتشاف تغيّر ارتفاع الصفوف عند تبديل الزوم
    const tbody = el.querySelector("tbody");
    if (tbody) ro.observe(tbody);

    window.addEventListener("resize", calc);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", calc);
    };
  }, [scrollRef, realRowsCount, rowHeight, headerHeight]);

  if (emptyRows === 0) return null;

  return (
    <>
      {Array.from({ length: emptyRows }).map((_, i) => (
        <tr
          key={`__filler_${i}`}
          aria-hidden="true"
          className="excel-row"
          style={{ pointerEvents: "none", height: measuredRowH }}
        >
          {Array.from({ length: columnsCount }).map((__, j) => (
            <td key={j} style={{ height: measuredRowH }}>&nbsp;</td>
          ))}
        </tr>
      ))}
    </>
  );
}
