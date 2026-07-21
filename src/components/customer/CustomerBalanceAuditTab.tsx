import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Wallet, DollarSign, Receipt, AlertCircle, ExternalLink, ShoppingCart } from "lucide-react";

interface Props {
  customerId: string;
  storedBalance: number;
  storedCredit: number;
}

type OpenInv = { id: string; invoice_number: string; date: string; total: number; paid_amount: number; remaining: number; status: string };
type CreditRow = { id: string; date: string; amount: number; description: string | null; reference_id: string | null; kind: "surplus" | "consumed" | "other" };

/**
 * تدقيق رصيد العميل — يفكّك:
 *  - customers.balance = Σ remaining على الفواتير المفتوحة (غير الملغاة/غير POS)
 *  - customers.credit_balance = Σ customer_credit (موجب فائض، سالب استهلاك)
 *  ويعرض جانبياً إحصاءات POS المستبعدة من الكشف.
 */
export default function CustomerBalanceAuditTab({ customerId, storedBalance, storedCredit }: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openInvs, setOpenInvs] = useState<OpenInv[]>([]);
  const [creditRows, setCreditRows] = useState<CreditRow[]>([]);
  const [posStats, setPosStats] = useState<{ count: number; total: number; paid: number }>({ count: 0, total: 0, paid: 0 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    (async () => {
      try {
        const [invRes, allInvRes, credRes] = await Promise.all([
          (supabase as any)
            .from("invoices")
            .select("id, invoice_number, date, total, paid_amount, status, source")
            .eq("customer_id", customerId)
            .neq("status", "cancelled")
            .neq("source", "pos"),
          (supabase as any)
            .from("invoices")
            .select("id, total, paid_amount, source, status")
            .eq("customer_id", customerId)
            .eq("source", "pos"),
          (supabase as any)
            .from("transactions")
            .select("id, date, amount, description, reference_id, allocation")
            .eq("customer_id", customerId)
            .eq("category", "customer_credit")
            .order("date", { ascending: false }),
        ]);
        if (cancelled) return;
        if (invRes.error) throw invRes.error;
        if (allInvRes.error) throw allInvRes.error;
        if (credRes.error) throw credRes.error;

        const opens: OpenInv[] = (invRes.data || [])
          .map((r: any) => ({
            id: r.id, invoice_number: r.invoice_number, date: r.date,
            total: Number(r.total || 0), paid_amount: Number(r.paid_amount || 0),
            remaining: Math.max(Number(r.total || 0) - Number(r.paid_amount || 0), 0),
            status: r.status,
          }))
          .filter((r: OpenInv) => r.remaining > 0.01)
          .sort((a: OpenInv, b: OpenInv) => String(b.date).localeCompare(String(a.date)));
        setOpenInvs(opens);

        const posList = allInvRes.data || [];
        const posSum = posList.reduce((acc: any, r: any) => {
          acc.count++; acc.total += Number(r.total || 0); acc.paid += Number(r.paid_amount || 0); return acc;
        }, { count: 0, total: 0, paid: 0 });
        setPosStats(posSum);

        const rows: CreditRow[] = (credRes.data || []).map((t: any) => {
          const amt = Number(t.amount || 0);
          const kind: CreditRow["kind"] = t?.allocation?.kind === "surplus" || amt > 0 ? "surplus"
            : amt < 0 ? "consumed" : "other";
          return {
            id: t.id, date: t.date, amount: amt,
            description: t.description || null,
            reference_id: t.reference_id || null,
            kind,
          };
        });
        setCreditRows(rows);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "خطأ غير معروف");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  const computedBalance = openInvs.reduce((s, r) => s + r.remaining, 0);
  const computedCredit = creditRows.reduce((s, r) => s + r.amount, 0);
  const balDiff = Math.round((computedBalance - storedBalance) * 100) / 100;
  const credDiff = Math.round((computedCredit - storedCredit) * 100) / 100;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground" dir="rtl">
        <Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري تحميل تدقيق الرصيد…
      </div>
    );
  }
  if (err) {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/5 p-4 text-destructive text-sm" dir="rtl">
        فشل تحميل التدقيق: {err}
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-4" data-testid="customer-balance-audit-tab">
      {/* POS stats card */}
      <section className="rounded-lg border border-amber-300 bg-amber-50/60 p-4">
        <div className="flex items-center gap-2 mb-2">
          <ShoppingCart className="h-4 w-4 text-amber-800" />
          <h3 className="font-bold text-amber-900 text-sm">إحصاءات فواتير الكاش (POS) — مستبعدة من كشف الحساب</h3>
        </div>
        <p className="text-xs text-amber-900/80 mb-3">
          يستبعد كشف حساب العميل أي فاتورة بـ <code className="bg-amber-100 px-1 rounded">source='pos'</code> وكذلك أي حركة مرتبطة بها،
          لأن دفعات الكاش تخصّ الدرج (POS) وليس بطاقة العميل. رصيد العميل يُحسب فقط من الفواتير غير الملغاة وغير الكاش.
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <PosCell label="عدد فواتير الكاش" value={posStats.count.toLocaleString()} />
          <PosCell label="إجمالي الكاش" value={posStats.total.toLocaleString()} />
          <PosCell label="المدفوع نقداً" value={posStats.paid.toLocaleString()} />
        </div>
      </section>

      {/* Balance breakdown */}
      <section className="rounded-lg border border-border bg-card">
        <header className="px-4 py-3 border-b border-border flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-destructive" />
          <h3 className="font-bold text-sm">تفكيك «عليه» (balance) — {storedBalance.toLocaleString()}</h3>
          <span className={`ms-auto text-[11px] px-2 py-0.5 rounded-full ${Math.abs(balDiff) < 0.01 ? "bg-emerald-100 text-emerald-800" : "bg-destructive/10 text-destructive"}`}>
            {Math.abs(balDiff) < 0.01 ? "متوافق ✓" : `فارق: ${balDiff.toLocaleString()}`}
          </span>
        </header>
        {openInvs.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">لا توجد فواتير مفتوحة عليه.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs">
                <tr>
                  <th className="text-right px-3 py-2 font-semibold">رقم</th>
                  <th className="text-right px-3 py-2 font-semibold">التاريخ</th>
                  <th className="text-left px-3 py-2 font-semibold">الإجمالي</th>
                  <th className="text-left px-3 py-2 font-semibold">المدفوع</th>
                  <th className="text-left px-3 py-2 font-semibold">المتبقي</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {openInvs.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-2 font-semibold">{r.invoice_number}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.date}</td>
                    <td className="px-3 py-2 text-left tabular-nums">{r.total.toLocaleString()}</td>
                    <td className="px-3 py-2 text-left tabular-nums text-success">{r.paid_amount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-left tabular-nums font-bold text-destructive">{r.remaining.toLocaleString()}</td>
                    <td className="px-3 py-2 text-left">
                      <Link to={`/invoices/view/${r.id}`} className="text-primary text-xs inline-flex items-center gap-1 hover:underline">
                        فتح <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/60 font-bold">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right text-xs">مجموع المفتوح (يجب أن يساوي balance):</td>
                  <td className="px-3 py-2 text-left tabular-nums">{computedBalance.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Credit breakdown */}
      <section className="rounded-lg border border-border bg-card">
        <header className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Wallet className="h-4 w-4 text-blue-700" />
          <h3 className="font-bold text-sm">تفكيك «له» (credit_balance) — {storedCredit.toLocaleString()}</h3>
          <span className={`ms-auto text-[11px] px-2 py-0.5 rounded-full ${Math.abs(credDiff) < 0.01 ? "bg-emerald-100 text-emerald-800" : "bg-destructive/10 text-destructive"}`}>
            {Math.abs(credDiff) < 0.01 ? "متوافق ✓" : `فارق: ${credDiff.toLocaleString()}`}
          </span>
        </header>
        {creditRows.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">لا يوجد رصيد دائن.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs">
                <tr>
                  <th className="text-right px-3 py-2 font-semibold">التاريخ</th>
                  <th className="text-right px-3 py-2 font-semibold">النوع</th>
                  <th className="text-right px-3 py-2 font-semibold">الوصف</th>
                  <th className="text-left px-3 py-2 font-semibold">المبلغ</th>
                  <th className="text-left px-3 py-2 font-semibold">فاتورة</th>
                </tr>
              </thead>
              <tbody>
                {creditRows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.date}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                        r.kind === "surplus" ? "bg-blue-50 text-blue-800 border border-blue-200"
                        : r.kind === "consumed" ? "bg-amber-50 text-amber-800 border border-amber-200"
                        : "bg-muted text-muted-foreground border border-border"
                      }`}>
                        {r.kind === "surplus" ? "فائض" : r.kind === "consumed" ? "استهلاك" : "أخرى"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.description || "—"}</td>
                    <td className={`px-3 py-2 text-left tabular-nums font-bold ${r.amount >= 0 ? "text-blue-700" : "text-amber-700"}`}>
                      {r.amount.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-left">
                      {r.reference_id ? (
                        <Link to={`/invoices/view/${r.reference_id}`} className="text-primary text-xs inline-flex items-center gap-1 hover:underline">
                          فتح <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/60 font-bold">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right text-xs">صافي الرصيد الدائن (يجب أن يساوي credit_balance):</td>
                  <td className="px-3 py-2 text-left tabular-nums">{computedCredit.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {(Math.abs(balDiff) >= 0.01 || Math.abs(credDiff) >= 0.01) && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 flex gap-2 text-amber-900 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            هناك فارق بين المحسوب من القيود والمخزَّن في بطاقة العميل. يمكن للمشرف تشغيل
            <code className="bg-amber-100 px-1 mx-1 rounded">recompute_customer_balance</code>
            لإعادة التزامن.
          </div>
        </div>
      )}
    </div>
  );
}

function PosCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-white border border-amber-200 p-2">
      <div className="text-[10px] text-amber-900/70">{label}</div>
      <div className="font-bold tabular-nums text-amber-900">{value}</div>
    </div>
  );
}
