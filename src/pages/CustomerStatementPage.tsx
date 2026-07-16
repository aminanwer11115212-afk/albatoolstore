import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCustomers, useCompanySettings } from "@/hooks/useData";
import { Search, X, Printer, Loader2 } from "lucide-react";
import type { FinancialReportData } from "@/utils/financialReportPrintTemplate";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";
import { netBalanceOf } from "@/utils/balanceDisplay";
import { classifyCreditRow, CREDIT_SOURCE_OPTIONS, type CreditSource } from "@/utils/creditSource";
import CreditConsumptionOrderControl from "@/components/statement/CreditConsumptionOrderControl";
import CustomerStatementErrorState from "@/components/statement/CustomerStatementErrorState";
import { useDeletedInvoicesForCustomer } from "@/hooks/useDeletedInvoicesForCustomer";

export default function CustomerStatementPage() {
  const { data: customers, isLoading: customersLoading, isError: customersError } = useCustomers();
  const { data: companyArr } = useCompanySettings();
  const company = (companyArr as any)?.[0] || null;
  const params = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const initialId = params.id || searchParams.get("customer") || "";
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialId);
  const [search, setSearch] = useState("");
  const [showSugg, setShowSugg] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"all" | "paid" | "unpaid" | "partial">("all");
  const [cashMode, setCashMode] = useState(false);
  const [creditSourceFilter, setCreditSourceFilter] = useState<Set<CreditSource>>(new Set());
  // Deleted-invoices section controls
  const [delSearch, setDelSearch] = useState("");
  const [delUserFilter, setDelUserFilter] = useState("");
  const [delSortKey, setDelSortKey] = useState<"deleted_at" | "date" | "invoice_number" | "user_email" | "total">("deleted_at");
  const [delSortDir, setDelSortDir] = useState<"asc" | "desc">("desc");
  // Invoices table: search + sort
  const [invSearch, setInvSearch] = useState("");
  const [invSortKey, setInvSortKey] = useState<"invoice_number" | "date" | "total" | "paid_amount" | "remaining">("date");
  const [invSortDir, setInvSortDir] = useState<"asc" | "desc">("desc");
  // Transactions table: type filter + sort
  const [txTypeFilter, setTxTypeFilter] = useState<"all" | "payment" | "credit" | "credit_consume" | "other">("all");
  const [txSortKey, setTxSortKey] = useState<"date" | "amount" | "type">("date");
  const [txSortDir, setTxSortDir] = useState<"asc" | "desc">("desc");
  const inputRef = useRef<HTMLInputElement>(null);
  // تبويبات صفحة كشف الحساب: الفواتير / محذوفة / حركات مالية.
  // الرصيد وصناديق الملخص وتحقّق الرصيد تظل مرئية دائماً فوق التبويبات.
  const [tab, setTab] = useState<"invoices" | "deleted" | "transactions">("invoices");
  const [exportingPdf, setExportingPdf] = useState(false);
  // مؤشر تصدير PDF: نستمع للحدث الذي يبعثه FinancialReportPreviewPage
  useEffect(() => {
    const onDone = (e: any) => {
      setExportingPdf(false);
      if (e?.detail?.ok) toast.success("تم تصدير كشف الحساب PDF");
      else toast.error("فشل تصدير PDF: " + (e?.detail?.error || "خطأ غير معروف"));
    };
    window.addEventListener("lov:pdf-export-result", onDone as any);
    return () => window.removeEventListener("lov:pdf-export-result", onDone as any);
  }, []);

  const matches = useMemo(() => {
    const q = search.trim();
    if (!q) return (customers || []).slice(0, 10);
    return (customers || []).filter((c: any) =>
      startsWithAny([c.name, c.phone], q)
    ).slice(0, 10);
  }, [search, customers]);

  useEffect(() => { setActiveIdx(0); }, [search]);

  // تحديث فوري عند حفظ فاتورة/تغيّر بيانات عميل في أي مكان بالتطبيق
  const qc = useQueryClient();
  useEffect(() => {
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["customer-statement"] });
      qc.invalidateQueries({ queryKey: ["customer-transactions"] });
    };
    window.addEventListener("invoices:changed", refresh);
    window.addEventListener("customers:changed", refresh);
    return () => {
      window.removeEventListener("invoices:changed", refresh);
      window.removeEventListener("customers:changed", refresh);
    };
  }, [qc]);

  const pickCustomer = (c: any) => {
    setSelectedCustomerId(c.id);
    setSearch(c.name);
    setShowSugg(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (!showSugg && (e.key === "ArrowDown" || e.key === "Enter")) { setShowSugg(true); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (matches[activeIdx]) pickCustomer(matches[activeIdx]); }
    else if (e.key === "Escape") { setShowSugg(false); }
  };

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["customer-statement", selectedCustomerId],
    queryFn: async () => {
      if (!selectedCustomerId) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("customer_id", selectedCustomerId)
        .neq("source", "pos")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCustomerId,
  });

  const { data: transactions } = useQuery({
    queryKey: ["customer-transactions", selectedCustomerId],
    queryFn: async () => {
      if (!selectedCustomerId) return [];
      // 1) IDs of POS (cash) invoices for this customer — used to exclude
      //    their linked payment transactions from the regular statement.
      const { data: posInvs } = await supabase
        .from("invoices")
        .select("id")
        .eq("customer_id", selectedCustomerId)
        .eq("source", "pos");
      const posIds = new Set((posInvs || []).map((r: any) => r.id));

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("customer_id", selectedCustomerId)
        .order("date", { ascending: false });
      if (error) throw error;
      // Exclude any transaction whose reference_id points to a POS invoice
      // (payments / cash-credit رصيد) so cash sales never bleed into the
      // regular customer statement.
      return (data || []).filter((t: any) => !t.reference_id || !posIds.has(t.reference_id));
    },
    enabled: !!selectedCustomerId,
  });

  const { data: deletedInvoices } = useDeletedInvoicesForCustomer(selectedCustomerId, fromDate, toDate);




  const filteredInvoices = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    let rows = (invoices || []).filter((inv: any) => {
      if (fromDate && inv.date < fromDate) return false;
      if (toDate && inv.date > toDate) return false;
      const total = Number(inv.total || 0);
      if (minAmount && total < Number(minAmount)) return false;
      if (maxAmount && total > Number(maxAmount)) return false;
      const paid = Number(inv.paid_amount || 0);
      if (paymentStatus === "paid" && paid < total) return false;
      if (paymentStatus === "unpaid" && paid > 0) return false;
      if (paymentStatus === "partial" && (paid === 0 || paid >= total)) return false;
      if (q && !String(inv.invoice_number || "").toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = invSortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((a: any, b: any) => {
      let av: any, bv: any;
      if (invSortKey === "remaining") {
        av = Number(a.total || 0) - Number(a.paid_amount || 0);
        bv = Number(b.total || 0) - Number(b.paid_amount || 0);
      } else if (invSortKey === "total" || invSortKey === "paid_amount") {
        av = Number(a[invSortKey] || 0); bv = Number(b[invSortKey] || 0);
      } else {
        av = a[invSortKey] ?? ""; bv = b[invSortKey] ?? "";
      }
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ar", { numeric: true }) * dir;
    });
    return rows;
  }, [invoices, fromDate, toDate, minAmount, maxAmount, paymentStatus, invSearch, invSortKey, invSortDir]);

  const toggleInvSort = (k: typeof invSortKey) => {
    if (invSortKey === k) setInvSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setInvSortKey(k); setInvSortDir("desc"); }
  };

  const classifyTx = (t: any): "payment" | "credit" | "credit_consume" | "other" => {
    if (t.category === "customer_payment") return "payment";
    if (t.category === "customer_credit") return Number(t.amount || 0) < 0 ? "credit_consume" : "credit";
    return "other";
  };

  const filteredTransactions = useMemo(() => {
    let rows = (transactions || []).filter((t: any) => {
      if (fromDate && t.date < fromDate) return false;
      if (toDate && t.date > toDate) return false;
      const amt = Math.abs(Number(t.amount || 0));
      if (minAmount && amt < Number(minAmount)) return false;
      if (maxAmount && amt > Number(maxAmount)) return false;
      if (t.category === "customer_credit" && creditSourceFilter.size > 0) {
        const info = classifyCreditRow(t);
        if (!creditSourceFilter.has(info.source)) return false;
      }
      if (txTypeFilter !== "all" && classifyTx(t) !== txTypeFilter) return false;
      return true;
    });
    const dir = txSortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((a: any, b: any) => {
      let av: any, bv: any;
      if (txSortKey === "amount") { av = Number(a.amount || 0); bv = Number(b.amount || 0); }
      else if (txSortKey === "type") { av = classifyTx(a); bv = classifyTx(b); }
      else { av = a.date ?? ""; bv = b.date ?? ""; }
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ar", { numeric: true }) * dir;
    });
    return rows;
  }, [transactions, fromDate, toDate, minAmount, maxAmount, creditSourceFilter, txTypeFilter, txSortKey, txSortDir]);

  const toggleTxSort = (k: typeof txSortKey) => {
    if (txSortKey === k) setTxSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setTxSortKey(k); setTxSortDir("desc"); }
  };

  // تجميع customer_credit حسب المصدر — لعرض ملخّص فرعي أعلى الجدول
  const creditGroups = useMemo(() => {
    const map = new Map<CreditSource, { label: string; total: number; count: number }>();
    for (const t of filteredTransactions) {
      if (t.category !== "customer_credit") continue;
      const info = classifyCreditRow(t);
      const cur = map.get(info.source) || { label: info.label, total: 0, count: 0 };
      cur.total += Number(t.amount || 0);
      cur.count += 1;
      map.set(info.source, cur);
    }
    return Array.from(map.entries()).map(([source, v]) => ({ source, ...v }));
  }, [filteredTransactions]);

  // في وضع الكاش: أظهر فقط customer_payment + customer_credit
  const cashRows = useMemo(() => {
    if (!cashMode) return [];
    return filteredTransactions.filter(
      (t: any) => t.category === "customer_payment" || t.category === "customer_credit",
    );
  }, [cashMode, filteredTransactions]);

  const selectedCustomer = (customers || []).find((c: any) => c.id === selectedCustomerId);
  const totalInvoices = filteredInvoices.reduce((s: number, inv: any) => s + Number(inv.total || 0), 0);
  const totalPaid = filteredInvoices.reduce((s: number, inv: any) => s + Number(inv.paid_amount || 0), 0);

  // ===== Deleted-invoices: search / user filter / sort =====
  const deletedUsers = useMemo(() => {
    const s = new Set<string>();
    (deletedInvoices || []).forEach((d) => { if (d.user_email) s.add(d.user_email); });
    return Array.from(s).sort();
  }, [deletedInvoices]);

  const visibleDeleted = useMemo(() => {
    const q = delSearch.trim().toLowerCase();
    let rows = (deletedInvoices || []).filter((d) => {
      if (delUserFilter && d.user_email !== delUserFilter) return false;
      if (!q) return true;
      const hay = `${d.invoice_number || ""} ${d.date || ""} ${d.user_email || ""}`.toLowerCase();
      return hay.includes(q);
    });
    const dir = delSortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const av = (a as any)[delSortKey] ?? "";
      const bv = (b as any)[delSortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ar") * dir;
    });
    return rows;
  }, [deletedInvoices, delSearch, delUserFilter, delSortKey, delSortDir]);

  const toggleDelSort = (k: typeof delSortKey) => {
    if (delSortKey === k) setDelSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setDelSortKey(k); setDelSortDir("desc"); }
  };

  // ===== Balance reconciliation: statement math vs netBalanceOf (shared across pages) =====
  const reconciliation = useMemo(() => {
    if (!selectedCustomer) return null;
    const allInv = (invoices || []) as any[];
    const expectedOpen = allInv
      .filter((i) => i.status !== "cancelled")
      .reduce((s, i) => s + Math.max(Number(i.total || 0) - Number(i.paid_amount || 0), 0), 0);
    const stored = Number((selectedCustomer as any).balance || 0);
    const credit = Number((selectedCustomer as any).credit_balance || 0);
    // net as computed by the statement itself, from the raw invoice/credit math
    const statementNet = expectedOpen - credit;
    // net as displayed everywhere else (Customers page, Debt report, InvoiceCreate header, CustomerDetail)
    const sharedNet = netBalanceOf(selectedCustomer);
    const delta = expectedOpen - stored;
    const netDelta = statementNet - sharedNet;
    return {
      expectedOpen,
      stored,
      credit,
      statementNet,
      sharedNet,
      delta,
      netDelta,
      ok: Math.abs(delta) < 0.01 && Math.abs(netDelta) < 0.01,
    };
  }, [invoices, selectedCustomer]);

  const resetFilters = () => {
    setFromDate(""); setToDate(""); setMinAmount(""); setMaxAmount(""); setPaymentStatus("all");
  };

  const navigate = useNavigate();
  const handleOpenPrint = () => {
    if (!selectedCustomer) return;
    const remaining = totalInvoices - totalPaid;
    const netBal = netBalanceOf(selectedCustomer);
    const netLabel = netBal > 0 ? "عليه (مدين لنا)" : netBal < 0 ? "له (دائن علينا)" : "خالص";
    const netColor: "red" | "green" = netBal > 0 ? "red" : "green";
    const payload: FinancialReportData = {
      title: "كشف حساب عميل",
      subtitle: selectedCustomer.name,
      fromDate, toDate,
      company: company || null,
      currency: company?.currency || "",
      summary: [
        { label: "إجمالي الفواتير", value: totalInvoices, color: "blue" },
        { label: "المدفوع", value: totalPaid, color: "green" },
        { label: "المتبقي", value: remaining, color: remaining > 0 ? "red" : "green" },
        { label: `الرصيد الصافي (${netLabel})`, value: Math.abs(netBal), color: netColor },
      ],
      sections: [
        {
          key: "invoices", label: `الفواتير (${filteredInvoices.length})`,
          columns: [
            { key: "invoice_number", label: "رقم الفاتورة", align: "center" },
            { key: "date", label: "التاريخ", align: "center" },
            { key: "total", label: "الإجمالي", numeric: true },
            { key: "paid", label: "المدفوع", numeric: true },
            { key: "remaining", label: "المتبقي", numeric: true },
          ],
          rows: filteredInvoices.map((inv: any) => ({
            invoice_number: inv.invoice_number,
            date: inv.date,
            total: Number(inv.total || 0),
            paid: Number(inv.paid_amount || 0),
            remaining: Number(inv.total || 0) - Number(inv.paid_amount || 0),
          })),
          totals: { invoice_number: "الإجمالي", total: totalInvoices, paid: totalPaid, remaining },
        },
        ...(filteredTransactions.length ? [{
          key: "transactions", label: `المعاملات (${filteredTransactions.length})`,
          columns: [
            { key: "date", label: "التاريخ", align: "center" as const },
            { key: "type", label: "النوع", align: "center" as const },
            { key: "amount", label: "المبلغ", numeric: true },
            { key: "description", label: "الوصف", align: "right" as const },
          ],
          rows: filteredTransactions.map((t: any) => ({
            date: t.date,
            type: t.type === "income" ? "إيراد" : t.type === "expense" ? "مصروف" : t.type || "—",
            amount: Number(t.amount || 0),
            description: t.description || "—",
          })),
        }] : []),
        ...(visibleDeleted.length ? [{
          key: "deleted_invoices",
          label: `فواتير محذوفة/ملغاة (${visibleDeleted.length}) — لا تُحسب في المجاميع`,
          headerColor: "#b91c1c",
          columns: [
            { key: "invoice_number", label: "رقم الفاتورة", align: "center" as const },
            { key: "date", label: "التاريخ", align: "center" as const },
            { key: "total", label: "الإجمالي", numeric: true },
            { key: "deleted_payments", label: "المدفوع المُلغى", numeric: true },
            { key: "items_count", label: "عدد البنود", numeric: true },
            { key: "restored_stock", label: "المخزون", align: "center" as const },
            { key: "deleted_at", label: "حُذفت في", align: "center" as const },
            { key: "user_email", label: "بواسطة", align: "center" as const },
          ],
          rows: visibleDeleted.map((d) => ({
            invoice_number: d.invoice_number || "—",
            date: d.date || "—",
            total: Number(d.total || 0),
            deleted_payments: Number(d.deleted_payments || d.paid_amount || 0),
            items_count: d.items_count,
            restored_stock: d.restored_stock ? "أُرجع" : "—",
            deleted_at: new Date(d.deleted_at).toLocaleString(),
            user_email: d.user_email || "—",
          })),
        }] : []),
      ],
    };
    sessionStorage.setItem("lov_financial_report_preview", JSON.stringify(payload));
    navigate("/reports/financial-preview");
  };

  return (
    <div className="space-y-6" dir="rtl">
      {selectedCustomer && (
        <div className="flex justify-end gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleOpenPrint}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm"
          >
            <Printer className="h-4 w-4" />
            معاينة وطباعة
          </button>
          <button
            type="button"
            disabled={exportingPdf}
            data-testid="statement-export-pdf"
            onClick={() => {
              try { sessionStorage.setItem("lov_financial_report_autoexport", "pdf"); } catch { /* ignore */ }
              setExportingPdf(true);
              toast.loading("جارٍ تجهيز PDF...", { id: "pdf-export" });
              handleOpenPrint();
            }}
            className="inline-flex items-center gap-2 bg-emerald-600 text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-semibold shadow-sm"
            title="ينتقل لصفحة المعاينة ثم يبدأ تنزيل PDF تلقائياً — الرقم المطبوع هو نفس netBalanceOf المعروض هنا"
          >
            {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>📄</span>}
            {exportingPdf ? "جارٍ التصدير..." : "تصدير PDF"}
          </button>
        </div>
      )}

      <div className="printable-statement space-y-6">
        <h1 data-section="header" data-section-label="العنوان" className="text-2xl font-bold text-foreground">كشف حساب عميل</h1>

        <div data-section="filters" data-section-label="الفلاتر" className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">ابحث عن العميل (بالاسم أو الهاتف)</label>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowSugg(true); if (selectedCustomerId) setSelectedCustomerId(""); }}
              onFocus={() => setShowSugg(true)}
              onBlur={() => setTimeout(() => setShowSugg(false), 150)}
              onKeyDown={handleKey}
              placeholder="ابدأ الكتابة..."
              className="w-full md:w-96 bg-muted rounded-lg pr-9 pl-9 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary"
            />
            {search && (
              <button type="button" onClick={() => { setSearch(""); setSelectedCustomerId(""); inputRef.current?.focus(); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
            {showSugg && matches.length > 0 && (
              <div className="absolute top-full right-0 mt-1 w-full md:w-96 bg-popover border-2 border-primary rounded-lg max-h-64 overflow-y-auto z-50 shadow-lg">
                {matches.map((c: any, i: number) => (
                  <div key={c.id}
                    onMouseDown={() => pickCustomer(c)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`px-3 py-2 text-sm cursor-pointer border-b border-border/50 last:border-0 ${i === activeIdx ? "bg-primary/15" : "hover:bg-primary/10"}`}>
                    <span className="font-medium text-foreground">{c.name}</span>
                    {c.phone && <span className="text-muted-foreground mr-2 text-xs">- {c.phone}</span>}
                  </div>
                ))}
              </div>
            )}
            {showSugg && search && matches.length === 0 && (
              <div className="absolute top-full right-0 mt-1 w-full md:w-96 bg-popover border border-border rounded-lg p-3 text-center text-sm text-muted-foreground z-50 shadow-lg">
                لا يوجد عميل بهذا الاسم
              </div>
            )}
          </div>
        </div>

        {selectedCustomerId && !customersLoading && !selectedCustomer && (
          <CustomerStatementErrorState
            title="لم يتم العثور على العميل"
            message="قد يكون تم حذف العميل أو أن الرابط قديم — عُد إلى قائمة العملاء واختر عميلاً آخر."
            detail={`id: ${selectedCustomerId.slice(0, 8)}`}
          />
        )}
        {customersError && (
          <CustomerStatementErrorState
            title="تعذّر جلب بيانات العملاء"
            message="فشل حساب netBalanceOf — تحقّق من الاتصال ثم أعد المحاولة."
            onRetry={() => window.location.reload()}
          />
        )}


        {selectedCustomerId && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t border-border">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">من تاريخ</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="w-full bg-muted rounded px-2 py-1.5 text-sm text-foreground border border-border outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">إلى تاريخ</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="w-full bg-muted rounded px-2 py-1.5 text-sm text-foreground border border-border outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">أقل مبلغ</label>
              <input type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="0"
                className="w-full bg-muted rounded px-2 py-1.5 text-sm text-foreground border border-border outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">أكبر مبلغ</label>
              <input type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="∞"
                className="w-full bg-muted rounded px-2 py-1.5 text-sm text-foreground border border-border outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">حالة الدفع</label>
              <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as any)}
                className="w-full bg-muted rounded px-2 py-1.5 text-sm text-foreground border border-border outline-none">
                <option value="all">الكل</option>
                <option value="paid">مدفوعة</option>
                <option value="unpaid">غير مدفوعة</option>
                <option value="partial">مدفوعة جزئياً</option>
              </select>
            </div>
            <div className="col-span-2 md:col-span-5 flex justify-end">
              <button type="button" onClick={resetFilters}
                className="text-xs text-muted-foreground hover:text-foreground underline">إعادة ضبط الفلاتر</button>
            </div>
          </div>
        )}
      </div>

      {selectedCustomer && (() => {
        const netBalance = netBalanceOf(selectedCustomer);
        const isDebtor = netBalance > 0;   // عليه — أحمر
        const isCreditor = netBalance < 0; // له — أخضر
        const balanceLabel = isDebtor ? "عليه" : isCreditor ? "له" : "خالص";
        const balanceColor = isDebtor
          ? "text-destructive"
          : isCreditor
          ? "text-success"
          : "text-muted-foreground";
        const balanceDisplay = isDebtor
          ? `- ${Math.abs(netBalance).toLocaleString()}`
          : isCreditor
          ? Math.abs(netBalance).toLocaleString()
          : "0";
        return (
        <>
          <div data-section="summary" data-section-label="صناديق الملخص" className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">العميل</p>
              <p className="text-lg font-bold text-foreground">{selectedCustomer.name}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">إجمالي الفواتير</p>
              <p className="text-lg font-bold text-primary">{totalInvoices.toLocaleString()}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">المدفوع</p>
              <p className="text-lg font-bold text-success">{totalPaid.toLocaleString()}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">المتبقي</p>
              <p className="text-lg font-bold text-destructive">{(totalInvoices - totalPaid).toLocaleString()}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">الرصيد الحالي ({balanceLabel})</p>
              <p className={`text-lg font-bold ${balanceColor}`}>{balanceDisplay}</p>
            </div>
          </div>

          {reconciliation && (
            <div
              data-section="reconciliation"
              data-section-label="تحقق الرصيد"
              className={`rounded-xl border p-4 shadow-sm text-sm space-y-2 ${
                reconciliation.ok
                  ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-800"
                  : "bg-destructive/5 border-destructive/40 text-destructive"
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <span className="font-semibold">
                  {reconciliation.ok ? "✅ الرصيد مطابق في كل الصفحات" : "⚠️ عدم تطابق في الرصيد"}
                </span>
                <span className="text-xs">
                  المتوقع (فواتير مفتوحة): <b className="tabular-nums">{reconciliation.expectedOpen.toLocaleString()}</b>
                </span>
                <span className="text-xs">
                  المخزَّن في بطاقة العميل: <b className="tabular-nums">{reconciliation.stored.toLocaleString()}</b>
                </span>
                <span className="text-xs">
                  الرصيد الدائن: <b className="tabular-nums">{reconciliation.credit.toLocaleString()}</b>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                <span>
                  صافي كشف الحساب (مفتوح − دائن): <b className="tabular-nums">{reconciliation.statementNet.toLocaleString()}</b>
                </span>
                <span>
                  صافي الفواتير/تقرير المديونين/بطاقة العميل (netBalanceOf): <b className="tabular-nums">{reconciliation.sharedNet.toLocaleString()}</b>
                </span>
                {!reconciliation.ok && (
                  <span>
                    الفارق: <b className="tabular-nums">
                      {(Math.abs(reconciliation.delta) > 0.01 ? reconciliation.delta : reconciliation.netDelta).toLocaleString()}
                    </b>
                    <span className="ms-2 opacity-80">— قد يلزم إعادة حساب الأرصدة من صفحة تقرير الديون.</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* شريط تبويبات: يفصل الأقسام التفصيلية عن صناديق الرصيد الدائم أعلى الصفحة */}
          <div data-testid="statement-tabs" role="tablist" className="flex flex-wrap gap-1 border-b border-border">
            {([
              ["invoices", `الفواتير (${filteredInvoices.length})`],
              ["deleted", `الفواتير المحذوفة (${(deletedInvoices || []).length})`],
              ["transactions", `الحركات المالية (${filteredTransactions.length})`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  tab === key
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div data-section="invoices" data-section-label="الفواتير" className={`legacy-card card-block ${tab === "invoices" ? "" : "hidden"}`}>
            <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-2 justify-between">
              <h3 className="font-semibold text-foreground">الفواتير ({filteredInvoices.length})</h3>
              <div className="relative">
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={invSearch}
                  onChange={(e) => setInvSearch(e.target.value)}
                  placeholder="بحث برقم الفاتورة"
                  className="bg-muted rounded pr-7 pl-2 py-1 text-xs text-foreground border border-border outline-none focus:ring-1 focus:ring-primary w-56"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm mobile-stack-table">
                <thead><tr className="bg-muted">
                  {([
                    ["invoice_number","رقم الفاتورة"],
                    ["date","التاريخ"],
                    ["total","المبلغ"],
                    ["paid_amount","المدفوع"],
                    ["remaining","المتبقي"],
                  ] as const).map(([k,label]) => {
                    const active = invSortKey === k;
                    return (
                      <th key={k} className="text-right px-5 py-3 font-semibold text-muted-foreground">
                        <button type="button" onClick={() => toggleInvSort(k as any)} className="inline-flex items-center gap-1 hover:text-foreground">
                          {label}
                          <span className="text-[10px] opacity-70">{active ? (invSortDir === "asc" ? "▲" : "▼") : "↕"}</span>
                        </button>
                      </th>
                    );
                  })}
                </tr></thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
                  : !filteredInvoices.length ? <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد فواتير مطابقة</td></tr>
                  : filteredInvoices.map((inv: any) => (
                    <tr key={inv.id} className="border-b border-border hover:bg-muted/50">
                      <td data-label="رقم الفاتورة" className="px-5 py-3 text-foreground">{inv.invoice_number}</td>
                      <td data-label="التاريخ" className="px-5 py-3 text-foreground">{inv.date}</td>
                      <td data-label="المبلغ" className="px-5 py-3 text-foreground">{Number(inv.total).toLocaleString()}</td>
                      <td data-label="المدفوع" className="px-5 py-3 text-success">{Number(inv.paid_amount).toLocaleString()}</td>
                      <td data-label="المتبقي" className="px-5 py-3 text-destructive">{(Number(inv.total) - Number(inv.paid_amount)).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>


          {(deletedInvoices || []).length > 0 && (
            <div data-section="deleted-invoices" data-section-label="فواتير محذوفة" className={`legacy-card card-block border-destructive/30 ${tab === "deleted" ? "" : "hidden"}`}>
              <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-2 justify-between">
                <h3 className="font-semibold text-destructive flex items-center gap-2">
                  <span>🗑</span>
                  فواتير محذوفة ({visibleDeleted.length} / {deletedInvoices!.length})
                  <span className="text-[11px] font-normal text-muted-foreground">— لا تُحسب في المجاميع، الرصيد أُعيد حسابه</span>
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={delSearch}
                      onChange={(e) => setDelSearch(e.target.value)}
                      placeholder="بحث بالرقم/التاريخ/المستخدم"
                      className="bg-muted rounded pr-7 pl-2 py-1 text-xs text-foreground border border-border outline-none focus:ring-1 focus:ring-primary w-56"
                    />
                  </div>
                  <select
                    value={delUserFilter}
                    onChange={(e) => setDelUserFilter(e.target.value)}
                    className="bg-muted rounded px-2 py-1 text-xs text-foreground border border-border outline-none"
                  >
                    <option value="">كل المستخدمين</option>
                    {deletedUsers.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  {(delSearch || delUserFilter) && (
                    <button type="button" onClick={() => { setDelSearch(""); setDelUserFilter(""); }}
                      className="text-[11px] text-muted-foreground underline hover:text-foreground">مسح</button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm mobile-stack-table">
                  <thead><tr className="bg-destructive/5">
                    {([
                      ["invoice_number", "رقم الفاتورة"],
                      ["date", "التاريخ"],
                      ["total", "الإجمالي"],
                      ["deleted_payments", "المدفوع المُلغى"],
                      ["items_count", "البنود"],
                      ["deleted_at", "حُذفت في"],
                      ["user_email", "بواسطة"],
                    ] as const).map(([k, label]) => {
                      const sortable = ["invoice_number","date","total","deleted_at","user_email"].includes(k as string);
                      const active = delSortKey === k;
                      return (
                        <th key={k} className="text-right px-5 py-3 font-semibold text-muted-foreground">
                          {sortable ? (
                            <button type="button" onClick={() => toggleDelSort(k as any)} className="inline-flex items-center gap-1 hover:text-foreground">
                              {label}
                              <span className="text-[10px] opacity-70">{active ? (delSortDir === "asc" ? "▲" : "▼") : "↕"}</span>
                            </button>
                          ) : label}
                        </th>
                      );
                    })}
                  </tr></thead>
                  <tbody>
                    {visibleDeleted.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-6 text-muted-foreground text-xs">لا توجد نتائج مطابقة</td></tr>
                    ) : visibleDeleted.map((d) => (
                      <tr key={d.id} className="border-b border-border bg-destructive/5 hover:bg-destructive/10">
                        <td data-label="رقم الفاتورة" className="px-5 py-3 text-foreground line-through">{d.invoice_number || "—"}</td>
                        <td data-label="التاريخ" className="px-5 py-3 text-foreground tabular-nums">{d.date || "—"}</td>
                        <td data-label="الإجمالي" className="px-5 py-3 text-muted-foreground line-through tabular-nums">{d.total.toLocaleString()}</td>
                        <td data-label="المدفوع المُلغى" className="px-5 py-3 tabular-nums text-amber-700">{d.deleted_payments > 0 ? d.deleted_payments.toLocaleString() : (d.paid_amount > 0 ? d.paid_amount.toLocaleString() : "—")}</td>
                        <td data-label="البنود" className="px-5 py-3 text-xs text-muted-foreground">
                          {d.items_count} بند
                          {d.restored_stock && <span className="ms-2 inline-block px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 text-[10px]">أُرجعت للمخزون</span>}
                        </td>
                        <td data-label="حُذفت في" className="px-5 py-3 text-xs text-muted-foreground tabular-nums">{new Date(d.deleted_at).toLocaleString()}</td>
                        <td data-label="بواسطة" className="px-5 py-3 text-xs text-muted-foreground">{d.user_email || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}



          {filteredTransactions.length > 0 && (
            <div data-section="transactions" data-section-label="المعاملات" className={`legacy-card card-block ${tab === "transactions" ? "" : "hidden"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-border">
                <h3 className="font-semibold text-foreground">
                  المعاملات ({filteredTransactions.length})
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={txTypeFilter}
                    onChange={(e) => setTxTypeFilter(e.target.value as any)}
                    className="bg-muted rounded px-2 py-1 text-xs text-foreground border border-border outline-none"
                    title="نوع العملية"
                  >
                    <option value="all">كل الأنواع</option>
                    <option value="payment">دفعة</option>
                    <option value="credit">رصيد دائن</option>
                    <option value="credit_consume">استهلاك رصيد</option>
                    <option value="other">أخرى</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setCashMode((v) => !v)}
                    className={`text-xs px-3 py-1 rounded-full border transition ${cashMode ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-foreground border-border"}`}
                    data-testid="cash-mode-toggle"
                  >
                    {cashMode ? "الوضع الكامل" : "وضع الكاش"}
                  </button>
                </div>
              </div>

              {/* شريط فلترة مصدر الرصيد الدائن */}
              {creditGroups.length > 0 && (
                <div className="px-5 py-3 border-b border-border bg-muted/20">
                  <CreditConsumptionOrderControl compact />
                </div>
              )}
              {creditGroups.length > 0 && (
                <div className="px-5 py-3 border-b border-border bg-muted/30 space-y-2">
                  <div className="text-[11px] text-muted-foreground">
                    ملخّص الرصيد الدائن حسب المصدر:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {CREDIT_SOURCE_OPTIONS.map((opt) => {
                      const g = creditGroups.find((x) => x.source === opt.value);
                      const active = creditSourceFilter.has(opt.value);
                      const hasData = !!g;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={!hasData}
                          onClick={() => {
                            const next = new Set(creditSourceFilter);
                            if (active) next.delete(opt.value);
                            else next.add(opt.value);
                            setCreditSourceFilter(next);
                          }}
                          className={`text-[11px] px-2 py-1 rounded-full border transition tabular-nums ${
                            !hasData
                              ? "opacity-40 cursor-not-allowed bg-muted border-border text-muted-foreground"
                              : active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border hover:bg-muted"
                          }`}
                        >
                          {opt.label}
                          {g ? ` · ${g.total.toLocaleString()} (${g.count})` : ""}
                        </button>
                      );
                    })}
                    {creditSourceFilter.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setCreditSourceFilter(new Set())}
                        className="text-[11px] text-muted-foreground underline hover:text-foreground"
                      >
                        مسح الفلاتر
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm mobile-stack-table">
                  <thead>
                    <tr className="bg-muted">
                      {([
                        ["date","التاريخ"],
                        ["type","النوع"],
                      ] as const).map(([k,label]) => {
                        const active = txSortKey === k;
                        return (
                          <th key={k} className="text-right px-5 py-3 font-semibold text-muted-foreground">
                            <button type="button" onClick={() => toggleTxSort(k as any)} className="inline-flex items-center gap-1 hover:text-foreground">
                              {label}
                              <span className="text-[10px] opacity-70">{active ? (txSortDir === "asc" ? "▲" : "▼") : "↕"}</span>
                            </button>
                          </th>
                        );
                      })}
                      <th className="text-right px-5 py-3 font-semibold text-muted-foreground">المصدر</th>
                      <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الارتباط</th>
                      <th className="text-right px-5 py-3 font-semibold text-muted-foreground">
                        <button type="button" onClick={() => toggleTxSort("amount")} className="inline-flex items-center gap-1 hover:text-foreground">
                          المبلغ
                          <span className="text-[10px] opacity-70">{txSortKey === "amount" ? (txSortDir === "asc" ? "▲" : "▼") : "↕"}</span>
                        </button>
                      </th>
                      <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الوصف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(cashMode ? cashRows : filteredTransactions).map((t: any) => {
                      const isCredit = t.category === "customer_credit";
                      const isPayment = t.category === "customer_payment";
                      const info = isCredit ? classifyCreditRow(t) : null;
                      const linked = t.reference_id
                        ? `فاتورة #${String(t.reference_id).slice(0, 8)}`
                        : "مستقل";
                      const amt = Number(t.amount || 0);
                      return (
                        <tr key={t.id} className="border-b border-border hover:bg-muted/50">
                          <td data-label="التاريخ" className="px-5 py-3 text-foreground tabular-nums">{t.date}</td>
                          <td data-label="النوع" className="px-5 py-3 text-foreground">
                            {isPayment
                              ? "دفعة"
                              : isCredit
                                ? amt < 0
                                  ? "استهلاك رصيد"
                                  : "رصيد دائن"
                                : t.type === "income"
                                  ? "إيراد"
                                  : "مصروف"}
                          </td>
                          <td data-label="المصدر" className="px-5 py-3">
                            {info ? (
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${info.colorClass}`}>
                                {info.label}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td data-label="الارتباط" className="px-5 py-3 text-xs">
                            <span className={t.reference_id ? "text-foreground" : "text-muted-foreground"}>
                              {linked}
                            </span>
                          </td>
                          <td data-label="المبلغ" className={`px-5 py-3 font-semibold tabular-nums ${amt < 0 ? "text-amber-700" : "text-foreground"}`}>
                            {amt.toLocaleString()}
                          </td>
                          <td data-label="الوصف" className="px-5 py-3 text-muted-foreground text-xs">{t.description || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {cashMode && (
                <div className="px-5 py-3 border-t border-border bg-muted/30 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground">إجمالي المدفوع</div>
                    <div className="font-bold tabular-nums text-success">
                      {cashRows
                        .filter((t: any) => t.category === "customer_payment")
                        .reduce((s: number, t: any) => s + Number(t.amount || 0), 0)
                        .toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">إجمالي الفائض (مستقل عن فاتورة)</div>
                    <div className="font-bold tabular-nums text-emerald-700">
                      {cashRows
                        .filter((t: any) => t.category === "customer_credit" && !t.reference_id && Number(t.amount) > 0)
                        .reduce((s: number, t: any) => s + Number(t.amount || 0), 0)
                        .toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">إجمالي المستهلَك من الرصيد</div>
                    <div className="font-bold tabular-nums text-amber-700">
                      {Math.abs(
                        cashRows
                          .filter((t: any) => t.category === "customer_credit" && Number(t.amount) < 0)
                          .reduce((s: number, t: any) => s + Number(t.amount || 0), 0),
                      ).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
        );
      })()}
      </div>
    </div>
  );
}
