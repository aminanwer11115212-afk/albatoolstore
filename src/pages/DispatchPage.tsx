/**
 * DispatchPage — صفحة إدارة الترحيلات
 *
 * - الجدول الرئيسي (يمين): الفواتير الجاهزة للرفع، حسب الكل/الترحيلات/الزبون.
 * - لوحة المعاينة (يسار): معاينة طباعة A4 للفواتير المختارة، مع تنقّل بين الصفحات.
 * - الموبايل: المعاينة في Sheet ينفتح بزر عائم.
 */

import { useState } from "react";
import { useCompanySettings } from "@/hooks/useData";
import ReadyToShipPanel from "@/components/dispatch/ReadyToShipPanel";
import DispatchPrintPreview from "@/components/dispatch/DispatchPrintPreview";
import DispatchEntitiesBar from "@/components/dispatch/DispatchEntitiesBar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Eye } from "lucide-react";
import { buildDispatchSheetForInvoiceIds } from "@/utils/dispatchReportPrint";

// Build the unified dispatch sheet HTML for the selected invoices.
// Shared identical template with the left-side preview pane.
async function buildDispatchReportHTML(invoices: any[], company: any) {
  const ids = invoices.map((i) => i.id).filter(Boolean);
  return await buildDispatchSheetForInvoiceIds(ids, company);
}

export default function DispatchPage() {
  const { data: company } = useCompanySettings();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  return (
    <article className="dispatch-page" dir="rtl">
      <style>{`
        .dispatch-page { padding: 10px 12px; }
        .dispatch-page .dp-grid {
          display: grid; gap: 12px;
          grid-template-columns: 1fr;
        }
        .dispatch-page .dp-preview { display: none; }
        /* عند الشاشات الضيقة: معاينة طباعة مصغّرة على الشمال
           حتى يحصل جدول الترحيلات على مساحة أكبر، مع السماح بـ
           horizontal scroll داخل dp-main إن لم تكفِ مساحة الأعمدة. */
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

        /* Mobile floating trigger */
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

      <DispatchEntitiesBar />

      <div className="dp-grid">
        {/* Main: ready-to-ship list (visually on the RIGHT in RTL) */}
        <div className="dp-main">
          <ReadyToShipPanel
            buildPrintHTML={buildDispatchReportHTML}
            company={company}
            checked={selectedIds}
            onCheckedChange={setSelectedIds}
          />
        </div>

        {/* Preview pane (visually on the LEFT in RTL) — desktop only */}
        <aside className="dp-preview">
          <DispatchPrintPreview
            selectedIds={selectedIds}
            company={company}
          />
        </aside>
      </div>

      {/* Mobile floating trigger + sheet */}
      <Sheet>
        <SheetTrigger asChild>
          <button className="dp-mobile-trigger" type="button">
            <Eye size={16} />
            معاينة الطباعة {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[95vw] sm:w-[600px] p-0">
          <div style={{ height: "100%", padding: 8 }}>
            <DispatchPrintPreview selectedIds={selectedIds} company={company} />
          </div>
        </SheetContent>
      </Sheet>
    </article>
  );
}
