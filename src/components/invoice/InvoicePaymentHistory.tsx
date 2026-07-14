import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronUp, History, Loader2 } from "lucide-react";
import { methodLabel } from "./CustomerPaymentDialog";

interface Props {
  invoiceId: string;
  refreshKey?: number;
}

interface Revision {
  id: string;
  created_at: string;
  action: string;
  changed_by: string | null;
  note: string | null;
  snapshot: any;
  changes: any;
}

/**
 * سجل تدقيق دفعات الفاتورة — يقرأ من invoice_revisions حيث action='payment'.
 * يعرض من قام بالتسجيل، الوقت، القيمة، وطريقة الدفع.
 */
export default function InvoicePaymentHistory({ invoiceId, refreshKey = 0 }: Props) {
  const [rows, setRows] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!invoiceId) return;
      setLoading(true);
      const { data } = await (supabase as any)
        .from("invoice_revisions")
        .select("id, created_at, action, changed_by, note, snapshot, changes")
        .eq("invoice_id", invoiceId)
        .eq("action", "payment")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setRows((data as Revision[]) || []);
      setLoading(false);
    })();
    const onChange = () => {
      // إعادة التحميل عند إشعار تغيير الدفعات
      (async () => {
        const { data } = await (supabase as any)
          .from("invoice_revisions")
          .select("id, created_at, action, changed_by, note, snapshot, changes")
          .eq("invoice_id", invoiceId)
          .eq("action", "payment")
          .order("created_at", { ascending: false });
        setRows((data as Revision[]) || []);
      })();
    };
    window.addEventListener("invoice-payments:changed", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("invoice-payments:changed", onChange);
    };
  }, [invoiceId, refreshKey]);

  if (!invoiceId) return null;

  return (
    <div dir="rtl" className="rounded-md border border-border bg-background/60 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/40"
      >
        <span className="flex items-center gap-1.5 font-semibold">
          <History size={14} /> سجل الدفعات
          {rows.length > 0 && (
            <span className="text-muted-foreground font-normal">({rows.length})</span>
          )}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="border-t border-border">
          {loading ? (
            <div className="flex items-center gap-1 p-3 text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> جارٍ التحميل…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-3 text-muted-foreground text-center">لا توجد دفعات مسجّلة بعد</div>
          ) : (
            <ul className="divide-y divide-border max-h-64 overflow-auto">
              {rows.map((r) => {
                const s = r.snapshot || {};
                const amount = Number(s.amount || 0);
                const applied = Number(s.applied || 0);
                const overpay = Number(s.overpay || 0);
                const disc = Number(s.discount || 0);
                const acc = s.account_name || "—";
                const bank = s.bank_name ? ` — ${s.bank_name}` : "";
                const ref = s.reference_no ? ` — مرجع ${s.reference_no}` : "";
                const when = new Date(r.created_at).toLocaleString("ar-EG");
                return (
                  <li key={r.id} className="p-2 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold tabular-nums text-primary">
                        {amount.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{when}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>الطريقة: <b className="text-foreground">{methodLabel(s.method || "")}</b></span>
                      <span>الحساب: <b className="text-foreground">{acc}{bank}</b></span>
                      {applied > 0 && applied !== amount && (
                        <span>مُطبَّق: <b className="text-foreground">{applied.toLocaleString()}</b></span>
                      )}
                      {overpay > 0 && (
                        <span className="text-emerald-700 dark:text-emerald-300">
                          فائض: <b>{overpay.toLocaleString()}</b>
                        </span>
                      )}
                      {disc > 0 && <span>خصم: <b className="text-foreground">{disc.toLocaleString()}</b></span>}
                      {ref && <span>{ref}</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      بواسطة: <b>{r.changed_by || "—"}</b>
                      {s.status && <> — الحالة بعد الحفظ: <b>{s.status}</b></>}
                    </div>
                    {r.note && <div className="text-[10px] text-muted-foreground/80">{r.note}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
