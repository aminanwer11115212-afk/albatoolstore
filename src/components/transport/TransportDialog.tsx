import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTransporters, useDestinations } from "@/hooks/useData";
import { useDialogSize } from "@/hooks/useDialogSize";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Truck, Plus, Trash2, Printer, X } from "lucide-react";
import SearchableSelect from "./SearchableSelect";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parentType: "invoice" | "quote";
  parentId?: string;
  customerId?: string | null;
  showAllReady?: boolean;
}

export default function TransportDialog({ open, onOpenChange, parentType, parentId, customerId, showAllReady }: Props) {
  const isInvoice = parentType === "invoice";
  const table = isInvoice ? "invoice_transports" : "quote_transports";
  const idColumn = isInvoice ? "invoice_id" : "quote_id";

  const { data: transporters } = useTransporters();
  const { data: destinations } = useDestinations();

  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [allInvoices, setAllInvoices] = useState<any[]>([]);

  const [transporterId, setTransporterId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [transportDate, setTransportDate] = useState(new Date().toISOString().split("T")[0]);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");

  // ترشيح حسب موقع العميل
  const [allowedTransporterIds, setAllowedTransporterIds] = useState<Set<string> | null>(null);
  const [allowedDestinationIds, setAllowedDestinationIds] = useState<Set<string> | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [customerLoc, setCustomerLoc] = useState<{ region_id?: string; state_id?: string; locality_id?: string } | null>(null);

  // حالة الفواتير في وضع العرض الشامل
  const [invoiceRows, setInvoiceRows] = useState<Record<string, { transporterId: string; destinationId: string; notes: string }>>({});
  const [printing, setPrinting] = useState(false);

  // جلب الفواتير الجاهزة للرفع
  const loadAllInvoices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, date, total, currency_code, customers(id, name, phone)")
      .eq("workflow_status", "ready_to_ship")
      .order("date", { ascending: true });
    if (error) { toast.error(error.message); }
    else { setAllInvoices(data || []); }
    setLoading(false);
  };

  useEffect(() => { 
    if (open) {
      // دائماً نعرض جميع الفواتير الجاهزة للرفع عند فتح من صفحة الفاتورة
      if (!parentId || (parentId && showAllReady)) {
        loadAllInvoices();
      } else if (parentId) {
        load();
      }
    }
  }, [open, parentId, showAllReady]);

  const load = async () => {
    setLoading(true);
    const { data: trns } = await (supabase as any).from(table)
      .select("*, transporters(name), destinations(name)")
      .eq(idColumn, parentId)
      .order("created_at", { ascending: false });
    setList(trns || []);

    if (customerId) {
      // جلب موقع العميل
      const { data: cust } = await (supabase as any).from("customers")
        .select("region_id, state_id, locality_id").eq("id", customerId).maybeSingle();
      setCustomerLoc(cust || null);

      // النواقل المسموح بها = نواقل العميل المخصصة + نواقل المحلية
      const transporterIds = new Set<string>();
      const { data: ct } = await (supabase as any).from("customer_transporters")
        .select("transporter_id").eq("customer_id", customerId);
      (ct || []).forEach((r: any) => r.transporter_id && transporterIds.add(r.transporter_id));

      if (cust?.locality_id) {
        const { data: lt } = await (supabase as any).from("locality_transporters")
          .select("transporter_id").eq("locality_id", cust.locality_id);
        (lt || []).forEach((r: any) => r.transporter_id && transporterIds.add(r.transporter_id));
      }
      setAllowedTransporterIds(transporterIds.size > 0 ? transporterIds : null);

      // الوجهات المخصصة للعميل
      const { data: dests } = await supabase.from("customer_destinations")
        .select("destination_id, is_default").eq("customer_id", customerId);
      const destIds = new Set<string>((dests || []).map((d: any) => d.destination_id).filter(Boolean));
      // Only filter destinations if the customer actually has preferred destinations;
      // an empty Set would hide ALL destinations which is wrong.
      setAllowedDestinationIds(destIds.size > 0 ? destIds : null);

      if (!destinationId) {
        const def = (dests || []).find((d: any) => d.is_default);
        if (def) setDestinationId(def.destination_id);
      }
    } else {
      setAllowedTransporterIds(null);
      setAllowedDestinationIds(null);
      setCustomerLoc(null);
    }
    setLoading(false);
  };

  const filteredTransporters = (transporters as any[] || []).filter((t: any) =>
    showAll || !allowedTransporterIds || allowedTransporterIds.has(t.id)
  );
  const filteredDestinations = (destinations as any[] || []).filter((d: any) =>
    showAll || !allowedDestinationIds || allowedDestinationIds.has(d.id)
  );

  const handleAdd = async () => {
    if (!parentId) { toast.error("لا يمكن الإضافة بدون معرف الوثيقة"); return; }
    try {
      const row: any = {
        [idColumn]: parentId,
        transporter_id: transporterId || null,
        destination_id: destinationId || null,
        transport_date: transportDate,
        vehicle_number: vehicleNumber || null,
        driver_name: driverName || null,
        cost: parseFloat(cost) || 0,
        notes: notes || null,
      };
      if (!isInvoice && customerId) row.customer_id = customerId;
      const { error } = await (supabase as any).from(table).insert(row);
      if (error) throw error;
      toast.success("تمت الإضافة");
      setTransporterId(""); setDestinationId(""); setVehicleNumber(""); setDriverName(""); setCost(""); setNotes("");
      load();
      try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (tId: string) => {
    if (!confirm("حذف؟")) return;
    await (supabase as any).from(table).delete().eq("id", tId);
    toast.success("تم الحذف");
    load();
    try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
  };

  // === الوضع الشامل: جميع الفواتير الجاهزة للرفع ===
  const setRowField = (invoiceId: string, field: "transporterId" | "destinationId" | "notes", val: string) => {
    setInvoiceRows(prev => ({ ...prev, [invoiceId]: { transporterId: "", destinationId: "", notes: "", ...prev[invoiceId], [field]: val } }));
  };

  const readyToPrint = useMemo(() =>
    allInvoices.filter((inv: any) => (invoiceRows[inv.id]?.transporterId || "").length > 0),
    [allInvoices, invoiceRows]
  );

  const buildSingleInvoiceHTML = async (invoiceId: string, invoiceData: any, transporterId: string, destinationId: string, notes: string) => {
    const trans = (transporters as any[] || []).find((t: any) => t.id === transporterId);
    const dest = (destinations as any[] || []).find((d: any) => d.id === destinationId);
    
    // جلب بيانات الشركة
    const { data: companyArr } = await supabase.from("company_settings").select("*").limit(1);
    const company: any = companyArr?.[0] || {};
    const { resolveLogoUrl } = await import("@/utils/albatoolLogo");
    const logoURL = resolveLogoUrl(company.logo_url);
    
    // جلب البنود
    const { data: items } = await supabase.from("invoice_items").select("*, products(name)").eq("invoice_id", invoiceId);
    const itemsHTML = (items || []).map((it: any, i: number) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:center">${i + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">${it.products?.name || "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:center">${it.quantity || 0}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">${Number(it.unit_price || 0).toLocaleString()}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">${Number(it.total || 0).toLocaleString()}</td>
      </tr>
    `).join("");
    
    // جلب بيانات التغليف من الجدول الصحيح invoices_packaging_items
    const { data: packagingItems } = await (supabase as any)
      .from("invoices_packaging_items")
      .select("packs_count, pieces_per_pack, quantity, products(name), packaging_types(name)")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: true });

    let packagingHTML = "";
    if (packagingItems && packagingItems.length > 0) {
      const lines = packagingItems.map((pi: any, i: number) => {
        const packs = Number(pi.packs_count || 0);
        const pieces = Number(pi.pieces_per_pack || 0);
        const typeName = pi.packaging_types?.name || "—";
        const prodName = pi.products?.name || "—";
        const piecesPart = pieces > 1 ? ` × ${pieces}` : "";
        return `<div style="padding:3px 0;font-size:10px">${i + 1}) ${packs} — <b>${typeName}</b> ${prodName}${piecesPart}</div>`;
      }).join("");
      packagingHTML = `
        <tr><td colSpan="5" style="background:#e8f5e9;padding:8px;font-weight:bold;border-bottom:2px solid #4caf50">📦 بيانات التغليف</td></tr>
        <tr><td colSpan="5" style="padding:6px 10px">${lines}</td></tr>
      `;
    }
    
    const date = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
    const invoiceDate = invoiceData.date || "";
    
    return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/>
<title>فاتورة رقم ${invoiceData.invoice_number}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Tahoma,Arial,sans-serif;font-size:11px;padding:20px;color:#111;direction:rtl}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #2563eb}
.logo{width:80px;height:80px;border-radius:8px;object-fit:contain}
.company-info{text-align:right;flex:1;padding-right:20px}
.company-name{font-size:16px;font-weight:bold;color:#1e3a5f;margin-bottom:4px}
.company-details{font-size:9px;color:#555}
.doc-info{text-align:left;background:#f8f9fa;padding:10px;border-radius:8px;border:1px solid #e9ecef}
.doc-title{font-size:14px;font-weight:bold;color:#2563eb;margin-bottom:4px}
.doc-number{font-size:11px;color:#495057}
.customer-box{background:#f8f9fa;padding:12px;border-radius:8px;margin:15px 0;border:1px solid #e9ecef}
.customer-box table{width:100%}
.customer-box td{padding:3px 6px;font-size:10px}
.customer-label{font-weight:bold;color:#495057}
.transport-box{background:#fff3e0;padding:12px;border-radius:8px;margin:15px 0;border:2px solid #ff9800}
.transport-title{font-size:12px;font-weight:bold;color:#e65100;margin-bottom:8px}
.transport-title::before{content:"🚚 "}
table.items{width:100%;border-collapse:collapse;margin:15px 0}
table.items th{background:#2563eb;color:#fff;padding:8px;font-size:10px;text-align:right}
table.items td{border-bottom:1px solid #dee2e6;font-size:10px}
.totals{background:#f8f9fa;padding:15px;border-radius:8px;margin-top:15px}
.totals table{width:200px;margin-right:auto}
.totals td{padding:4px 8px;font-size:10px}
.total-row{background:#2563eb;color:#fff !important;font-weight:bold;font-size:12px !important}
.footer{text-align:center;margin-top:30px;padding-top:15px;border-top:1px solid #dee2e6;font-size:9px;color:#6c757d}
@media print{@page{margin:10mm;size:A5}}</style>
</head>
<body>
<div class="header">
  <img src="${logoURL}" class="logo" alt="Logo" onerror="this.style.display='none'"/>
  <div class="company-info">
    <div class="company-name">${company.company_name || "شركة"}</div>
    <div class="company-details">
      ${company.phone ? `📞 ${company.phone}` : ""} ${company.address ? ` | 📍 ${company.address}` : ""}
      ${company.email ? ` | ✉️ ${company.email}` : ""}
    </div>
  </div>
  <div class="doc-info">
    <div class="doc-title">🚚 ورقة الترحيل</div>
    <div class="doc-number">فاتورة رقم: ${invoiceData.invoice_number}</div>
    <div class="doc-number">التاريخ: ${invoiceDate}</div>
  </div>
</div>

<div class="customer-box">
  <table>
    <tr><td class="customer-label">👤 العميل:</td><td>${invoiceData.customers?.name || "كاش"}</td><td class="customer-label">📞 الهاتف:</td><td>${invoiceData.customers?.phone || "—"}</td></tr>
    <tr><td class="customer-label">💰 الإجمالي:</td><td style="font-weight:bold;color:#16a34a">${Number(invoiceData.total || 0).toLocaleString()} ${invoiceData.currency_code || "SDG"}</td><td class="customer-label">📝 ملاحظات:</td><td>${notes || "—"}</td></tr>
  </table>
</div>

<div class="transport-box">
  <div class="transport-title">بيانات الترحيل</div>
  <table>
    <tr><td style="width:80px;padding:4px"><b>🚛 الناقل:</b></td><td style="padding:4px">${trans?.name || "—"}</td></tr>
    <tr><td style="padding:4px"><b>📍 الوجهة:</b></td><td style="padding:4px">${dest?.name || "—"}</td></tr>
    <tr><td style="padding:4px"><b>📌 عنوان الوجهة:</b></td><td style="padding:4px">${dest?.description || "—"}</td></tr>
    <tr><td style="padding:4px"><b>📞 هاتف الناقل:</b></td><td style="padding:4px">${trans?.phone || "—"}</td></tr>
  </table>
</div>

<table class="items">
  <thead>
    <tr><th>#</th><th>المنتج</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr>
  </thead>
  <tbody>
    ${itemsHTML}
  </tbody>
</table>

${packagingHTML ? `
<table class="items">
  <tbody>${packagingHTML}</tbody>
</table>
` : ""}

<div class="totals">
  <table>
    <tr><td>المجموع:</td><td style="text-align:left">${Number(invoiceData.total || 0).toLocaleString()}</td></tr>
    <tr class="total-row"><td>الإجمالي:</td><td>${Number(invoiceData.total || 0).toLocaleString()} ${invoiceData.currency_code || "SDG"}</td></tr>
  </table>
</div>

<div class="footer">
  تم إنشاء هذه الوثيقة من نظام البلتول | التاريخ: ${date}
</div>
</body></html>`;
  };

  const handlePrintAndTransit = async () => {
    if (readyToPrint.length === 0) { toast.error("حدد ناقلاً لفاتورة واحدة على الأقل"); return; }
    setPrinting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      for (const inv of readyToPrint) {
        const transporterId = invoiceRows[inv.id]?.transporterId || "";
        const destinationId = invoiceRows[inv.id]?.destinationId || "";
        const notes = invoiceRows[inv.id]?.notes || "";

        const html = await buildSingleInvoiceHTML(inv.id, inv, transporterId, destinationId, notes);
        const win = window.open("", "_blank", "width=800,height=600");
        if (win) {
          win.document.write(html);
          win.document.close();
          win.onload = () => { win.print(); };
        }

        // حفظ سجل الترحيل في invoice_transports حتى لا يضيع الناقل والوجهة
        try {
          await (supabase as any).from("invoice_transports").insert({
            invoice_id: inv.id,
            transporter_id: transporterId || null,
            destination_id: destinationId || null,
            notes: notes || null,
            transport_date: today,
            status: "in_transit",
            shipped_at: new Date().toISOString(),
          });
        } catch (insErr) {
          console.error("insert invoice_transports failed", insErr);
        }

        await new Promise(r => setTimeout(r, 500));
      }

      const ids = readyToPrint.map((inv: any) => inv.id);
      // Use RPC for consistent automation logging in invoice_revisions
      await Promise.all(ids.map((id: string) =>
        supabase.rpc("advance_invoice_workflow" as any, {
          _invoice_id: id,
          _target: "in_transit",
          _reason: "طباعة كشف ترحيل",
        })
      ));
      toast.success(`✅ تم طباعة ${ids.length} فاتورة وتحويلها إلى "في الطريق للترحيلات"`);
      setInvoiceRows({});
      await loadAllInvoices();
      try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
      setPrinting(false);
    } catch (e: any) { toast.error(e.message); setPrinting(false); }
  };

  // Resizable dialog size (persisted per user)
  const { dlgRef, dlgStyle } = useDialogSize("transport_dialog", open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dlgRef as any}
        className="max-w-none p-0 overflow-hidden flex flex-col"
        style={dlgStyle}
        dir="rtl"
      >
        <DialogHeader className="px-4 pt-3 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-green-600" />
            {showAllReady ? "إضافة ترحيلات للفواتير الجاهزة للرفع" : "إدارة الترحيل"}
            {showAllReady && readyToPrint.length > 0 && (
              <span className="text-xs text-green-600 font-normal mr-2">({readyToPrint.length} مختارة)</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : showAllReady ? (
          <div className="flex-1 overflow-auto p-4">
            {allInvoices.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                لا توجد فواتير بحالة "جاهز للرفع"
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, background: "hsl(var(--muted)/0.5)", padding: "10px 14px", borderRadius: 8 }}>
                  <span style={{ background: "#fdf4ff", border: "1px solid #e9d5ff", borderRadius: 4, padding: "2px 7px", color: "#7c3aed", fontWeight: 600 }}>💡</span>
                  اختر ناقلاً لكل فاتورة تريد تضمينها في تقرير الترحيلات. الوجهة والملاحظات اختيارية.
                </div>

                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1, background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)", borderRadius: 10, padding: 14, color: "white" }}>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{allInvoices.length}</div>
                    <div style={{ fontSize: 11, opacity: 0.9 }}>فواتير جاهزة للرفع</div>
                  </div>
                  <div style={{ flex: 1, background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)", borderRadius: 10, padding: 14, color: "white" }}>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{readyToPrint.length}</div>
                    <div style={{ fontSize: 11, opacity: 0.9 }}>مختارة للترحيل</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 90px 150px 150px 1fr", gap: 6, padding: "10px 14px", background: "linear-gradient(90deg, #1e3a5f 0%, #2563eb 100%)", borderRadius: "10px 10px 0 0", fontSize: 10, fontWeight: 700, color: "white", boxShadow: "0 2px 10px rgba(0,0,0,0.2)" }}>
                  <span>الرقم</span><span>العميل</span><span style={{ textAlign: "center" }}>المبلغ</span><span>الناقل ⭐</span><span>الوجهة</span><span>ملاحظات</span>
                </div>
                <div style={{ border: "1px solid hsl(var(--border))", borderRadius: "0 0 10px 10px", overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
                  {allInvoices.map((inv: any, i: number) => {
                    const r = invoiceRows[inv.id] || { transporterId: "", destinationId: "", notes: "" };
                    const hasTransporter = r.transporterId.length > 0;
                    return (
                      <div key={inv.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 90px 150px 150px 1fr", gap: 6, padding: "12px 14px", borderBottom: i < allInvoices.length - 1 ? "1px solid hsl(var(--border))" : "none", background: hasTransporter ? "linear-gradient(90deg, hsl(262 80% 97%) 0%, hsl(262 80% 95%) 100%)" : i % 2 === 0 ? "hsl(var(--background))" : "hsl(var(--muted)/0.2)", alignItems: "center", transition: "all 0.2s" }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#2563eb" }}>{inv.invoice_number}</span>
                          <div style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>{inv.date}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 600 }}>{inv.customers?.name || "كاش"}</span>
                          {inv.customers?.phone && <div style={{ fontSize: 9, color: "hsl(var(--muted-foreground))" }}>📞 {inv.customers.phone}</div>}
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#16a34a" }}>{Number(inv.total || 0).toLocaleString()}</span>
                          <div style={{ fontSize: 9, color: "hsl(var(--muted-foreground))" }}>{inv.currency_code || "SDG"}</div>
                        </div>
                        <SearchableSelect
                          options={(transporters as any[] || []).map((t: any) => ({ id: t.id, name: t.name }))}
                          value={r.transporterId}
                          onChange={(val) => setRowField(inv.id, "transporterId", val)}
                          placeholder="🚚 اختر ناقلاً"
                          icon="🚛"
                          highlight
                        />
                        <SearchableSelect
                          options={(destinations as any[] || []).map((d: any) => ({ id: d.id, name: d.name }))}
                          value={r.destinationId}
                          onChange={(val) => setRowField(inv.id, "destinationId", val)}
                          placeholder="📍 الوجهة (اختياري)"
                          icon="📌"
                        />
                        <input type="text" placeholder="✏️ ملاحظات..." value={r.notes} onChange={(e) => setRowField(inv.id, "notes", e.target.value)} style={{ width: "100%", height: 34, borderRadius: 8, fontSize: 11, padding: "0 12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", outline: "none" }} />
                      </div>
                    );
                  })}
                </div>
                {readyToPrint.length > 0 && (
                  <div style={{ marginTop: 16, padding: "18px 22px", borderRadius: 14, background: "linear-gradient(135deg, hsl(262 80% 97%) 0%, hsl(262 80% 93%) 100%)", border: "2px solid #e9d5ff", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 6px 20px rgba(124, 58, 237, 0.2)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 16, boxShadow: "0 4px 12px rgba(124, 58, 237, 0.4)" }}>
                        {readyToPrint.length}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#7c3aed" }}>✅ فواتير جاهزة للطباعة</div>
                        <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>ستتحول إلى "في الطريق للترحيلات" بعد الطباعة</div>
                      </div>
                    </div>
                    <Button onClick={handlePrintAndTransit} disabled={printing} style={{ background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)", color: "white", fontSize: 13, height: 42, padding: "0 28px", borderRadius: 10, fontWeight: 700, boxShadow: "0 4px 16px rgba(22, 163, 74, 0.35)" }}>
                      <Printer size={16} /> {printing ? "جارٍ..." : "🖨️ طباعة وتحويل"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4 p-4 overflow-auto" style={{ flex: 1, minHeight: 0 }}>
            {/* Add Form */}
            <div className="bg-card rounded-lg border p-3">
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Plus size={14} /> إضافة ترحيل جديد
                </h3>
                {customerId && (allowedTransporterIds || allowedDestinationIds) && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground">
                      {showAll ? "عرض الكل" : `مرشّح حسب موقع العميل${customerLoc?.locality_id ? " (المحلية)" : customerLoc?.state_id ? " (الولاية)" : ""}`}
                    </span>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                      <span>عرض الكل</span>
                    </label>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-0.5">الناقل</label>
                  <SearchableSelect
                    options={filteredTransporters.map((t: any) => ({ id: t.id, name: t.name }))}
                    value={transporterId}
                    onChange={setTransporterId}
                    placeholder="اختر الناقل..."
                    icon="🚛"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-0.5">الوجهة</label>
                  <SearchableSelect
                    options={filteredDestinations.map((d: any) => ({ id: d.id, name: d.name }))}
                    value={destinationId}
                    onChange={setDestinationId}
                    placeholder="اختر الوجهة..."
                    icon="📍"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-0.5">التاريخ</label>
                  <input type="date" value={transportDate} onChange={(e) => setTransportDate(e.target.value)}
                    className="w-full bg-muted rounded-md px-2 py-1.5 text-xs border border-border h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-0.5">رقم المركبة</label>
                  <input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)}
                    className="w-full bg-muted rounded-md px-2 py-1.5 text-xs border border-border h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-0.5">السائق</label>
                  <input value={driverName} onChange={(e) => setDriverName(e.target.value)}
                    className="w-full bg-muted rounded-md px-2 py-1.5 text-xs border border-border h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-0.5">التكلفة</label>
                  <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0"
                    className="w-full bg-muted rounded-md px-2 py-1.5 text-xs border border-border h-8" step="0.01" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground block mb-0.5">ملاحظات</label>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-muted rounded-md px-2 py-1.5 text-xs border border-border h-8" />
                </div>
              </div>
              <div className="mt-2">
                <Button onClick={handleAdd} size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1 h-8">
                  <Plus size={14} /> إضافة
                </Button>
              </div>
            </div>

            {/* List */}
            <div className="bg-card rounded-lg border overflow-hidden">
              <div className="bg-green-600 text-white px-3 py-1.5 font-semibold text-xs">
                سجلات الترحيل ({list.length})
              </div>
              {list.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Truck size={32} className="mx-auto mb-2 opacity-30" />
                  لا توجد سجلات ترحيل
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr className="text-right">
                        <th className="px-2 py-1.5">#</th>
                        <th className="px-2 py-1.5">الناقل</th>
                        <th className="px-2 py-1.5">الوجهة</th>
                        <th className="px-2 py-1.5">التاريخ</th>
                        <th className="px-2 py-1.5">المركبة</th>
                        <th className="px-2 py-1.5">السائق</th>
                        <th className="px-2 py-1.5">التكلفة</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((t: any, i: number) => (
                        <tr key={t.id} className="border-t hover:bg-muted/40">
                          <td className="px-2 py-1.5">{i + 1}</td>
                          <td className="px-2 py-1.5">{t.transporters?.name || "—"}</td>
                          <td className="px-2 py-1.5">{t.destinations?.name || "—"}</td>
                          <td className="px-2 py-1.5">{t.transport_date}</td>
                          <td className="px-2 py-1.5">{t.vehicle_number || "—"}</td>
                          <td className="px-2 py-1.5">{t.driver_name || "—"}</td>
                          <td className="px-2 py-1.5">{Number(t.cost || 0).toLocaleString()}</td>
                          <td className="px-2 py-1.5">
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)} className="text-destructive h-6 w-6 p-0">
                              <Trash2 size={12} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
