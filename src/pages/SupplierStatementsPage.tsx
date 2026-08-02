import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, FileText, X, AlertTriangle } from "lucide-react";
import { useSuppliers, usePurchaseOrders } from "@/hooks/useData";
import { containsAny } from "@/utils/searchMatch";
import { formatMoney } from "@/utils/balanceDisplay";
import { supplierBalanceOf } from "@/utils/purchaseSave";

/**
 * «كشوفات حسابات الموردين» — نقطة وصول موحّدة، نظيرة `CustomerStatementsPage`.
 *
 * كانت شاشة كشف حساب المورد موجودة لمورّدٍ واحد فقط (`/reports/supplier-statement`)
 * بلا قائمة تُريك من عليك ومن له، فيُفتح الكشف مورّداً مورّداً بحثاً عن رقم.
 *
 * ## اصطلاح الإشارة — بلغة المورّد لا بلغة الدفاتر
 * `suppliers.balance` موجب يعني **ما علينا له**. وهو ما يعنيه المستخدم حين
 * يسأل «كم للمورد عندي؟». فيُعرض:
 *
 *   له   → أحمر  (دَينٌ علينا)
 *   لنا  → أخضر  (دفعنا زيادةً)
 *   خالص → محايد
 *
 * وهي معكوسة عمداً عن كشف العميل: هناك الموجب علينا منه، وهنا الموجب علينا له.
 * الطرفان مختلفان فلا يصحّ توحيد اللون، ولهذا تُكتب الكلمة بجانب الرقم دائماً
 * فلا يُقرأ اللون وحده.
 */
export default function SupplierStatementsPage() {
  const navigate = useNavigate();
  const { data: suppliers, isLoading, isError, error, refetch } = useSuppliers();
  // الرصيد يُحسب من الأوامر لا يُقرأ من `suppliers.balance`: العمود المخزَّن
  // يجمع كل أمر غير ملغى بما فيه المستلَم، فلا يعرف قاعدة الاستبعاد.
  const { data: purchaseOrders } = usePurchaseOrders();
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") || "");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
    const list = (suppliers || []) as any[];
    const query = q.trim();
    const filtered = query
      ? list.filter((s) => containsAny([s.name, s.phone, s.company, s.email], query))
      : list;
    const ordersBySupplier = new Map<string, any[]>();
    for (const o of (purchaseOrders || []) as any[]) {
      const k = String(o.supplier_id || "");
      if (!k) continue;
      if (!ordersBySupplier.has(k)) ordersBySupplier.set(k, []);
      ordersBySupplier.get(k)!.push(o);
    }
    return filtered
      .map((s) => ({ ...s, _bal: supplierBalanceOf(ordersBySupplier.get(String(s.id)) || []) }))
      .sort((a, b) => Math.abs(b._bal) - Math.abs(a._bal));
  }, [suppliers, purchaseOrders, q]);

  const totals = useMemo(() => {
    let owed = 0;   // ما علينا لهم
    let ours = 0;   // ما لنا عندهم
    for (const r of rows) {
      if (r._bal > 0.01) owed += r._bal;
      else if (r._bal < -0.01) ours += -r._bal;
    }
    return { count: rows.length, owed, ours };
  }, [rows]);

  const openStatement = (id: string) => navigate(`/reports/supplier-statement?supplier=${id}`);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!rows.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); openStatement(rows[activeIdx]?.id || rows[0].id); }
  };

  return (
    <article className="content" dir="rtl">
      <div className="legacy-card card-block p-4 mb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
              <FileText size={22} className="text-primary" />
              كشوفات حسابات الموردين
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              اختر مورّداً لعرض كشف حسابه التفصيلي — الأرصدة من نفس عمود
              الأوامر <b>غير المستلَمة</b> — فالمستلَم دخلت بضاعته ولا يُسجَّل هنا.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 min-w-[280px]">
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-center">
              <div className="text-[11px] text-muted-foreground">الموردون</div>
              <div className="text-lg font-bold tabular-nums">{totals.count}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-center">
              <div className="text-[11px] text-muted-foreground">علينا لهم</div>
              <div className="text-lg font-bold tabular-nums text-destructive">{formatMoney(totals.owed)}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-center">
              <div className="text-[11px] text-muted-foreground">لنا عندهم</div>
              <div className="text-lg font-bold tabular-nums text-emerald-600">{formatMoney(totals.ours)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="legacy-card card-block p-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); setActiveIdx(0); }}
            onKeyDown={onKeyDown}
            placeholder="ابحث بالاسم أو الهاتف أو الشركة..."
            className="w-full bg-muted rounded-lg pr-9 pl-9 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary"
          />
          {q && (
            <button
              type="button"
              onClick={() => { setQ(""); inputRef.current?.focus(); }}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="legacy-card card-block mt-3 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm mobile-stack-table">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground w-12">#</th>
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground">الاسم</th>
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground">الهاتف</th>
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">جاري تحميل بيانات الموردين...</td></tr>
              ) : isError ? (
                <tr>
                  <td colSpan={4} className="text-center py-10">
                    <div className="inline-flex items-center gap-2 text-destructive">
                      <AlertTriangle size={18} />
                      <span>تعذّر جلب بيانات الموردين.</span>
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
                  <td colSpan={4} className="text-center py-10 text-muted-foreground">
                    {q ? `لا يوجد مورّد مطابق لـ "${q}"` : "لا يوجد موردون بعد"}
                  </td>
                </tr>
              ) : (
                rows.map((s, i) => {
                  const bal = s._bal as number;
                  const settled = Math.abs(bal) < 0.01;
                  return (
                    <tr
                      key={s.id}
                      className={`border-b border-border cursor-pointer transition-colors ${
                        i === activeIdx ? "bg-primary/10" : "hover:bg-muted/50"
                      }`}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => openStatement(s.id)}
                    >
                      <td data-label="#" className="px-3 py-3 text-muted-foreground">{i + 1}</td>
                      <td data-label="الاسم" className="px-3 py-3 font-medium text-foreground">{s.name}</td>
                      <td data-label="الهاتف" className="px-3 py-3 text-muted-foreground tabular-nums">{s.phone || "—"}</td>
                      <td
                        data-label="الرصيد"
                        className={`px-3 py-3 font-bold tabular-nums ${
                          settled ? "text-foreground" : bal > 0 ? "text-destructive" : "text-emerald-600"
                        }`}
                      >
                        {settled ? "خالص" : formatMoney(Math.abs(bal))}
                        {!settled && (
                          <span className="text-[10px] font-normal mr-1">{bal > 0 ? "له" : "لنا"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  );
}
