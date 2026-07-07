import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTransporters, useDestinations } from "@/hooks/useData";
import { toast } from "sonner";
import { Plus, Trash2, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import TransportItemsManager from "@/components/transport/TransportItemsManager";
import ZoomControls from "@/components/ZoomControls";

export default function InvoiceTransportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backToEdit = (location.state as any)?.from === "edit";
  const backPath = backToEdit ? `/invoices/create?edit=${id}` : `/invoices/view/${id}`;
  const { data: transporters } = useTransporters();
  const { data: destinations } = useDestinations();

  const [invoice, setInvoice] = useState<any>(null);
  const [list, setList] = useState<any[]>([]);
  const [invoiceProductIds, setInvoiceProductIds] = useState<string[]>([]);
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>({});
  const [shippedTotals, setShippedTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [transporterId, setTransporterId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [transportDate, setTransportDate] = useState(new Date().toISOString().split("T")[0]);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [cost, setCost] = useState("0");
  const [notes, setNotes] = useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  useEffect(() => { load();   }, [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: inv, error: invErr } = await supabase.from("invoices").select("*, customers(id, name)").eq("id", id).single();
      if (invErr) throw invErr;
      setInvoice(inv);

      const { data: items, error: itemsErr } = await supabase.from("invoice_items").select("product_id, quantity").eq("invoice_id", id);
      if (itemsErr) throw itemsErr;
      const ids: string[] = [];
      const qtyMap: Record<string, number> = {};
      (items || []).forEach((it: any) => {
        if (!it.product_id) return;
        if (!ids.includes(it.product_id)) ids.push(it.product_id);
        qtyMap[it.product_id] = (qtyMap[it.product_id] || 0) + Number(it.quantity || 0);
      });
      setInvoiceProductIds(ids);
      setProductQuantities(qtyMap);

      const { data: trns, error: trnsErr } = await supabase.from("invoice_transports")
        .select("*, transporters(name), destinations(name)")
        .eq("invoice_id", id)
        .order("created_at", { ascending: false });
      if (trnsErr) throw trnsErr;
      setList(trns || []);

      const trnIds = (trns || []).map((t: any) => t.id);
      if (trnIds.length) {
        const { data: tItems, error: tItemsErr } = await (supabase as any).from("invoices_transports_items")
          .select("product_id, quantity").in("invoice_transport_id", trnIds);
        if (tItemsErr) throw tItemsErr;
        const sMap: Record<string, number> = {};
        (tItems || []).forEach((it: any) => {
          if (!it.product_id) return;
          sMap[it.product_id] = (sMap[it.product_id] || 0) + Number(it.quantity || 0);
        });
        setShippedTotals(sMap);
      } else {
        setShippedTotals({});
      }

      if (inv?.customer_id) {
        try {
          const { fetchCustomerTransportDefaults } = await import("@/utils/customerTransportDefaults");
          const defaults = await fetchCustomerTransportDefaults(inv.customer_id);
          if (defaults.destinationId && !destinationId) setDestinationId(defaults.destinationId);
          if (defaults.transporterId && !transporterId) setTransporterId(defaults.transporterId);
        } catch (prefErr) {
          console.warn("customer preferences load failed:", prefErr);
        }
      }
    } catch (e: any) {
      console.error("transport load failed:", e);
      toast.error(e?.message || "تعذّر تحميل بيانات الترحيل");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!id) return;
    if (!transporterId) { toast.error("اختر الناقل"); return; }
    const costNum = parseFloat(cost);
    if (cost !== "" && (!isFinite(costNum) || costNum < 0)) { toast.error("التكلفة غير صحيحة"); return; }
    try {
      const { error } = await supabase.from("invoice_transports").insert({
        invoice_id: id,
        transporter_id: transporterId || null,
        destination_id: destinationId || null,
        transport_date: transportDate,
        vehicle_number: vehicleNumber || null,
        driver_name: driverName || null,
        cost: isFinite(costNum) ? costNum : 0,
        notes: notes || null,
      });
      if (error) throw error;
      toast.success("تم إضافة الترحيل");
      setTransporterId(""); setVehicleNumber(""); setDriverName(""); setCost("0"); setNotes("");
      load();
    } catch (e: any) {
      console.error("transport insert failed:", e);
      toast.error(e?.message || "تعذّر إضافة الترحيل");
    }
  };

  const handleDelete = async (tId: string) => {
    if (!confirm("حذف هذا الترحيل وبنوده؟")) return;
    try {
      const { error } = await supabase.from("invoice_transports").delete().eq("id", tId);
      if (error) throw error;
      toast.success("تم الحذف");
      load();
    } catch (e: any) {
      console.error("transport delete failed:", e);
      toast.error(e?.message || "تعذّر حذف الترحيل");
    }
  };

  const toggleExpanded = (tId: string) => {
    const next = new Set(expanded);
    if (next.has(tId)) next.delete(tId); else next.add(tId);
    setExpanded(next);
  };

  const normalize = (s: any) =>
    String(s ?? "").toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[إأآا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
      .replace(/\s+/g, " ").trim();

  const filtered = useMemo(() => {
    const tokens = normalize(search).split(" ").filter(Boolean);
    if (!tokens.length) return list;
    return list.filter((t: any) => {
      const hay = normalize([
        t.transporters?.name, t.destinations?.name, t.transport_date,
        t.vehicle_number, t.driver_name, t.cost, t.notes,
      ].join(" "));
      return tokens.every((tk) => hay.includes(tk));
    });
  }, [list, search]);

  const showAll = perPage === -1;
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginated = showAll ? filtered : filtered.slice((safePage - 1) * perPage, safePage * perPage);

  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);

  if (loading) return (
    <article className="content"><div className="legacy-card card-block">
      <div style={{ textAlign: "center", padding: "3rem" }}>جارٍ التحميل...</div>
    </div></article>
  );

  return (
    <article className="content neo-quote-scope" dir="rtl">
      <style>{`
        .neo-quote-scope .header-bar { display:flex; flex-wrap:wrap; gap:6px; align-items:flex-end; background: hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:6px; padding:5px 8px; margin-bottom:6px; }
        .neo-quote-scope .header-bar .field { display:flex; flex-direction:column; }
        .neo-quote-scope .header-bar label { font-size:10px; color: hsl(var(--muted-foreground)); margin-bottom:1px; display:block; }
        .neo-quote-scope .header-bar .form-control { width:100%; padding:2px 5px; height:24px; font-size:11px; border:1px solid hsl(var(--input)); border-radius:4px; background: hsl(var(--card)); color: hsl(var(--foreground)); }
        .neo-quote-scope .header-bar .form-control[readonly] { background: hsl(var(--muted) / 0.5); cursor: not-allowed; }
        .neo-quote-scope .header-bar .field .form-control.customer-name-input { font-size:14px; font-weight:600; }
        .neo-quote-scope .excel-table { width:100%; border-collapse:collapse; }
        .neo-quote-scope .excel-table .item_header { background:#3b82f6 !important; color:#ffffff !important; }
        .neo-quote-scope .excel-table .item_header th { padding:5px 4px; font-weight:600; font-size:11px; text-align:center; background:#3b82f6 !important; color:#ffffff !important; border-color:#3b82f6 !important; }
        .neo-quote-scope .excel-table .excel-row td { padding:2px 6px; border-bottom:1px solid hsl(var(--border)); font-size:11px; }
        .neo-quote-scope .excel-table .excel-row:nth-child(even) td { background: hsl(var(--muted) / 0.5); }
      `}</style>
      <div className="legacy-card card-block">
        <div className="grid_3 grid_4">
          <div className="header-block" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <h3 className="title" style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <span>إدارة ترحيل الفاتورة #{invoice?.invoice_number}</span>
              <button onClick={() => navigate(backPath)} className="legacy-btn legacy-btn-default btn-sm">
                <ArrowRight /> العودة للفاتورة
              </button>
              <ZoomControls />
            </h3>
          </div>

          {/* Header bar */}
          <div className="header-bar" style={{ marginTop: 8 }}>
            <div className="field" style={{ flex: "1 1 240px", minWidth: 220 }}>
              <label>العميل</label>
              <input className="form-control customer-name-input" value={invoice?.customers?.name || "كاش"} readOnly />
            </div>
            <div className="field" style={{ width: 140 }}>
              <label>رقم الفاتورة</label>
              <input className="form-control" value={invoice?.invoice_number || ""} readOnly />
            </div>
            <div className="field" style={{ width: 140 }}>
              <label>التاريخ</label>
              <input type="date" className="form-control" value={invoice?.date || ""} readOnly />
            </div>
            <div className="field" style={{ width: 90 }}>
              <label>العملة</label>
              <input className="form-control" value={invoice?.currency_code || "SDG"} readOnly />
            </div>
            <div className="field" style={{ width: 140 }}>
              <label>الإجمالي</label>
              <input className="form-control" value={Number(invoice?.total || 0).toLocaleString()} readOnly style={{ fontWeight: 600 }} />
            </div>
          </div>

          {/* Add form */}
          <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, padding: "0.75rem 1rem", marginBottom: "0.75rem" }}>
            <h5 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus /> إضافة ترحيل جديد
            </h5>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.5rem", alignItems: "end" }}>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>الناقل</label>
                <select className="legacy-control" value={transporterId} onChange={(e) => setTransporterId(e.target.value)}>
                  <option value="">اختر الناقل</option>
                  {(transporters as any[] || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>الوجهة</label>
                <select className="legacy-control" value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
                  <option value="">اختر الوجهة</option>
                  {(destinations as any[] || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>التاريخ</label>
                <input type="date" className="legacy-control" value={transportDate} onChange={(e) => setTransportDate(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>رقم المركبة</label>
                <input className="legacy-control" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>السائق</label>
                <input className="legacy-control" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>التكلفة</label>
                <input type="number" className="legacy-control" value={cost} step="0.01" onChange={(e) => setCost(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>ملاحظات</label>
                <input className="legacy-control" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div>
                <button onClick={handleAdd} className="legacy-btn legacy-btn-primary btn-sm" style={{ width: "100%" }}>
                  <Plus /> إضافة الترحيل
                </button>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="legacy-dt-toolbar">
            <label>
              أظهر{" "}
              <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={-1}>الكل</option>
              </select>{" "}
              مدخلات
            </label>
            <label>
              ابحث:
              <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </label>
          </div>

          {/* Table */}
          <table className="excel-table">
            <thead>
              <tr className="item_header">
                <th style={{ width: 36 }}></th>
                <th style={{ width: 50 }}>#</th>
                <th>الناقل</th>
                <th>الوجهة</th>
                <th style={{ width: 100 }}>التاريخ</th>
                <th>المركبة</th>
                <th>السائق</th>
                <th style={{ width: 100 }}>التكلفة</th>
                <th>ملاحظات</th>
                <th style={{ width: 80 }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: "2rem", fontSize: 11 }}>لا توجد سجلات ترحيل لهذه الفاتورة</td></tr>
              ) : paginated.map((t: any, i: number) => {
                const isOpen = expanded.has(t.id);
                return (
                  <React.Fragment key={t.id}>
                    <tr className="excel-row">
                      <td className="text-center">
                        <button onClick={() => toggleExpanded(t.id)}
                          className="legacy-btn legacy-btn-default btn-sm" title="بنود الترحيل"
                          style={{ padding: "2px 6px" }}>
                          {isOpen ? <ChevronUp /> : <ChevronDown />}
                        </button>
                      </td>
                      <td className="text-center">{(showAll ? 0 : (safePage - 1) * perPage) + i + 1}</td>
                      <td>{t.transporters?.name || "—"}</td>
                      <td>{t.destinations?.name || "—"}</td>
                      <td className="text-center">{t.transport_date}</td>
                      <td>{t.vehicle_number || "—"}</td>
                      <td>{t.driver_name || "—"}</td>
                      <td className="text-center">{Number(t.cost || 0).toLocaleString()}</td>
                      <td>{t.notes || "—"}</td>
                      <td className="text-center">
                        <button onClick={() => handleDelete(t.id)} className="legacy-btn legacy-btn-danger btn-sm" title="حذف">
                          <Trash2 />
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={10} style={{ padding: 0, background: "hsl(var(--muted) / 0.2)" }}>
                          <TransportItemsManager
                            itemsTable="invoices_transports_items"
                            parentFkColumn="invoice_transport_id"
                            parentId={t.id}
                            allowedProductIds={invoiceProductIds}
                            productQuantities={productQuantities}
                            shippedTotals={shippedTotals}
                            onItemsChanged={load}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  );
}
