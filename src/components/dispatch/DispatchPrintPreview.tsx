/**
 * DispatchPrintPreview — معاينة طباعة A4 لإدارة الترحيلات.
 *
 * شكل المعاينة عبارة عن "كشف ترحيلات" مدمج:
 *   - ترويسة شركة مصغّرة + عنوان "كشف الترحيلات" (مرّة واحدة أعلى الصفحة).
 *   - بطاقة مدمجة لكل فاتورة تعرض:
 *       رقم الفاتورة، التاريخ، الزبون، الوجهة، الناقل، بيانات التغليف،
 *       عدد الأصناف والإجمالي.
 *   - البطاقات تتدفق على الصفحة بحيث تستوعب الصفحة A4 الواحدة أكثر من فاتورة،
 *     حسب حجم بيانات التغليف لكل فاتورة (page-break-inside: avoid).
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Eye, Loader2 } from "lucide-react";
import {
  loadDispatchDoc,
  buildDispatchSheetHTML,
  type DispatchDoc,
  type LiveOverlayEntry,
} from "@/utils/dispatchReportPrint";

type Props = {
  selectedIds: Set<string>;
  company: any;
  /** Optional overlay of unsaved row choices (per invoice id) */
  liveOverlay?: Record<string, LiveOverlayEntry>;
};

const EMPTY_IDS: string[] = [];

export default function DispatchPrintPreview({ selectedIds, company, liveOverlay }: Props) {
  const ids = useMemo(() => {
    const arr = Array.from(selectedIds);
    return arr.length ? arr : EMPTY_IDS;
  }, [selectedIds]);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["dispatch-preview-sheet", ids.sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const results = await Promise.all(ids.map((id) => loadDispatchDoc(id).catch(() => null)));
      return results.filter(Boolean) as DispatchDoc[];
    },
  });

  const html = useMemo(() => {
    if (!docs || docs.length === 0) return "";
    return buildDispatchSheetHTML(docs, company, liveOverlay);
  }, [docs, company, liveOverlay]);

  const handlePrint = () => {
    if (!html) return;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      try { win.focus(); win.print(); } catch (e) { console.error(e); }
    }, 500);
  };


  if (ids.length === 0) {
    return (
      <div className="dpp-shell" dir="rtl">
        <PreviewStyles />
        <div className="dpp-header">
          <h3><Eye size={15} /> معاينة الطباعة</h3>
        </div>
        <div className="dpp-empty">
          <Eye size={36} className="dpp-empty-ic" />
          <div className="dpp-empty-title">لا توجد فواتير مختارة</div>
          <div className="dpp-empty-sub">اختر فاتورة أو أكثر من القائمة لعرض كشف الترحيلات</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dpp-shell" dir="rtl">
      <PreviewStyles />

      <div className="dpp-header">
        <h3><Eye size={15} /> كشف الترحيلات</h3>
        <span className="dpp-pageinfo">{ids.length} فاتورة</span>
      </div>

      <div className="dpp-actions">
        <button
          type="button"
          className="dpp-btn dpp-btn-primary"
          onClick={handlePrint}
          disabled={isLoading || !html}
        >
          <Printer size={13} />
          طباعة الكشف
        </button>
      </div>

      <div className="dpp-viewport">
        {isLoading || !html ? (
          <div className="dpp-empty">
            <Loader2 className="animate-spin" size={18} />
            <div className="dpp-empty-title">جارٍ تحميل المعاينة…</div>
          </div>
        ) : (
          <iframe
            title="معاينة كشف الترحيلات"
            srcDoc={html}
            className="dpp-iframe"
          />
        )}
      </div>
    </div>
  );
}

function PreviewStyles() {
  return (
    <style>{`
      .dpp-shell {
        display:flex; flex-direction:column;
        background: hsl(var(--card));
        border: 1px solid hsl(var(--border));
        border-radius: 10px; overflow:hidden;
        box-shadow: 0 2px 10px rgba(0,0,0,0.04);
        height: 100%; min-height: 400px;
      }
      .dpp-header {
        display:flex; align-items:center; justify-content:space-between;
        padding: 8px 12px;
        background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.85));
        color: hsl(var(--primary-foreground));
      }
      .dpp-header h3 { font-size:13px; font-weight:800; margin:0; display:flex; align-items:center; gap:6px; }
      .dpp-pageinfo { font-size:11px; font-weight:700; background: rgba(255,255,255,0.18); padding: 3px 8px; border-radius: 6px; }
      .dpp-actions {
        display:flex; gap:6px; padding: 8px 10px;
        border-bottom: 1px solid hsl(var(--border));
        background: hsl(var(--muted) / 0.3);
      }
      .dpp-btn {
        height:30px; padding: 0 10px; border-radius:6px; border:none;
        font-size:11px; font-weight:800; cursor:pointer;
        display:inline-flex; align-items:center; gap:5px;
      }
      .dpp-btn:disabled { opacity:0.5; cursor:not-allowed; }
      .dpp-btn-primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); flex:1; justify-content:center; }
      .dpp-viewport {
        flex:1; min-height: 360px;
        background: hsl(var(--muted) / 0.4);
        display:flex; justify-content:stretch; align-items:stretch;
      }
      .dpp-iframe {
        flex:1; width:100%; height:100%;
        border: 0; background: #fff;
      }
      .dpp-empty {
        flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap: 8px; padding: 40px 14px; text-align:center;
        color: hsl(var(--muted-foreground));
      }
      .dpp-empty-ic { opacity: 0.25; }
      .dpp-empty-title { font-weight:800; font-size:13px; color: hsl(var(--foreground)); }
      .dpp-empty-sub { font-size:11px; }
    `}</style>
  );
}
