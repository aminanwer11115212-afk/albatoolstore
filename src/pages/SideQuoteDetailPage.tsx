import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useCompanySettings } from "@/hooks/useData";

export default function SideQuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { data: companyArr } = useCompanySettings();
  const company = companyArr?.[0] || null;
  const baseCurrency = company?.currency || "SDG";

  const { data: quote, isLoading } = useQuery({
    queryKey: ["side-quote-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, customers(name, phone, address)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["side-quote-items", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", id!);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: transfers } = useQuery({
    queryKey: ["side-quote-transfers", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_ownership_transfers" as any)
        .select("*")
        .eq("quote_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Redirect to regular view if this quote isn't a side quote
  useEffect(() => {
    if (quote && !(quote as any).is_side) {
      navigate(`/quotes/view/${id}`, { replace: true });
    }
  }, [quote, id, navigate]);

  if (roleLoading || isLoading) {
    return <div className="content"><div className="legacy-card">جاري التحميل...</div></div>;
  }
  if (!isAdmin) {
    return (
      <article className="content">
        <div className="legacy-card" style={{ padding: 30, textAlign: "center" }}>
          <h3>غير مصرح</h3>
          <p>هذه الصفحة مخصصة للأدمن فقط.</p>
        </div>
      </article>
    );
  }
  if (!quote) {
    return (
      <article className="content">
        <div className="legacy-card" style={{ padding: 30, textAlign: "center" }}>
          <h3>غير موجود</h3>
          <button className="btn-xs btn-primary" onClick={() => navigate("/quotes/side")}>← العودة</button>
        </div>
      </article>
    );
  }

  const fmt = (n: any) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d?: string) => {
    if (!d) return "-";
    const p = String(d).split("T")[0].split("-");
    return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
  };
  const cur = (quote as any).currency_code || baseCurrency;

  return (
    <article className="content">
      <style>{`
        .sd-card { padding: 8px; }
        .sd-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
        .sd-badge { background:#ede9fe; color:#6d28d9; padding:3px 10px; border-radius:10px; font-weight:600; font-size:12px; }
        .sd-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:8px; margin:10px 0; }
        .sd-info { background:#f9fafb; padding:8px 10px; border-radius:6px; font-size:12px; }
        .sd-info b { color:#6d28d9; display:block; margin-bottom:2px; font-size:11px; }
        .sd-table { width:100%; font-size:11px; border-collapse:collapse; margin-top:8px; }
        .sd-table th { background:#7c3aed; color:#fff; padding:6px; }
        .sd-table td { padding:5px 6px; border-bottom:1px solid #eee; }
        .sd-actions { display:flex; gap:4px; flex-wrap:wrap; }
      `}</style>

      <div className="legacy-card sd-card">
        <div className="sd-header">
          <h5 style={{ margin: 0 }}>
            <span className="sd-badge">عرض سعر جانبي</span>
            <span style={{ marginRight: 8, fontSize: 14 }}>#{(quote as any).quote_number}</span>
          </h5>
          <div className="sd-actions">
            <button className="btn-xs" onClick={() => navigate("/quotes/side")}>← القائمة</button>
            <button className="btn-xs btn-warning" onClick={() => navigate(`/quotes/side/edit/${id}`)}>تعديل</button>
            <button className="btn-xs btn-info" onClick={async () => { navigate(`/preview/quote/${id}`); const { markQuoteAsSent } = await import("@/utils/quoteSentStatus"); await markQuoteAsSent(id); }}>طباعة</button>
          </div>
        </div>

        <div className="sd-grid">
          <div className="sd-info"><b>العميل</b>{(quote as any).customers?.name || "-"}</div>
          <div className="sd-info"><b>التاريخ</b>{fmtDate((quote as any).date)}</div>
          <div className="sd-info"><b>العملة</b>{cur}</div>
          <div className="sd-info"><b>الحالة</b>{(quote as any).status || "-"}</div>
          <div className="sd-info"><b>الإجمالي</b>{fmt((quote as any).total)} {cur}</div>
          <div className="sd-info"><b>الخصم</b>{fmt((quote as any).discount)}</div>
          {(quote as any).notes && <div className="sd-info" style={{ gridColumn: "1/-1" }}><b>ملاحظات</b>{(quote as any).notes}</div>}
        </div>

        <h6 style={{ margin: "10px 0 4px", color: "#6d28d9" }}>البنود ({items?.length || 0})</h6>
        <div style={{ overflowX: "auto" }}>
          <table className="sd-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th>المنتج</th>
                <th style={{ width: 60 }}>الكمية</th>
                <th style={{ width: 80 }}>الوحدة</th>
                <th style={{ width: 100 }}>السعر</th>
                <th style={{ width: 80 }}>الخصم</th>
                <th style={{ width: 110 }}>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {(items || []).length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 20, color: "#888" }}>لا توجد بنود</td></tr>
              ) : (items || []).map((it: any, i: number) => (
                <tr key={it.id}>
                  <td>{i + 1}</td>
                  <td>{it.product_name}</td>
                  <td>{it.quantity}</td>
                  <td>{it.unit || "-"}</td>
                  <td>{fmt(it.unit_price)}</td>
                  <td>{fmt(it.discount_value)}{it.format_discount === "percent" ? "%" : ""}</td>
                  <td>{fmt(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h6 style={{ margin: "14px 0 4px", color: "#6d28d9" }}>سجل نقل الملكية ({transfers?.length || 0})</h6>
        <div style={{ overflowX: "auto" }}>
          <table className="sd-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>من</th>
                <th>إلى</th>
                <th>بواسطة</th>
                <th>ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {(!transfers || transfers.length === 0) ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: 14, color: "#888" }}>لا يوجد سجل</td></tr>
              ) : (transfers as any[]).map((h: any) => (
                <tr key={h.id}>
                  <td>{new Date(h.created_at).toLocaleString("en-GB")}</td>
                  <td>{h.from_user_name || "-"}</td>
                  <td>{h.to_user_name || "-"}</td>
                  <td>{h.transferred_by_name || "-"}</td>
                  <td>{h.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  );
}
