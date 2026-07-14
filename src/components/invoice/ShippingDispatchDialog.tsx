/**
 * ShippingDispatchDialog — نافذة تقرير الترحيلات
 *
 * الفكرة:
 * 1. تعرض جميع الفواتير بحالة "جاهز للرفع" (ready_to_ship).
 * 2. المستخدم يضيف ناقل + وجهة لكل فاتورة.
 * 3. زر "طباعة التقرير" يطبع ورقة ترحيلات بجميع الفواتير التي لها ناقل.
 * 4. بعد الطباعة تتغير حالة هذه الفواتير إلى "في الطريق للترحيلات" (in_transit).
 */

import React, { useState, useMemo, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidateWorkflowAutoCache } from "@/components/invoice/WorkflowStatusBadge";
import { useQuery } from "@tanstack/react-query";
import { useSafeQueryClient as useQueryClient } from "@/lib/safeQueryClient";
import { useDestinations, useTransporters } from "@/hooks/useData";
import { Printer, Truck, X, PackageCheck } from "lucide-react";
import { useDialogSize } from "@/hooks/useDialogSize";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DispatchRow {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  total: number;
  currency: string;
  transporterId: string;
  destinationId: string;
  notes: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtMoney = (n: any) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fmtDate = (d?: string) => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

// ── Print function ─────────────────────────────────────────────────────────────
function buildPrintHTML(
  rows: DispatchRow[],
  transporters: any[],
  destinations: any[],
  date: string,
) {
  const transMap = Object.fromEntries(transporters.map((t: any) => [t.id, t.name]));
  const destMap = Object.fromEntries(destinations.map((d: any) => [d.id, d.name]));

  const rowsHTML = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.invoiceNumber}</td>
      <td>${r.customerName}</td>
      <td>${r.customerPhone || "—"}</td>
      <td>${fmtMoney(r.total)} ${r.currency}</td>
      <td>${transMap[r.transporterId] || "—"}</td>
      <td>${destMap[r.destinationId] || "—"}</td>
      <td>${r.notes || ""}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/>
<title>تقرير الترحيلات — ${date}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; padding: 16px; color: #111; }
  h1 { font-size: 18px; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 11px; color: #555; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #1e3a5f; color: #fff; padding: 6px 8px; font-size: 11px; text-align: right; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 11px; vertical-align: middle; }
  tr:nth-child(even) td { background: #f5f8ff; }
  .footer { margin-top: 16px; font-size: 10px; color: #777; text-align: center; }
  @media print { body { padding: 8px; } }
</style>
</head>
<body>
<h1>🚚 تقرير الترحيلات</h1>
<div class="subtitle">تاريخ الطباعة: ${date} · عدد الفواتير: ${rows.length}</div>
<table>
  <thead>
    <tr>
      <th>#</th><th>رقم الفاتورة</th><th>العميل</th><th>الهاتف</th>
      <th>المبلغ</th><th>الناقل</th><th>الوجهة</th><th>ملاحظات</th>
    </tr>
  </thead>
  <tbody>${rowsHTML}</tbody>
</table>
<div class="footer">تم إنشاء هذا التقرير تلقائياً من نظام البلتول — ${date}</div>
</body></html>`;
}

// ── Main Component ─────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ShippingDispatchDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const { data: destinations = [] } = useDestinations();
  const { data: transporters = [] } = useTransporters();

  // جلب الفواتير بحالة ready_to_ship
  const { data: invoices = [], isLoading, refetch } = useQuery({
    queryKey: ["dispatch-ready-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, date, total, currency_code, customers(name, phone)")
        .eq("workflow_status", "ready_to_ship")
        .order("date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
    refetchOnWindowFocus: false,
  });

  // حالة الصفوف: ناقل + وجهة + ملاحظات لكل فاتورة
  const [rows, setRows] = useState<Record<string, { transporterId: string; destinationId: string; notes: string }>>({});
  const [printing, setPrinting] = useState(false);
  // ref يُستعمل في setTimeout fallback لأن state قد لا يُرى من داخل الـ closure القديم.
  const printingRef = useRef(false);
  const { dlgRef, dlgStyle } = useDialogSize("shipping_dispatch_dialog", open, { w: "min(860px, 97vw)", h: "90vh" });

  const setRowField = useCallback((invoiceId: string, field: "transporterId" | "destinationId" | "notes", val: string) => {
    setRows(prev => ({ ...prev, [invoiceId]: { transporterId: "", destinationId: "", notes: "", ...prev[invoiceId], [field]: val } }));
  }, []);

  // الفواتير التي لها ناقل محدد (مؤهلة للطباعة)
  const readyToPrint = useMemo(() =>
    invoices.filter((inv: any) => (rows[inv.id]?.transporterId || "").length > 0),
    [invoices, rows]
  );

  const handlePrintAndTransit = async () => {
    if (readyToPrint.length === 0) {
      toast.error("حدد ناقلاً لفاتورة واحدة على الأقل");
      return;
    }
    setPrinting(true);
    printingRef.current = true;
    try {
      const printRows: DispatchRow[] = readyToPrint.map((inv: any) => ({
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        customerName: inv.customers?.name || "كاش",
        customerPhone: inv.customers?.phone || "",
        total: Number(inv.total || 0),
        currency: inv.currency_code || "SDG",
        transporterId: rows[inv.id]?.transporterId || "",
        destinationId: rows[inv.id]?.destinationId || "",
        notes: rows[inv.id]?.notes || "",
      }));

      const date = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
      const html = buildPrintHTML(printRows, transporters as any[], destinations as any[], date);
      const ids = printRows.map(r => r.invoiceId);

      // فتح نافذة الطباعة
      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) {
        toast.error("تعذّر فتح نافذة الطباعة — تحقق من إعدادات المتصفح");
        setPrinting(false);
        printingRef.current = false;
        return;
      }
      try {
        win.document.write(html);
        win.document.close();
      } catch (e) {
        console.error("[ShippingDispatchDialog] document.write failed:", e);
      }

      // محاولة الطباعة عبر onload — لو لم يُطلَق نُكمل عبر setTimeout fallback.
      let printAttempted = false;
      const tryPrint = () => {
        if (printAttempted) return;
        printAttempted = true;
        try { win.print(); } catch (e) { console.error("[ShippingDispatchDialog] print() failed:", e); }
        try { win.onafterprint = () => { try { win.close(); } catch {} }; } catch {}
      };
      try { win.onload = tryPrint; } catch {}
      // fallback: بعض المتصفحات لا تُطلق onload عند about:blank
      setTimeout(tryPrint, 700);

      // ── مهم: ترقية الحالة لا تعتمد على win.onload لأنه قد لا يُستدعى أصلاً.
      // نُنفّذها فوراً بعد فتح نافذة الطباعة — فالطباعة client-side
      // والترقية تخص الـ DB المستقلة عنها.
      const results = await Promise.all(
        ids.map(async id => {
          const res = await supabase.rpc("advance_invoice_workflow" as any, {
            _invoice_id: id,
            _target: "in_transit",
            _reason: "طباعة كشف الفواتير الجاهزة",
          });
          return { id, error: (res as any).error };
        })
      );
      const failed = results.filter(r => r.error);
      const okIds = results.filter(r => !r.error).map(r => r.id);

      if (failed.length > 0) {
        toast.error(`فشل تحديث ${failed.length} من ${ids.length} فاتورة: ${(failed[0].error as any)?.message || ""}`);
      }
      if (okIds.length > 0) {
        toast.success(`✅ تم تحويل ${okIds.length} فاتورة إلى "في الطريق للترحيلات"`);
        qc.invalidateQueries({ queryKey: ["invoices-with-customers"] });
        qc.invalidateQueries({ queryKey: ["invoices-with-customers", undefined] });
        okIds.forEach(id => invalidateWorkflowAutoCache(id));
        try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
        await refetch();
        setRows(prev => {
          const next = { ...prev };
          okIds.forEach(id => delete next[id]);
          return next;
        });
      }
    } catch (e: any) {
      console.error("[ShippingDispatchDialog.handlePrintAndTransit] error:", e);
      toast.error(e?.message || "خطأ غير متوقع");
    } finally {
      setPrinting(false);
      printingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        ref={dlgRef}
        dir="rtl"
        style={{ ...dlgStyle, display: "flex", flexDirection: "column", gap: 0, padding: 0, overflow: "hidden" }}
      >
        {/* Header */}
        <DialogHeader style={{ padding: "12px 16px 10px", borderBottom: "1px solid hsl(var(--border))", flexShrink: 0 }}>
          <DialogTitle style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 14, fontWeight: 700 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ background: "linear-gradient(135deg,#7c3aed,#2563eb)", color: "#fff", borderRadius: 6, padding: "3px 9px", display: "flex", alignItems: "center", gap: 5 }}>
                <Truck size={14} /> إضافة ترحيلات
              </span>
              <span style={{ fontSize: 11, fontWeight: 400, color: "hsl(var(--muted-foreground))" }}>
                {isLoading ? "جارٍ التحميل..." : `${invoices.length} فاتورة جاهزة للرفع`}
                {readyToPrint.length > 0 && <> · <span style={{ color: "#7c3aed", fontWeight: 700 }}>{readyToPrint.length} مختارة للطباعة</span></>}
              </span>
            </span>
            <Button
              onClick={handlePrintAndTransit}
              disabled={readyToPrint.length === 0 || printing}
              style={{
                background: readyToPrint.length > 0 ? "linear-gradient(135deg,#7c3aed,#2563eb)" : undefined,
                color: readyToPrint.length > 0 ? "#fff" : undefined,
                fontSize: 12, height: 30, fontWeight: 700,
                display: "flex", alignItems: "center", gap: 5,
                opacity: (readyToPrint.length === 0 || printing) ? 0.6 : 1,
              }}
            >
              <Printer size={13} />
              {printing ? "جارٍ الطباعة..." : `طباعة التقرير${readyToPrint.length > 0 ? ` (${readyToPrint.length})` : ""}`}
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "hsl(var(--muted-foreground))" }}>جارٍ تحميل الفواتير...</div>
          ) : invoices.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <PackageCheck size={40} style={{ color: "hsl(var(--muted-foreground))", margin: "0 auto 10px" }} />
              <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>لا توجد فواتير بحالة "جاهز للرفع"</div>
              <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>غيّر حالة الفواتير إلى "جاهز للرفع" من شاشة الفواتير أولاً</div>
            </div>
          ) : (
            <>
              {/* Legend */}
              <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ background: "#fdf4ff", border: "1px solid #e9d5ff", borderRadius: 4, padding: "2px 7px", color: "#7c3aed", fontWeight: 700, fontSize: 10 }}>تلميح</span>
                اختر ناقلاً لكل فاتورة تريد تضمينها في التقرير. الوجهة والملاحظات اختيارية.
              </div>

              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "90px 1fr 100px 160px 160px 1fr",
                gap: 6, padding: "5px 8px",
                background: "hsl(var(--muted))", borderRadius: "6px 6px 0 0",
                fontSize: 10, fontWeight: 700, color: "hsl(var(--muted-foreground))",
                border: "1px solid hsl(var(--border))", borderBottom: "none",
              }}>
                <span>رقم الفاتورة</span>
                <span>العميل</span>
                <span style={{ textAlign: "center" }}>المبلغ</span>
                <span>الناقل *</span>
                <span>الوجهة</span>
                <span>ملاحظات</span>
              </div>

              {/* Rows */}
              <div style={{ border: "1px solid hsl(var(--border))", borderRadius: "0 0 6px 6px", overflow: "hidden" }}>
                {invoices.map((inv: any, i: number) => {
                  const r = rows[inv.id] || { transporterId: "", destinationId: "", notes: "" };
                  const hasTransporter = r.transporterId.length > 0;
                  return (
                    <div
                      key={inv.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 1fr 100px 160px 160px 1fr",
                        gap: 6, padding: "6px 8px",
                        borderBottom: i < invoices.length - 1 ? "1px solid hsl(var(--border))" : "none",
                        background: hasTransporter ? "hsl(262 80% 98%)" : "transparent",
                        alignItems: "center",
                        transition: "background .15s",
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--foreground))" }}>
                        {inv.invoice_number}
                        <div style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", fontWeight: 400 }}>{fmtDate(inv.date)}</div>
                      </span>
                      <span style={{ fontSize: 11 }}>
                        {inv.customers?.name || "كاش"}
                        {inv.customers?.phone && <div style={{ fontSize: 9, color: "hsl(var(--muted-foreground))" }}>{inv.customers.phone}</div>}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, textAlign: "center" }}>
                        {fmtMoney(inv.total)}
                        <div style={{ fontSize: 9, color: "hsl(var(--muted-foreground))" }}>{inv.currency_code || "SDG"}</div>
                      </span>

                      {/* Transporter select */}
                      <select
                        value={r.transporterId}
                        onChange={e => setRowField(inv.id, "transporterId", e.target.value)}
                        style={{
                          width: "100%", height: 28, borderRadius: 4, fontSize: 11, padding: "0 6px",
                          border: `1px solid ${hasTransporter ? "#7c3aed" : "hsl(var(--border))"}`,
                          background: "hsl(var(--card))", color: "hsl(var(--foreground))",
                          outline: "none",
                        }}
                      >
                        <option value="">— اختر ناقلاً —</option>
                        {(transporters as any[]).map((t: any) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>

                      {/* Destination select */}
                      <select
                        value={r.destinationId}
                        onChange={e => setRowField(inv.id, "destinationId", e.target.value)}
                        style={{
                          width: "100%", height: 28, borderRadius: 4, fontSize: 11, padding: "0 6px",
                          border: "1px solid hsl(var(--border))",
                          background: "hsl(var(--card))", color: "hsl(var(--foreground))",
                          outline: "none",
                        }}
                      >
                        <option value="">— الوجهة (اختياري) —</option>
                        {(destinations as any[]).map((d: any) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>

                      {/* Notes */}
                      <input
                        type="text"
                        placeholder="ملاحظات..."
                        value={r.notes}
                        onChange={e => setRowField(inv.id, "notes", e.target.value)}
                        style={{
                          width: "100%", height: 28, borderRadius: 4, fontSize: 11, padding: "0 7px",
                          border: "1px solid hsl(var(--border))",
                          background: "hsl(var(--card))", color: "hsl(var(--foreground))",
                          outline: "none",
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Summary bar */}
              {readyToPrint.length > 0 && (
                <div style={{
                  marginTop: 10, padding: "8px 12px", borderRadius: 6,
                  background: "hsl(262 80% 97%)", border: "1px solid #e9d5ff",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>
                    ✅ {readyToPrint.length} فاتورة جاهزة للطباعة
                  </span>
                  <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
                    بعد الطباعة ستتغير حالتها إلى "في الطريق للترحيلات"
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "9px 16px", borderTop: "1px solid hsl(var(--border))", flexShrink: 0, display: "flex", justifyContent: "flex-start" }}>
          <Button variant="ghost" onClick={onClose} style={{ fontSize: 12, height: 30 }}>إغلاق</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
