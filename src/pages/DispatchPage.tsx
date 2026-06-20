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

// ── Build Print HTML (used by ReadyToShipPanel for its "طباعة وتحويل" button) ───
function buildDispatchReportHTML(invoices: any[], company: any) {
  const logoURL = company?.logo_url || "";
  const dateStr = new Date().toLocaleDateString("ar-SA", {
    year: "numeric", month: "long", day: "numeric",
  });
  const fmt = (d?: string) => {
    if (!d) return "";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const byCustomer: Record<string, { name: string; invoices: any[] }> = {};
  invoices.forEach((inv) => {
    const cid = inv.customer_id || "cash";
    const name = inv.customers?.name || "كاش";
    if (!byCustomer[cid]) byCustomer[cid] = { name, invoices: [] };
    byCustomer[cid].invoices.push(inv);
  });

  const blocks = Object.values(byCustomer).map((cust) => {
    const totalPieces = cust.invoices.reduce(
      (s, inv) => s + (inv.packaging_total_pieces || 0), 0
    );
    const rows = cust.invoices.map((inv, i) => {
      const items = (inv.invoice_items || []).map(
        (it: any) => `<tr style="font-size:10px">
          <td style="border:1px solid #ccc;padding:3px 6px;text-align:center">${i + 1}</td>
          <td style="border:1px solid #ccc;padding:3px 6px;text-align:center">${inv.invoice_number}</td>
          <td style="border:1px solid #ccc;padding:3px 6px;text-align:right">${it.product_name || it.products?.name || "—"}</td>
          <td style="border:1px solid #ccc;padding:3px 6px;text-align:center">${it.quantity || 0}</td>
        </tr>`
      ).join("");
      if (items) return items;
      return `<tr><td style="border:1px solid #ccc;padding:3px 6px;text-align:center">${i + 1}</td>
        <td style="border:1px solid #ccc;padding:3px 6px;text-align:center">${inv.invoice_number}</td>
        <td style="border:1px solid #ccc;padding:3px 6px;text-align:right">—</td>
        <td style="border:1px solid #ccc;padding:3px 6px;text-align:center">—</td></tr>`;
    }).join("");
    return `<div style="margin-bottom:18px;border:2px solid hsl(220 70% 55%);border-radius:6px;overflow:hidden;page-break-inside:avoid">
      <div style="background:hsl(220 70% 55%);color:#fff;padding:6px 10px;display:flex;justify-content:space-between">
        <span style="font-weight:800;font-size:13px">اسم الزبون: ${cust.name}</span>
        <span style="font-size:11px">عدد الفواتير: ${cust.invoices.length}</span>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#e8edff">
          <th style="border:1px solid #ccc;padding:4px 6px;font-size:11px;text-align:center;width:35px">#</th>
          <th style="border:1px solid #ccc;padding:4px 6px;font-size:11px;text-align:center;width:90px">رقم الفاتورة</th>
          <th style="border:1px solid #ccc;padding:4px 6px;font-size:11px;text-align:right">الصنف</th>
          <th style="border:1px solid #ccc;padding:4px 6px;font-size:11px;text-align:center;width:60px">الكمية</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="background:#f0f4ff;padding:5px 10px;border-top:2px solid hsl(220 70% 55%);display:flex;justify-content:space-between">
        <span style="font-weight:800;font-size:11px">إجمالي القطع: <b style="color:#b91c1c;font-size:14px">${totalPieces || cust.invoices.length}</b></span>
        <span style="font-size:10px;color:#555">عدد الطلبات: ${cust.invoices.length}</span>
      </div>
    </div>`;
  }).join("");

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="utf-8"><title>تقرير الترحيلات - ${dateStr}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family:'Cairo','Segoe UI',Tahoma,Arial,sans-serif; color:#1a1a1a; font-weight:600; padding:10px; font-size:11px; line-height:1.4; }
  h1 { font-size:18px; font-weight:800; margin-bottom:8px; }
  .head { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1f2937; padding-bottom:8px; margin-bottom:12px; }
  .footer { margin-top:12px; padding-top:6px; border-top:1px solid #ddd; font-size:9px; color:#888; text-align:center; }
</style></head><body>
<div class="head">
  <div style="display:flex;gap:8px;align-items:center">
    ${logoURL ? `<img src="${logoURL}" style="width:48px;height:48px;object-fit:contain" />` : ""}
    <div><div style="font-size:14px;font-weight:800">${company?.name || "أولاد جابر — البتول ستور"}</div></div>
  </div>
  <div><h1>🚚 تقرير الترحيلات</h1><div style="font-size:10px;color:#666">${dateStr}</div></div>
</div>
${blocks}
<div class="footer">تم إنشاء هذا التقرير من نظام البتول — ${dateStr}</div>
</body></html>`;
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
        @media (min-width: 860px) {
          .dispatch-page .dp-grid { grid-template-columns: 1fr 360px; align-items: start; }
          .dispatch-page .dp-preview { position: sticky; top: 10px; max-height: calc(100vh - 20px); overflow: hidden; display:flex; }
          .dispatch-page .dp-preview > * { flex: 1; min-height: 0; }
        }
        @media (min-width: 1280px) {
          .dispatch-page .dp-grid { grid-template-columns: 1fr 480px; }
        }
        @media (min-width: 1536px) {
          .dispatch-page .dp-grid { grid-template-columns: 1fr 640px; }
        }
        .dispatch-page .dp-main { min-width: 0; }
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
