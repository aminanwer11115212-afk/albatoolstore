import { useMemo } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Loader2, Undo2 } from "lucide-react";

export interface ReverseChargeItem {
  invoice_id?: string;
  invoice_number?: string;
  invoice_date?: string;
  invoice_total: number;
  applied: number;
  paid_before: number;
  paid_after: number;
  remaining_before: number;
  remaining_after: number;
  new_status?: string;
}

export interface ReverseChargeGroup {
  groupId: string;
  date: string;
  method: string | null;
  total: number;
  allocated: number;
  surplus: number;
  items: ReverseChargeItem[];
}

interface Props {
  open: boolean;
  group: ReverseChargeGroup | null;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * Detailed confirmation dialog for reversing a customer charge (شحنة رصيد).
 * - Lists each invoice affected + the amount that will be re-added as debt.
 * - Shows the surplus that will disappear from customer_credit.
 * - Blocks the action if the group is internally inconsistent
 *   (e.g. allocated + surplus ≠ total by more than 1 unit).
 */
export function ReverseChargeConfirmDialog({
  open,
  group,
  pending,
  onConfirm,
  onCancel,
}: Props) {
  const inconsistency = useMemo(() => {
    if (!group) return null;
    const sum = Number(group.allocated || 0) + Number(group.surplus || 0);
    const diff = Math.abs(sum - Number(group.total || 0));
    if (diff > 1) {
      return `عدم اتساق: مجموع (المسدَّد + الفائض) = ${fmt(sum)} لا يطابق إجمالي الشحنة ${fmt(group.total)}. يُرجى مراجعة سجل المعاملات قبل الإلغاء.`;
    }
    // Row-level consistency: paid_after − paid_before should equal applied.
    for (const it of group.items) {
      const delta = Number(it.paid_after || 0) - Number(it.paid_before || 0);
      if (Math.abs(delta - Number(it.applied || 0)) > 1) {
        return `عدم اتساق في فاتورة ${it.invoice_number || it.invoice_id || "?"}: paid_after − paid_before = ${fmt(delta)} ≠ applied ${fmt(it.applied)}.`;
      }
    }
    return null;
  }, [group]);

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v && !pending) onCancel(); }}>
      <AlertDialogContent dir="rtl" className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <Undo2 size={18} /> تأكيد إلغاء شحنة الرصيد
          </AlertDialogTitle>
          <AlertDialogDescription>
            راجع بدقة الفواتير التي ستتأثر والمبالغ التي ستُعاد كديون قبل التنفيذ. لا يمكن التراجع عن هذا الإجراء.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {group && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-border bg-muted/30 p-3 flex flex-wrap gap-x-5 gap-y-1">
              <div>التاريخ: <span className="font-bold">{group.date}</span></div>
              <div>الإجمالي: <span className="font-bold tabular-nums">{fmt(group.total)}</span></div>
              {group.allocated > 0.01 && (
                <div>المسدَّد على فواتير: <span className="font-bold text-emerald-600 tabular-nums">{fmt(group.allocated)}</span></div>
              )}
              {group.surplus > 0.01 && (
                <div>الفائض (رصيد دائن): <span className="font-bold text-primary tabular-nums">{fmt(group.surplus)}</span></div>
              )}
            </div>

            {group.items.length > 0 ? (
              <div className="max-h-64 overflow-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-right font-semibold">الفاتورة</th>
                      <th className="px-2 py-2 text-right font-semibold">المطبَّق</th>
                      <th className="px-2 py-2 text-right font-semibold">المدفوع قبل → بعد</th>
                      <th className="px-2 py-2 text-right font-semibold">المتبقي بعد الإلغاء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((it, i) => {
                      const remainingAfterReverse = Math.max(
                        Number(it.invoice_total || 0) - Math.max(Number(it.paid_after || 0) - Number(it.applied || 0), 0),
                        0,
                      );
                      return (
                        <tr key={i} className="border-t border-border/60">
                          <td className="px-2 py-1.5 tabular-nums">
                            {it.invoice_number || it.invoice_id?.slice(0, 8) || "—"}
                          </td>
                          <td className="px-2 py-1.5 tabular-nums text-amber-700 dark:text-amber-400">
                            −{fmt(it.applied)}
                          </td>
                          <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                            {fmt(it.paid_before)} → {fmt(it.paid_after)}
                          </td>
                          <td className="px-2 py-1.5 tabular-nums font-bold text-destructive">
                            {fmt(remainingAfterReverse)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-md border border-border bg-muted/20 p-3 text-muted-foreground">
                هذه الشحنة كلها فائض (رصيد دائن) — سيتم خصم <span className="font-bold text-foreground tabular-nums">{fmt(group.surplus)}</span> من الرصيد الدائن للعميل.
              </div>
            )}

            {inconsistency && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive" data-testid="reverse-inconsistency">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div className="text-xs leading-relaxed">{inconsistency}</div>
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={pending}>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            disabled={pending || !!inconsistency}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="reverse-charge-confirm"
          >
            {pending ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> جارٍ الإلغاء...</span>
            ) : "نعم، ألغِ الشحنة"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
