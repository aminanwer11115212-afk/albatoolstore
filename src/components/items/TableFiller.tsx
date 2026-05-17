import { useEffect, useState, RefObject } from "react";

/**
 * يُنتج صفوف <tr> فارغة لتعبئة المساحة المتبقية في حاوية تمرير الجدول
 * حتى يبدو الجدول مكتملاً وتلتصق الأزرار بنهايته دون فراغ أبيض.
 *
 * - aria-hidden + pointer-events:none → لا تتفاعل ولا تظهر للقارئات.
 * - يقيس ارتفاع thead و tfoot الفعليين من DOM لتجنّب ظهور scrollbar
 *   بسبب فارق صغير (المشكلة: tfoot كان مُتجاهَلاً → الجدول دائماً يفيض بقدر ارتفاع tfoot).
 * - يعيد الحساب عند تغيّر حجم الحاوية أو الهيدر/الفوتر أو عدد الصفوف.
 */
interface TableFillerProps {
  scrollRef: RefObject<HTMLElement>;
  realRowsCount: number;
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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const measure = (node: Element | null, fallback: number) => {
      if (!node) return fallback;
      const h = (node as HTMLElement).getBoundingClientRect().height;
      return h > 0 ? h : fallback;
    };

    const calc = () => {
      const h = el.clientHeight;
      const thead = el.querySelector("thead");
      const tfoot = el.querySelector("tfoot");
      const headH = measure(thead, headerHeight);
      const footH = measure(tfoot, 0);
      const used = headH + footH + realRowsCount * rowHeight;
      const remaining = h - used;
      // نخصم 1px احترازياً لتفادي اهتزاز sub-pixel يُظهر scrollbar
      const n = remaining > 1 ? Math.floor((remaining - 1) / rowHeight) : 0;
      setEmptyRows(Math.max(0, n));
    };

    calc();

    const ro = new ResizeObserver(calc);
    ro.observe(el);
    const thead = el.querySelector("thead");
    const tfoot = el.querySelector("tfoot");
    if (thead) ro.observe(thead);
    if (tfoot) ro.observe(tfoot);

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
          style={{ pointerEvents: "none", height: rowHeight }}
        >
          {Array.from({ length: columnsCount }).map((__, j) => (
            <td key={j} style={{ height: rowHeight }}>&nbsp;</td>
          ))}
        </tr>
      ))}
    </>
  );
}
