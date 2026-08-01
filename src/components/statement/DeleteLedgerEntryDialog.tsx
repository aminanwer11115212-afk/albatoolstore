/**
 * نافذة حذف قيد من سجل معاملات العميل (دفعة على فاتورة أو شحن رصيد).
 *
 * تعرض قبل التنفيذ ملخّصاً كاملاً: المبلغ، التاريخ، الفاتورة المرتبطة إن وُجدت،
 * وأثر العملية على الرصيد (رصيد حالي ← رصيد بعد التنفيذ). وبعد التنفيذ تعرض
 * تأكيداً بنفس التفاصيل بدل توست عام.
 *
 * لا تكتب على `customers.balance` إطلاقاً — تستدعي RPCs تحذف من `transactions`
 * وتترك trigger إعادة الحساب يعمل، وتسجّل الحذف في `activity_log`.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUserRole } from "@/hooks/useUserRole";
import { formatMoney } from "@/utils/balanceDisplay";
import {
  classifyLedgerEntry,
  projectDeleteImpact,
  DELETABILITY_MESSAGE,
  type LedgerTx,
} from "@/utils/ledgerEntryActions";

export interface DeletableEntry extends LedgerTx {
  /** رقم الفاتورة المرتبطة — للعرض فقط. */
  invoiceNumber?: string | null;
  /** اسم الحساب/طريقة الدفع — للعرض فقط. */
  accountLabel?: string | null;
}

interface Props {
  open: boolean;
  entry: DeletableEntry | null;
  /** كل معاملات العميل — يُحتسب منها حارس استهلاك الرصيد. */
  transactions: LedgerTx[];
  /** الرصيد الصافي الحالي للعميل (موجب «عليه»، سالب «له»). */
  currentNet: number;
  onClose: () => void;
  onDeleted?: () => void;
}

const RPC_REASONS: Record<string, string> = {
  unauthorized_admin_only: "الحذف مسموح لمدير النظام فقط",
  missing_tx_id: "مُعرِّف القيد مفقود",
  tx_not_found: "القيد غير موجود — ربما حُذف من جلسة أخرى",
  not_a_payment: "هذا القيد ليس دفعة قابلة للحذف",
  not_a_credit_charge: "هذا القيد ليس شحن رصيد",
  credit_consumption_not_deletable: "قيود استهلاك الرصيد لا تُحذف من هنا — احذف الشحنة نفسها",
  credit_consumption_not_cancellable: "قيود استهلاك الرصيد الدائن لا تُلغى من هنا",
  no_customer: "القيد غير مرتبط بعميل",
  explicit_consumption: DELETABILITY_MESSAGE.explicit_consumption,
  insufficient_remaining_credit: DELETABILITY_MESSAGE.insufficient_remaining_credit,
  reverse_failed: "تعذّر عكس شحنة الرصيد",
};

/** سطر «رصيد حالي ← رصيد بعد التنفيذ» بصيغة موحّدة مع بقية الشاشات. */
function balanceText(net: number): string {
  if (Math.abs(net) < 0.01) return "خالص";
  return net > 0 ? `عليه ${formatMoney(Math.abs(net))}` : `له ${formatMoney(Math.abs(net))}`;
}

export default function DeleteLedgerEntryDialog({
  open, entry, transactions, currentNet, onClose, onDeleted,
}: Props) {
  const { isAdmin } = useUserRole();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<null | { amount: number; netBefore: number; netAfter: number }>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setSaving(false);
    setDone(null);
    setError(null);
  }, [open, entry?.id]);

  if (!entry) return null;

  const kind = classifyLedgerEntry(entry);
  const isCharge = kind === "credit_charge";
  const amount = Math.abs(Number(entry.amount || 0));
  const impact = projectDeleteImpact(entry, currentNet);
  // لا تنبيه قبل الحذف: القاعدة ثابتة — الدفع والشحن يُحسبان في حساب العميل،
  // فالحذف يردّ أثره إلى الرصيد التراكمي. وصندوق الأثر أسفله يعرض الرصيد قبل
  // وبعد بالأرقام، وهو أنفع من تحذيرٍ على أمرٍ محسوم.
  const blocked = false;

  const title = isCharge ? "حذف شحن رصيد" : "حذف دفعة";

  async function handleDelete() {
    if (!entry || !isAdmin || blocked) return;
    setSaving(true);
    setError(null);
    try {
      const rpc = isCharge ? "delete_customer_credit_entry" : "cancel_invoice_payment";
      const args = isCharge
        ? { _tx_id: entry.id, _reason: reason || null }
        : { _tx_id: entry.id, _reason: reason || null };
      const { data, error: rpcError } = await (supabase as any).rpc(rpc, args);
      if (rpcError) throw rpcError;
      if (!data?.ok) {
        setError(RPC_REASONS[data?.reason] || `تعذّر الحذف: ${data?.reason || "خطأ غير معروف"}`);
        return;
      }
      // الرصيد بعد التنفيذ من قاعدة البيانات نفسها — لا من التقدير المحلي،
      // حتى يطابق ما يعرضه الكشف بعد إعادة الحساب.
      const netAfter = data.net_after != null ? Number(data.net_after) : impact.after;
      setDone({
        amount: Number(data.amount_deleted ?? data.amount_cancelled ?? amount),
        netBefore: data.net_before != null ? Number(data.net_before) : impact.before,
        netAfter,
      });
      onDeleted?.();
    } catch (e: any) {
      setError(e?.message || "حدث خطأ أثناء الحذف");
    } finally {
      setSaving(false);
    }
  }

  const summaryRows: { label: string; value: string }[] = [
    { label: "المبلغ", value: formatMoney(amount) },
    { label: "التاريخ", value: entry.date || "—" },
    ...(entry.invoiceNumber ? [{ label: "الفاتورة المرتبطة", value: entry.invoiceNumber }] : []),
    ...(entry.accountLabel ? [{ label: "الحساب / الطريقة", value: entry.accountLabel }] : []),
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-right">
          <DialogTitle>{done ? "تم التنفيذ" : title}</DialogTitle>
          <DialogDescription className="text-xs">
            {done
              ? "أُعيد حساب الرصيد من قاعدة البيانات بعد الحذف."
              : "راجع الملخّص وأثر العملية على الرصيد قبل التأكيد."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border">
          {summaryRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-semibold text-foreground tabular-nums">{row.value}</span>
            </div>
          ))}
        </div>

        {/* أثر العملية على الرصيد */}
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3">
          <div className="text-xs text-muted-foreground mb-2">أثر العملية على الرصيد</div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-foreground tabular-nums">
              {balanceText(done ? done.netBefore : impact.before)}
            </span>
            <span aria-hidden className="text-muted-foreground">←</span>
            <span className="font-bold text-primary tabular-nums">
              {balanceText(done ? done.netAfter : impact.after)}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {done ? "الرصيد الحالي بعد التنفيذ" : "الرصيد الحالي ← الرصيد بعد التنفيذ"}
          </div>
        </div>

        {!done && (
          <>
            {!isAdmin && (
              <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
                الحذف مسموح لمدير النظام فقط.
              </div>
            )}

            {!blocked && (
              <div className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-md p-3">
                {isCharge
                  ? "سيُحذف قيد شحن الرصيد من سجل المعاملات ويُعاد حساب رصيد العميل تلقائياً."
                  : "سيُحذف قيد الدفعة، ويُنقص المدفوع على الفاتورة بقيمته، وتُحدَّث حالتها والمتبقي عليها تلقائياً."}
              </div>
            )}

            <div>
              <Label className="text-xs">سبب الحذف</Label>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="يُحفظ في سجل النشاط"
              />
            </div>

            {error && (
              <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
                {error}
              </div>
            )}
          </>
        )}

        {done && (
          <div className="text-xs text-success bg-success/10 border border-success/30 rounded-md p-3">
            حُذف {isCharge ? "شحن الرصيد" : "قيد الدفعة"} بقيمة{" "}
            <b className="tabular-nums">{formatMoney(done.amount)}</b>
            {entry.invoiceNumber ? ` من فاتورة ${entry.invoiceNumber}` : ""} وسُجّلت العملية في سجل النشاط.
          </div>
        )}

        <DialogFooter className="gap-2">
          {done ? (
            <Button onClick={onClose}>إغلاق</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={saving}>رجوع</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={saving || !isAdmin || blocked}>
                {saving ? "جارٍ الحذف…" : "تأكيد الحذف"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
