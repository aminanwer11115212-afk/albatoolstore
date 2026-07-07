import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { startsWithAny } from "@/utils/searchMatch";
import { useUserRole } from "@/hooks/useUserRole";
import { useCompanySettings } from "@/hooks/useData";
import { MobileDocCard, mobileDocListCSS } from "@/components/mobile/MobileDocList";
import { useConfirmDelete } from "@/components/common/ConfirmDeleteProvider";

function useSideQuotes() {
  return useQuery({
    queryKey: ["side-quotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, customers(name, phone)")
        .eq("is_side", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useEmployeesWithAccount() {
  return useQuery({
    queryKey: ["employees-with-account"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, user_id")
        .not("user_id", "is", null);
      if (error) throw error;
      return data || [];
    },
  });
}

export default function SideQuotesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { data: quotes, isLoading } = useSideQuotes();
  const { data: companyArr } = useCompanySettings();
  const { data: employees } = useEmployeesWithAccount();
  const company = companyArr?.[0] || null;
  const currency = company?.currency || "SDG";
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState<number>(10);
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<string>("");
  const [transferNote, setTransferNote] = useState<string>("");
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);

  const { data: history } = useQuery({
    queryKey: ["quote-transfers", historyOpenId],
    enabled: !!historyOpenId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_ownership_transfers" as any)
        .select("*")
        .eq("quote_id", historyOpenId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim();
    const base = (quotes || []).filter((q: any) =>
      !s ? true : startsWithAny([q.quote_number, q.customers?.name], s)
    );
    return base.slice(0, limit);
  }, [quotes, search, limit]);
  const totalCount = (quotes || []).length;

  if (roleLoading) return <div className="content"><div className="legacy-card">جاري التحميل...</div></div>;
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

  const fmtDate = (d?: string) => {
    if (!d) return "-";
    const p = d.split("-");
    return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
  };
  const fmtMoney = (n: any) =>
    Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const confirmDelete = useConfirmDelete();
  const handleDelete = (id: string) => {
    confirmDelete({
      title: "حذف عرض السعر الجانبي",
      description: "هل أنت متأكد من حذف هذا العرض الجانبي؟",
      successMessage: "تم الحذف",
      errorMessage: "تعذّر حذف العرض",
      onConfirm: async () => {
        await supabase.from("quote_items").delete().eq("quote_id", id);
        const { error } = await supabase.from("quotes").delete().eq("id", id);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["side-quotes"] });
        qc.invalidateQueries({ queryKey: ["quotes-full"] });
        qc.invalidateQueries({ queryKey: ["quotes-with-customers"] });
      },
    });
  };


  const handleConvert = async (q: any) => {
    if (!confirm(`تحويل العرض الجانبي ${q.quote_number} إلى فاتورة؟ سيتم حذف عرض السعر من القائمة بعد التحويل.`)) return;
    try {
      const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");
      const { invoiceId, invoiceNumber, stockDeducted, deductedLineCount } = await convertQuoteToInvoice(q.id);
      const stockMsg = stockDeducted ? ` · ✅ تم خصم المخزون تلقائيًا (${deductedLineCount} صنف)` : "";
      toast.success(`تم التحويل إلى فاتورة ${invoiceNumber} — تم حذف عرض السعر${stockMsg}`);
      qc.invalidateQueries({ queryKey: ["side-quotes"] });
      qc.invalidateQueries({ queryKey: ["quotes-full"] });
      qc.invalidateQueries({ queryKey: ["quotes-with-customers"] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
      navigate(`/invoices/edit/${invoiceId}`);
    } catch (e: any) {
      const { reportCriticalError } = await import("@/utils/errorReporter");
      reportCriticalError({
        title: "فشل تحويل العرض الجانبي إلى فاتورة",
        error: e,
        context: `SideQuotesPage.handleConvert(quote=${q?.quote_number || q?.id})`,
        fallbackMessage: "تعذّر إتمام التحويل — راجع البنود والاتصال ثم أعد المحاولة",
      });
    }
  };

  const handlePrintSide = async (q: any) => {
    navigate(`/preview/quote/${q.id}`);
    const { markQuoteAsSent } = await import("@/utils/quoteSentStatus");
    await markQuoteAsSent(q.id);
    qc.invalidateQueries({ queryKey: ["side-quotes"] });
  };

  const handleTransfer = async (id: string, currentOwnerUid: string | null) => {
    if (!transferTarget) {
      toast.error("اختر مستخدماً");
      return;
    }
    try {
      const { data: userData } = await supabase.auth.getUser();
      const actorUid = userData?.user?.id;
      if (!actorUid) throw new Error("غير مصادق");

      const fromName = currentOwnerUid ? ownerName(currentOwnerUid) : null;
      const toName = ownerName(transferTarget);
      const actorEmp = (employees || []).find((x: any) => x.user_id === actorUid);
      const actorName = actorEmp?.name || userData?.user?.email || null;

      const { error } = await supabase
        .from("quotes")
        .update({ created_by_uid: transferTarget })
        .eq("id", id);
      if (error) throw error;

      const { error: logErr } = await supabase
        .from("quote_ownership_transfers" as any)
        .insert({
          quote_id: id,
          from_user_id: currentOwnerUid,
          to_user_id: transferTarget,
          from_user_name: fromName,
          to_user_name: toName,
          transferred_by: actorUid,
          transferred_by_name: actorName,
          note: transferNote.trim() || null,
        });
      if (logErr) {
        console.warn("transfer log failed:", logErr);
        toast.message("تم نقل الملكية لكن فشل تسجيل سجل التدقيق");
      }

      toast.success("تم نقل الملكية");
      setTransferringId(null);
      setTransferTarget("");
      setTransferNote("");
      qc.invalidateQueries({ queryKey: ["side-quotes"] });
      qc.invalidateQueries({ queryKey: ["quote-transfers"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const ownerName = (uid: string | null) => {
    if (!uid) return "-";
    const e = (employees || []).find((x: any) => x.user_id === uid);
    return e?.name || uid.slice(0, 6);
  };

  return (
    <article className="content quotes-compact">
      <style>{`
        .quotes-compact { font-size: 11px; }
        .quotes-compact .legacy-card { padding: 6px; }
        .quotes-compact h5 { font-size: 13px; margin: 4px 0; }
        .quotes-compact .legacy-table { font-size: 11px; }
        .quotes-compact .legacy-table th { padding: 5px 6px; background:#7c3aed; color:#fff; }
        .quotes-compact .legacy-table td { padding: 3px 6px; }
        .quotes-compact .btn-xs { padding: 2px 6px; font-size: 10px; height: 22px; line-height: 18px; }
        .side-badge { display:inline-block; background:#ede9fe; color:#6d28d9; padding:2px 8px; border-radius:10px; font-weight:600; }
        ${mobileDocListCSS}
      `}</style>
      <div className="legacy-card" style={{ position: "relative" }}>
        <div className="grid_3 grid_4 table-responsive">
          <h5>
            <span className="side-badge">آخر {limit} عروض أسعار جانبية</span>
            <span style={{ float: "left" }}>
              <button
                className="btn-xs btn-primary"
                onClick={() => navigate("/quotes/side/new")}
              >
                + عرض سعر جانبي جديد
              </button>
            </span>
          </h5>
          <hr />

          <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0", flexWrap: "wrap" }}>
            <input
              type="search"
              placeholder="بحث برقم العرض أو العميل..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ height: 26, fontSize: 12, padding: "2px 8px", flex: 1, maxWidth: 320 }}
            />
            <label style={{ fontSize: 11, color: "#555", display: "inline-flex", alignItems: "center", gap: 4 }}>
              عدد:
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                style={{ height: 26, fontSize: 12, padding: "2px 6px", border: "1px solid #ddd6fe", borderRadius: 4, background: "#faf5ff", color: "#5b21b6", fontWeight: 600 }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <span style={{ color: "#666" }}>{filtered.length} من {totalCount}</span>
          </div>

          <div className="desktop-table-wrap" style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto", border: "1px solid hsl(var(--border))", borderRadius: 4 }}>
            <table className="legacy-table" cellSpacing={0} width="100%">
              <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th style={{ width: 90 }}># عرض</th>
                  <th>العميل</th>
                  <th style={{ width: 100 }}>التاريخ</th>
                  <th style={{ width: 130 }}>المبلغ</th>
                  <th style={{ width: 130 }}>المنشئ</th>
                  <th style={{ width: 360 }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} style={{ textAlign: "center", padding: 30 }}>جاري التحميل...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: "center", padding: 30 }}>لا توجد عروض جانبية</td></tr>
                ) : filtered.map((q: any, idx: number) => (
                  <tr key={q.id} className={idx % 2 === 0 ? "odd" : "even"}>
                    <td>{idx + 1}</td>
                    <td>{q.quote_number}</td>
                    <td>{q.customers?.name || "-"}</td>
                    <td>{fmtDate(q.date)}</td>
                    <td>{fmtMoney(q.total)} {q.currency_code || currency}</td>
                    <td>{ownerName(q.created_by_uid)}</td>
                    <td>
                      <span style={{ display: "inline-flex", gap: 3, flexWrap: "wrap" }}>
                        <button className="btn-xs btn-success" onClick={() => navigate(`/quotes/side/${q.id}`)}>عرض</button>
                        <button className="btn-xs btn-warning" onClick={() => navigate(`/quotes/side/edit/${q.id}`)}>تعديل</button>
                        <button className="btn-xs btn-info" onClick={() => handlePrintSide(q)}>طباعة</button>
                        <button className="btn-xs btn-primary" onClick={() => handleConvert(q)}>→ فاتورة</button>
                        <button className="btn-xs" style={{ background:"#8b5cf6", color:"#fff" }} onClick={() => { setTransferringId(q.id); setTransferTarget(""); setTransferNote(""); }}>نقل ملكية</button>
                        <button className="btn-xs" style={{ background:"#0ea5e9", color:"#fff" }} onClick={() => setHistoryOpenId(historyOpenId === q.id ? null : q.id)}>سجل النقل</button>
                        <button className="btn-xs btn-danger" onClick={() => handleDelete(q.id)}>🗑</button>
                      </span>
                      {transferringId === q.id && (
                        <div style={{ marginTop: 6, padding: 6, background: "#f5f3ff", borderRadius: 4, display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                          <select
                            value={transferTarget}
                            onChange={(e) => setTransferTarget(e.target.value)}
                            style={{ height: 24, fontSize: 11, flex: 1, minWidth: 140 }}
                          >
                            <option value="">-- اختر المستخدم الجديد --</option>
                            {(employees || []).filter((e: any) => e.user_id !== q.created_by_uid).map((e: any) => (
                              <option key={e.id} value={e.user_id}>{e.name}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="ملاحظة (اختياري)"
                            value={transferNote}
                            onChange={(e) => setTransferNote(e.target.value)}
                            style={{ height: 24, fontSize: 11, flex: 1, minWidth: 140, padding: "0 6px" }}
                          />
                          <button className="btn-xs btn-success" onClick={() => handleTransfer(q.id, q.created_by_uid)}>تأكيد</button>
                          <button className="btn-xs" onClick={() => { setTransferringId(null); setTransferTarget(""); setTransferNote(""); }}>إلغاء</button>
                        </div>
                      )}
                      {historyOpenId === q.id && (
                        <div style={{ marginTop: 6, padding: 8, background: "#f0f9ff", borderRadius: 4, border: "1px solid #bae6fd" }}>
                          <strong style={{ fontSize: 11 }}>سجل نقل الملكية:</strong>
                          {!history || history.length === 0 ? (
                            <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>لا يوجد سجل نقل لهذا العرض.</div>
                          ) : (
                            <table className="legacy-table" cellSpacing={0} width="100%" style={{ marginTop: 4, fontSize: 10 }}>
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
                                {(history as any[]).map((h: any) => (
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
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards list */}
          <div className="mobile-doc-list">
            {isLoading ? (
              <div style={{ textAlign: "center", padding: 30 }}>جاري التحميل...</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "hsl(var(--muted-foreground))" }}>لا توجد عروض جانبية</div>
            ) : filtered.map((q: any, idx: number) => (
              <MobileDocCard
                key={q.id}
                index={idx + 1}
                number={q.quote_number}
                party={q.customers?.name || "-"}
                date={fmtDate(q.date)}
                amount={`${fmtMoney(q.total)} ${q.currency_code || currency}`}
                status={<span className="side-badge">{ownerName(q.created_by_uid)}</span>}
                onOpen={() => navigate(`/quotes/side/${q.id}`)}
                actions={
                  <>
                    <button className="btn-xs btn-warning" onClick={() => navigate(`/quotes/side/edit/${q.id}`)}>✎ تعديل</button>
                    <button className="btn-xs btn-info" onClick={() => handlePrintSide(q)}>🖨 طباعة</button>
                    <button className="btn-xs btn-primary" onClick={() => handleConvert(q)}>→ فاتورة</button>
                    <button className="btn-xs btn-danger" onClick={() => handleDelete(q.id)}>🗑 حذف</button>
                  </>
                }
              />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
