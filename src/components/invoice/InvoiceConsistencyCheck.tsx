import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertTriangle, Loader2, RefreshCw, Clock, ArrowLeftRight } from "lucide-react";

interface Props {
  invoiceId: string;
  customerId?: string | null;
}

type Tx = {
  id: string; amount: number; date: string; category: string;
  reference_id: string | null; allocation: any; description: string | null;
};

/**
 * تحقّق من التناسق + تسلسل زمني للفاتورة:
 *  - يقارن Σ(payments) + Σ(credit_consumed_toward_this_invoice) بـ paid_amount
 *  - يُظهر الحالة المتوقعة (paid/partial/pending) ويقارنها بالمخزّنة
 *  - يبني Timeline: total → دفعات وفائض → paid/partial/paid → استهلاك الفائض
 */
export default function InvoiceConsistencyCheck({ invoiceId, customerId }: Props) {
  const [inv, setInv] = useState<any>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    (async () => {
      try {
        const [invRes, txRes] = await Promise.all([
          (supabase as any).from("invoices")
            .select("id, invoice_number, total, paid_amount, status, date")
            .eq("id", invoiceId).maybeSingle(),
          (supabase as any).from("transactions")
            .select("id, amount, date, category, reference_id, allocation, description")
            .eq("reference_id", invoiceId)
            .order("date", { ascending: true }),
        ]);
        if (cancelled) return;
        if (invRes.error) throw invRes.error;
        if (txRes.error) throw txRes.error;
        setInv(invRes.data);
        setTxs((txRes.data || []) as Tx[]);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "خطأ غير معروف");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [invoiceId, refreshKey]);

  const analysis = useMemo(() => {
    if (!inv) return null;
    const total = Number(inv.total || 0);
    const storedPaid = Number(inv.paid_amount || 0);
    const payments = txs.filter((t) => t.category === "customer_payment");
    const surplus = txs.filter((t) => t.category === "customer_credit" && Number(t.amount) > 0);
    const paymentsSum = payments.reduce((s, t) => s + Number(t.amount || 0), 0);
    const surplusSum = surplus.reduce((s, t) => s + Number(t.amount || 0), 0);
    // Total received on this invoice = payments applied (paymentsSum already includes what went to invoice)
    // paid_amount should equal Σ payments − Σ surplus (surplus is money received beyond invoice total)
    const expectedPaid = Math.min(total, paymentsSum - surplusSum);
    const paidDiff = Math.round((storedPaid - expectedPaid) * 100) / 100;

    let expectedStatus: string;
    if (total > 0 && storedPaid >= total - 0.01) expectedStatus = "paid";
    else if (storedPaid > 0.01) expectedStatus = "partial";
    else expectedStatus = "pending";
    const statusMatches = (inv.status || "").toLowerCase() === expectedStatus
      || (inv.status || "").toLowerCase() === "overdue" && expectedStatus === "pending";

    return { total, storedPaid, paymentsSum, surplusSum, expectedPaid, paidDiff, expectedStatus, statusMatches };
  }, [inv, txs]);

  // Build timeline
  const timeline = useMemo(() => {
    if (!inv) return [];
    const items: { date: string; label: string; detail: string; running: number; kind: string }[] = [];
    items.push({
      date: inv.date, label: "إنشاء الفاتورة", kind: "create",
      detail: `الإجمالي ${Number(inv.total || 0).toLocaleString()} — الحالة الابتدائية: pending`,
      running: 0,
    });
    let running = 0;
    const sorted = [...txs].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    for (const t of sorted) {
      const amt = Number(t.amount || 0);
      if (t.category === "customer_payment") {
        running += amt;
        items.push({
          date: t.date, label: amt >= 0 ? "دفعة" : "استرداد دفعة", kind: "payment",
          detail: `${amt.toLocaleString()} — المدفوع التراكمي: ${running.toLocaleString()} / ${Number(inv.total || 0).toLocaleString()}`,
          running,
        });
      } else if (t.category === "customer_credit") {
        if (amt > 0) {
          items.push({
            date: t.date, label: "توليد فائض (رصيد دائن)", kind: "surplus",
            detail: `فائض ${amt.toLocaleString()} — يُضاف إلى رصيد العميل الدائن`,
            running,
          });
        } else {
          items.push({
            date: t.date, label: "استهلاك فائض", kind: "consume",
            detail: `${Math.abs(amt).toLocaleString()} استُهلك من الفائض على هذه الفاتورة`,
            running,
          });
        }
      }
    }
    const total = Number(inv.total || 0);
    const finalStatus = total > 0 && Number(inv.paid_amount || 0) >= total - 0.01 ? "paid"
      : Number(inv.paid_amount || 0) > 0.01 ? "partial" : "pending";
    items.push({
      date: inv.date, label: `الحالة النهائية: ${finalStatus}`, kind: "final",
      detail: `المدفوع المخزَّن: ${Number(inv.paid_amount || 0).toLocaleString()} / ${total.toLocaleString()}`,
      running: Number(inv.paid_amount || 0),
    });
    return items;
  }, [inv, txs]);

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground py-4 text-sm" dir="rtl"><Loader2 className="h-4 w-4 animate-spin" /> جاري الفحص…</div>;
  }
  if (err) {
    return <div className="text-destructive text-sm p-3 rounded border border-destructive/40 bg-destructive/5" dir="rtl">{err}</div>;
  }
  if (!inv || !analysis) return null;

  const ok = Math.abs(analysis.paidDiff) < 0.01 && analysis.statusMatches;

  return (
    <div dir="rtl" className="space-y-4" data-testid="invoice-consistency-check">
      <div className={`rounded-lg border-2 p-4 ${ok ? "border-emerald-300 bg-emerald-50" : "border-destructive/40 bg-destructive/5"}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {ok ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <AlertTriangle className="h-5 w-5 text-destructive" />}
            <h3 className={`font-bold ${ok ? "text-emerald-900" : "text-destructive"}`}>
              {ok ? "الفاتورة متناسقة ✓" : "يوجد فارق في التناسق"}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-border bg-background hover:bg-muted"
          >
            <RefreshCw className="h-3 w-3" /> إعادة الفحص
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
          <StatCell label="الإجمالي" value={analysis.total.toLocaleString()} />
          <StatCell label="Σ الدفعات" value={analysis.paymentsSum.toLocaleString()} />
          <StatCell label="Σ الفائض" value={analysis.surplusSum.toLocaleString()} />
          <StatCell label="المدفوع المتوقع" value={analysis.expectedPaid.toLocaleString()} highlight={Math.abs(analysis.paidDiff) >= 0.01} />
        </div>
        <div className="mt-3 text-xs space-y-1">
          <div>المدفوع المخزَّن: <b className="tabular-nums">{analysis.storedPaid.toLocaleString()}</b>
            {Math.abs(analysis.paidDiff) >= 0.01 && (
              <span className="text-destructive"> — فارق: {analysis.paidDiff.toLocaleString()}</span>
            )}
          </div>
          <div>
            الحالة المخزَّنة: <b>{inv.status}</b> — المتوقعة: <b>{analysis.expectedStatus}</b>
            {!analysis.statusMatches && <span className="text-destructive"> — غير متطابقة</span>}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <header className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm">التسلسل الزمني: كيف تحوّلت الفاتورة</h3>
        </header>
        <ol className="p-4 space-y-3">
          {timeline.map((it, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                  it.kind === "create" ? "bg-primary/10 text-primary border-primary"
                  : it.kind === "payment" ? "bg-emerald-100 text-emerald-800 border-emerald-400"
                  : it.kind === "surplus" ? "bg-blue-100 text-blue-800 border-blue-400"
                  : it.kind === "consume" ? "bg-amber-100 text-amber-800 border-amber-400"
                  : "bg-muted text-foreground border-border"
                }`}>
                  {i + 1}
                </div>
                {i < timeline.length - 1 && <div className="flex-1 w-0.5 bg-border my-1" />}
              </div>
              <div className="flex-1 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">{it.date}</span>
                  <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-semibold text-sm">{it.label}</span>
                </div>
                <div className="text-xs text-foreground/80 mt-0.5">{it.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function StatCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded p-2 border ${highlight ? "border-destructive/40 bg-destructive/5" : "border-border bg-background"}`}>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-bold tabular-nums text-sm">{value}</div>
    </div>
  );
}
