import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, FileText, X, AlertTriangle } from "lucide-react";
import { useCustomers } from "@/hooks/useData";
import { containsAny } from "@/utils/searchMatch";
import { netBalanceOf, formatMoney } from "@/utils/balanceDisplay";

/**
 * صفحة "كشوفات حسابات العملاء" — نقطة وصول موحّدة.
 * تعرض قائمة العملاء مع صافي الرصيد (netBalanceOf — نفس المصدر في كل النظام)،
 * بحث فوري بالاسم/الهاتف، Enter يفتح كشف حساب أول نتيجة على المسار الموحّد
 * /customers/:id/statement.
 *
 * حالة البحث محفوظة في URL (?q=...) حتى ترجع للصفحة فتظهر نفس النتائج.
 */
export default function CustomerStatementsPage() {
  const navigate = useNavigate();
  const { data: customers, isLoading, isError, error, refetch } = useCustomers();
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") || "");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // مزامنة q ↔ URL (بدون إغراق التاريخ)
  useEffect(() => {
    const cur = searchParams.get("q") || "";
    if (cur === q) return;
    const next = new URLSearchParams(searchParams);
    if (q) next.set("q", q);
    else next.delete("q");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);


  const rows = useMemo(() => {
    const list = (customers || []) as any[];
    const query = q.trim();
    const filtered = query
      ? list.filter((c) => containsAny([c.name, c.phone, c.company], query))
      : list;
    return filtered
      .map((c) => ({ ...c, _net: netBalanceOf(c) }))
      .sort((a, b) => Math.abs(b._net) - Math.abs(a._net));
  }, [customers, q]);

  useEffect(() => setActiveIdx(0), [q]);

  const openStatement = (id: string) => navigate(`/customers/${id}/statement`);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = rows[activeIdx] || rows[0];
      if (target) openStatement(target.id);
    } else if (e.key === "Escape") {
      setQ("");
    }
  };

  const totals = useMemo(() => {
    let debt = 0, credit = 0;
    for (const r of rows) {
      if (r._net > 0) debt += r._net;
      else if (r._net < 0) credit += -r._net;
    }
    return { debt, credit, count: rows.length };
  }, [rows]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Hero: عنوان + إجماليات موحدة (netBalanceOf) بشكل بارز مع أنيميشن دخول */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-l from-primary/5 via-card to-card p-5 md:p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div aria-hidden className="pointer-events-none absolute -top-16 -start-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 -end-16 h-48 w-48 rounded-full bg-destructive/10 blur-3xl" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
              <FileText size={22} className="text-primary" />
              كشوفات حسابات العملاء
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              اختر عميلًا لعرض كشف حسابه التفصيلي — الأرقام موحّدة عبر netBalanceOf في كل النظام.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 min-w-[280px]">
            <TotalPill label="العملاء" value={totals.count} tone="primary" plain />
            <TotalPill label="المديونية" value={totals.debt} tone="destructive" />
            <TotalPill label="الدائن" value={totals.credit} tone="success" />
          </div>
        </div>
      </div>

      <div className="legacy-card card-block p-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKey}
            placeholder="ابحث بالاسم أو الشركة أو الهاتف — اضغط Enter لفتح الكشف"
            className="w-full h-11 pr-10 pl-10 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="مسح"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="legacy-card card-block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground w-12">#</th>
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground">الاسم</th>
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground">الهاتف</th>
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground">المديونية</th>
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground">رصيد دائن</th>
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground">الصافي</th>
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-muted-foreground">
                    <span className="inline-block h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin align-middle me-2" />
                    جاري تحميل بيانات العملاء...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="text-center py-10">
                    <div className="inline-flex items-center gap-2 text-destructive">
                      <AlertTriangle size={18} />
                      <span>تعذّر جلب بيانات العملاء (netBalanceOf).</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{(error as any)?.message || "خطأ غير معروف"}</div>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="mt-3 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90"
                    >
                      إعادة المحاولة
                    </button>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-muted-foreground">
                    {q ? `لا يوجد عملاء مطابقون لـ "${q}"` : "لا يوجد عملاء بعد"}
                  </td>
                </tr>
              ) : (
                rows.map((c, i) => {
                  const net = c._net as number;
                  const debt = Number(c.balance || 0);
                  const credit = Number(c.credit_balance || 0);
                  const isActive = i === activeIdx;
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-border cursor-pointer transition-colors ${
                        isActive ? "bg-primary/10" : "hover:bg-muted/50"
                      }`}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => openStatement(c.id)}
                    >
                      <td className="px-3 py-3 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-3 font-medium text-foreground">{c.name}</td>
                      <td className="px-3 py-3 text-muted-foreground tabular-nums">
                        {c.phone || "—"}
                      </td>
                      <td className="px-3 py-3 text-destructive tabular-nums">
                        {debt > 0 ? formatMoney(debt) : "—"}
                      </td>
                      <td className="px-3 py-3 text-emerald-600 tabular-nums">
                        {credit > 0 ? formatMoney(credit) : "—"}
                      </td>
                      <td
                        className={`px-3 py-3 font-bold tabular-nums ${
                          net > 0
                            ? "text-destructive"
                            : net < 0
                              ? "text-emerald-600"
                              : "text-foreground"
                        }`}
                      >
                        {Math.abs(net) < 0.01 ? "خالص" : formatMoney(Math.abs(net))}
                        {Math.abs(net) >= 0.01 && (
                          <span className="text-[10px] font-normal mr-1">
                            {net > 0 ? "عليه" : "له"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openStatement(c.id);
                          }}
                          className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90 inline-flex items-center gap-1"
                        >
                          <FileText size={12} />
                          كشف الحساب
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
