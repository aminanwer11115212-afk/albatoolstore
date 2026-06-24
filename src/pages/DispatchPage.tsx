/**
 * DispatchPage — صفحة إدارة الترحيلات
 *
 * - الجدول الرئيسي (يمين): الفواتير الجاهزة للرفع، حسب الكل/الترحيلات/الزبون.
 * - لوحة المعاينة (يسار): معاينة طباعة A4 للفواتير المختارة، مع تنقّل بين الصفحات.
 * - الموبايل: المعاينة في Sheet ينفتح بزر عائم.
 *
 * يربط `rowChoice` (اختيار الناقل/الوجهة لكل صف قبل الضغط على «تثبيت»)
 * بين اللوحة اليمنى ومعاينة الطباعة على اليسار، بحيث يظهر الاختيار
 * فورًا في كشف المعاينة (مع وسم «معاينة — لم يُثبَّت بعد»).
 */

import { useState, useMemo, useCallback } from "react";
import { useCompanySettings, useTransporters, useDestinations } from "@/hooks/useData";
import ReadyToShipPanel from "@/components/dispatch/ReadyToShipPanel";
import DispatchPrintPreview from "@/components/dispatch/DispatchPrintPreview";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Eye } from "lucide-react";
import { buildDispatchSheetForInvoiceIds } from "@/utils/dispatchReportPrint";
import type { LiveOverlayEntry } from "@/utils/dispatchReportPrint";


export default function DispatchPage() {
  const { data: company } = useCompanySettings();
  const { data: allTransporters } = useTransporters();
  const { data: allDestinations } = useDestinations();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rowChoice, setRowChoice] = useState<Record<string, { transporterId?: string; destinationId?: string }>>({});

  // Build the live overlay map: invoice_id → { transporterName, destinationName }
  // so the preview can render the chosen-but-not-yet-pinned transport.
  const liveOverlay = useMemo(() => {
    const transporters = (allTransporters as any[]) || [];
    const destinations = (allDestinations as any[]) || [];
    const out: Record<string, LiveOverlayEntry> = {};
    for (const [invId, c] of Object.entries(rowChoice)) {
      const t = c.transporterId ? transporters.find((x) => x.id === c.transporterId) : null;
      const d = c.destinationId ? destinations.find((x) => x.id === c.destinationId) : null;
      if (!t && !d) continue;
      out[invId] = {
        transporterName: t?.name,
        transporterPhone: t?.phone,
        destinationName: d?.name,
      };
    }
    return out;
  }, [rowChoice, allTransporters, allDestinations]);

  // Build print HTML with the same live overlay used by the preview pane,
  // so chosen-but-not-pinned transporter/destination print exactly as previewed.
  const buildDispatchReportHTML = useCallback(
    async (invoices: any[], _companyArg: any) => {
      const ids = invoices.map((i) => i.id).filter(Boolean);
      return await buildDispatchSheetForInvoiceIds(ids, company, liveOverlay);
    },
    [company, liveOverlay]
  );


  return (
    <article className="dispatch-page" dir="rtl">
      <style>{`
        .dispatch-page { padding: 10px 12px; }
        .dispatch-page .dp-grid {
          display: grid; gap: 12px;
          grid-template-columns: 1fr;
        }
        .dispatch-page .dp-preview { display: none; }
        @media (min-width: 860px) {
          .dispatch-page .dp-grid { grid-template-columns: 1fr 220px; align-items: start; }
          .dispatch-page .dp-preview { position: sticky; top: 10px; height: calc(100vh - 20px); max-height: calc(100vh - 20px); overflow: hidden; display:flex; }
          .dispatch-page .dp-preview > * { flex: 1; min-height: 0; height: 100%; }
        }
        @media (min-width: 1100px) {
          .dispatch-page .dp-grid { grid-template-columns: 1fr 320px; }
        }
        @media (min-width: 1280px) {
          .dispatch-page .dp-grid { grid-template-columns: 1fr 440px; }
        }
        @media (min-width: 1536px) {
          .dispatch-page .dp-grid { grid-template-columns: 1fr 600px; }
        }
        .dispatch-page .dp-main { min-width: 0; overflow-x: auto; }
        .dispatch-page .dp-main > * { height: 100%; min-height: 500px; }

        .dispatch-page .dp-mobile-trigger {
          position: fixed; bottom: 16px; right: 16px; z-index: 50;
          background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
          border: none; border-radius: 999px; padding: 10px 14px;
          font-size: 12px; font-weight: 800; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px;
          box-shadow: 0 6px 18px rgba(0,0,0,0.18);
        }
        @media (min-width: 860px) {
          .dispatch-page .dp-mobile-trigger { display: none; }
        }
      `}</style>



      <div className="dp-grid">
        <div className="dp-main">
          <ReadyToShipPanel
            buildPrintHTML={buildDispatchReportHTML}
            company={company}
            checked={selectedIds}
            onCheckedChange={setSelectedIds}
            rowChoice={rowChoice}
            onRowChoiceChange={setRowChoice}
          />
        </div>

        <aside className="dp-preview">
          <DispatchPrintPreview
            selectedIds={selectedIds}
            company={company}
            liveOverlay={liveOverlay}
          />
        </aside>
      </div>

      <Sheet>
        <SheetTrigger asChild>
          <button className="dp-mobile-trigger" type="button">
            <Eye size={16} />
            معاينة الطباعة {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[95vw] sm:w-[600px] p-0">
          <div style={{ height: "100%", padding: 8 }}>
            <DispatchPrintPreview selectedIds={selectedIds} company={company} liveOverlay={liveOverlay} />
          </div>
        </SheetContent>
      </Sheet>
    </article>
  );
}
