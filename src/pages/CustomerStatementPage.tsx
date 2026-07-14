import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCustomers, useCompanySettings } from "@/hooks/useData";
import { Search, X, Printer } from "lucide-react";
import type { FinancialReportData } from "@/utils/financialReportPrintTemplate";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";
import { netBalanceOf } from "@/utils/balanceDisplay";

export default function CustomerStatementPage() {
  const { data: customers } = useCustomers();
  const { data: companyArr } = useCompanySettings();
  const company = (companyArr as any)?.[0] || null;
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [showSugg, setShowSugg] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"all" | "paid" | "unpaid" | "partial">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = search.trim();
    if (!q) return (customers || []).slice(0, 10);
    return (customers || []).filter((c: any) =>
      startsWithAny([c.name, c.phone], q)
    ).slice(0, 10);
  }, [search, customers]);

  useEffect(() => { setActiveIdx(0); }, [search]);

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

  const filteredInvoices = useMemo(() => {
    return (invoices || []).filter((inv: any) => {
      if (fromDate && inv.date < fromDate) return false;
      if (toDate && inv.date > toDate) return false;
      const total = Number(inv.total || 0);
      if (minAmount && total < Number(minAmount)) return false;
      if (maxAmount && total > Number(maxAmount)) return false;
      const paid = Number(inv.paid_amount || 0);
      if (paymentStatus === "paid" && paid < total) return false;
      if (paymentStatus === "unpaid" && paid > 0) return false;
      if (paymentStatus === "partial" && (paid === 0 || paid >= total)) return false;
      return true;
    });
  }, [invoices, fromDate, toDate, minAmount, maxAmount, paymentStatus]);

  const filteredTransactions = useMemo(() => {
    return (transactions || []).filter((t: any) => {
      if (fromDate && t.date < fromDate) return false;
      if (toDate && t.date > toDate) return false;
      const amt = Number(t.amount || 0);
      if (minAmount && amt < Number(minAmount)) return false;
      if (maxAmount && amt > Number(maxAmount)) return false;
      return true;
    });
  }, [transactions, fromDate, toDate, minAmount, maxAmount]);

  const selectedCustomer = (customers || []).find((c: any) => c.id === selectedCustomerId);
  const totalInvoices = filteredInvoices.reduce((s: number, inv: any) => s + Number(inv.total || 0), 0);
  const totalPaid = filteredInvoices.reduce((s: number, inv: any) => s + Number(inv.paid_amount || 0), 0);

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
      ],
    };
    sessionStorage.setItem("lov_financial_report_preview", JSON.stringify(payload));
    navigate("/reports/financial-preview");
  };

  return (
    <div className="space-y-6" dir="rtl">
      {selectedCustomer && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleOpenPrint}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm"
          >
            <Printer className="h-4 w-4" />
            معاينة وطباعة كشف الحساب
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

          <div data-section="invoices" data-section-label="الفواتير" className="legacy-card card-block">
            <h3 className="px-5 py-3 font-semibold text-foreground border-b border-border">الفواتير ({filteredInvoices.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm mobile-stack-table">
                <thead><tr className="bg-muted">
                  <th className="text-right px-5 py-3 font-semibold text-muted-foreground">رقم الفاتورة</th>
                  <th className="text-right px-5 py-3 font-semibold text-muted-foreground">التاريخ</th>
                  <th className="text-right px-5 py-3 font-semibold text-muted-foreground">المبلغ</th>
                  <th className="text-right px-5 py-3 font-semibold text-muted-foreground">المدفوع</th>
                  <th className="text-right px-5 py-3 font-semibold text-muted-foreground">المتبقي</th>
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

          {filteredTransactions.length > 0 && (
            <div data-section="transactions" data-section-label="المعاملات" className="legacy-card card-block">
              <h3 className="px-5 py-3 font-semibold text-foreground border-b border-border">المعاملات ({filteredTransactions.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm mobile-stack-table">
                  <thead><tr className="bg-muted">
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">التاريخ</th>
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">النوع</th>
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">المبلغ</th>
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الوصف</th>
                  </tr></thead>
                  <tbody>
                    {filteredTransactions.map((t: any) => (
                      <tr key={t.id} className="border-b border-border hover:bg-muted/50">
                        <td data-label="التاريخ" className="px-5 py-3 text-foreground">{t.date}</td>
                        <td data-label="النوع" className="px-5 py-3 text-foreground">{t.type === "income" ? "إيراد" : "مصروف"}</td>
                        <td data-label="المبلغ" className="px-5 py-3 text-foreground">{Number(t.amount).toLocaleString()}</td>
                        <td data-label="الوصف" className="px-5 py-3 text-muted-foreground">{t.description || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
        );
      })()}
      </div>
    </div>
  );
}
