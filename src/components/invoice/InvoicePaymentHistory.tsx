import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronUp, History, Loader2, Pencil, Wallet } from "lucide-react";
import { methodLabel } from "./CustomerPaymentDialog";
import EditPaymentDialog, { type EditablePayment } from "@/components/finance/EditPaymentDialog";
import EditChargeDialog, { type EditableCharge } from "@/components/finance/EditChargeDialog";
import { useUserRole } from "@/hooks/useUserRole";


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

interface LiveTx {
  id: string;
  amount: number;
  method: string | null;
  account_id: string | null;
  date: string | null;
  customer_id: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: string;
  allocation: any;
}


/**
 * سجل تدقيق دفعات الفاتورة — snapshots + الدفعات النشطة القابلة للتعديل.
 */
export default function InvoicePaymentHistory({ invoiceId, refreshKey = 0 }: Props) {
  const [rows, setRows] = useState<Revision[]>([]);
  const [live, setLive] = useState<LiveTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<EditablePayment | null>(null);
  const [editingCharge, setEditingCharge] = useState<EditableCharge | null>(null);
  const [bump, setBump] = useState(0);
  const { isAdmin } = useUserRole();


  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!invoiceId) return;
      setLoading(true);
      const [{ data: revs }, { data: txs }] = await Promise.all([
        (supabase as any)
          .from("invoice_revisions")
          .select("id, created_at, action, changed_by, note, snapshot, changes")
          .eq("invoice_id", invoiceId)
          .eq("action", "payment")
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("transactions")
          .select("id, amount, method, account_id, date, customer_id, reference_id, description, created_at, allocation")

          .eq("reference_id", invoiceId)
          .eq("category", "customer_payment")
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setRows((revs as Revision[]) || []);
      setLive((txs as LiveTx[]) || []);
      setLoading(false);
    };
    load();
    const onChange = () => load();
    window.addEventListener("invoice-payments:changed", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("invoice-payments:changed", onChange);
    };
  }, [invoiceId, refreshKey, bump]);

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
          ) : (
            <>
              {isAdmin && live.length > 0 && (
                <div className="border-b border-border/70 bg-muted/20 p-2 space-y-1">
                  <div className="text-[10px] font-semibold text-muted-foreground">الدفعات النشطة (قابلة للتعديل)</div>
                  <ul className="divide-y divide-border/60">
                    {live.map((t) => {
                      const alloc = t.allocation || {};
                      const groupId: string | null = alloc.group_id || null;
                      const isCharge = !!groupId;
                      return (
                        <li key={t.id} className="flex items-center justify-between gap-2 py-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-bold tabular-nums text-primary">{Number(t.amount || 0).toLocaleString()}</span>
                            <span className="text-[11px] text-muted-foreground">{methodLabel(t.method || "")}</span>
                            <span className="text-[10px] text-muted-foreground">{t.date || ""}</span>
                            {isCharge && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                من شحن رصيد
                              </span>
                            )}
                          </div>
                          {isCharge ? (
                            <button
                              type="button"
                              className="flex items-center gap-1 rounded-md border border-emerald-400/60 px-2 py-0.5 text-[11px] hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                              onClick={async () => {
                                if (!groupId || !t.customer_id) return;
                                // اجلب كل بنود المجموعة لتحديد الاستهلاك على فواتير أخرى
                                const { data: groupRows } = await (supabase as any)
                                  .from("transactions")
                                  .select("amount, allocation, method, account_id, date")
                                  .eq("customer_id", t.customer_id)
                                  .contains("allocation", { group_id: groupId });
                                const rows = (groupRows as any[]) || [];
                                const totalAmount = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
                                const otherInvoiceItems = rows.filter((r) => {
                                  const a = r.allocation || {};
                                  return a.kind !== "surplus" && a.invoice_id && a.invoice_id !== invoiceId;
                                });
                                setEditingCharge({
                                  groupId,
                                  customerId: t.customer_id,
                                  amount: totalAmount || Number(t.amount || 0),
                                  method: t.method,
                                  accountId: t.account_id,
                                  date: t.date,
                                  hasConsumption: otherInvoiceItems.length > 0,
                                });
                              }}
                              data-testid="edit-invoice-charge-btn"
                            >
                              <Wallet size={11} /> تعديل شحن الرصيد
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-primary/10 hover:border-primary/40"
                              onClick={() => setEditing({
                                id: t.id,
                                amount: Number(t.amount || 0),
                                reference_id: t.reference_id,
                                customer_id: t.customer_id,
                                description: t.description,
                                method: t.method,
                                account_id: t.account_id,
                                date: t.date,
                              })}
                              data-testid="edit-invoice-payment-btn"
                            >
                              <Pencil size={11} /> تعديل
                            </button>
                          )}
                        </li>
                      );
                    })}

                  </ul>
                </div>
              )}
              {rows.length === 0 ? (
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
                    const ref = s.reference_no ? ` — رقم العملية ${s.reference_no}` : "";
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
            </>
          )}
        </div>
      )}

      <EditPaymentDialog
        open={!!editing}
        tx={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setBump((b) => b + 1);
          window.dispatchEvent(new Event("invoice-payments:changed"));
        }}
      />
    </div>
  );
}
