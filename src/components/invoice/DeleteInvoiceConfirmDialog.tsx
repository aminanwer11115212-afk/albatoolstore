import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, Wallet, DollarSign, Package, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { previewInvoiceDeletion, type InvoiceDeletionPreview } from "@/utils/invoiceDeletionPreview";

interface Props {
  open: boolean;
  invoiceId: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}

/**
 * حوار تأكيد حذف فاتورة يعرض تلقائياً معاينة الأثر:
 *  - الدفعات التي ستُحذف
 *  - الفائض المرتبط بها (customer_credit) وأي استهلاك سيُنظَّف
 *  - استعادة المخزون
 *  - الرصيد المتوقع للعميل بعد الحذف
 */
export default function DeleteInvoiceConfirmDialog({
  open, invoiceId, onCancel, onConfirm, confirming,
}: Props) {
  const [preview, setPreview] = useState<InvoiceDeletionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !invoiceId) { setPreview(null); setErr(null); return; }
    let cancelled = false;
    setLoading(true); setErr(null);
    previewInvoiceDeletion(invoiceId)
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch((e) => { if (!cancelled) setErr(e?.message || "تعذّر جلب معاينة الحذف"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, invoiceId]);

  const blocked = preview?.fullyPaidAndDone === true;
  const num = preview?.invoiceNumber ? `«${preview.invoiceNumber}»` : "";

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent dir="rtl" className="max-w-lg" data-testid="delete-invoice-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" /> حذف الفاتورة {num}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-right text-sm text-foreground/80">
              {loading && (
                <div className="flex items-center gap-2 text-muted-foreground py-3">
                  <Loader2 className="h-4 w-4 animate-spin" /> جاري فحص الأثر...
                </div>
              )}
              {err && (
                <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-destructive text-xs">
                  {err}
                </div>
              )}
              {preview && !loading && !err && (
                <>
                  {blocked ? (
                    <div className="rounded border border-destructive/50 bg-destructive/10 p-3 flex gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-destructive">لا يمكن حذف هذه الفاتورة</div>
                        <div className="text-xs text-destructive/90 mt-1">
                          العميل سدّد كامل قيمتها واستُلمت الطلبية (تمت).
                          لعكس العملية أنشئ إشعار مرتجع أو استرداد رصيد.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded border border-amber-300 bg-amber-50 p-3 flex gap-2 text-amber-900">
                      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        هذه العملية غير قابلة للتراجع. راجع الأثر أدناه بعناية قبل التأكيد.
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2">
                    <PreviewRow
                      icon={<Package className="h-4 w-4" />}
                      label="بنود الفاتورة"
                      value={`${preview.itemsCount} بند`}
                      hint={preview.stockWillRestore ? "سيُعاد للمخزون" : "لن يتأثر المخزون"}
                    />
                    {!preview.isPos && preview.customerId && (
                      <>
                        <PreviewRow
                          icon={<DollarSign className="h-4 w-4 text-emerald-700" />}
                          label="دفعات ستُحذف"
                          value={preview.payments.count
                            ? `${preview.payments.count} دفعة (${preview.payments.amount.toLocaleString()})`
                            : "لا توجد"}
                        />
                        <PreviewRow
                          icon={<Wallet className="h-4 w-4 text-blue-700" />}
                          label="فائض (رصيد دائن) مرتبط"
                          value={preview.surplusCredit.count
                            ? `${preview.surplusCredit.count} × ${preview.surplusCredit.amount.toLocaleString()} — سيُحذف`
                            : "لا يوجد فائض"}
                          highlight={preview.surplusCredit.amount > 0.01}
                        />
                        {preview.consumedCredit.count > 0 && (
                          <PreviewRow
                            icon={<Wallet className="h-4 w-4 text-amber-700" />}
                            label="استهلاك للفائض سيُنظَّف"
                            value={`${preview.consumedCredit.count} حركة (${preview.consumedCredit.amount.toLocaleString()})`}
                            highlight
                          />
                        )}
                        <div className="rounded border border-border bg-muted/40 p-3 mt-1">
                          <div className="text-[11px] text-muted-foreground mb-1">الرصيد بعد الحذف (تقديري):</div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <BalanceCell label="عليه" before={preview.currentCustomerBalance} after={preview.projectedCustomerBalance} />
                            <BalanceCell label="له (دائن)" before={preview.currentCustomerCredit} after={preview.projectedCustomerCredit} />
                          </div>
                        </div>
                      </>
                    )}
                    {preview.isPos && (
                      <div className="text-xs text-muted-foreground">
                        فاتورة كاش (POS) — لا تؤثر على بطاقة العميل.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirming}>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            disabled={confirming || loading || blocked || !preview}
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {confirming ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> جارٍ الحذف...</span>
            ) : "تأكيد الحذف"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PreviewRow({ icon, label, value, hint, highlight }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 rounded border px-3 py-2 text-xs ${highlight ? "border-amber-300 bg-amber-50" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 text-foreground/80">
        {icon}<span className="font-semibold">{label}</span>
      </div>
      <div className="text-left">
        <div className="font-bold tabular-nums">{value}</div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

function BalanceCell({ label, before, after }: { label: string; before: number; after: number }) {
  const diff = after - before;
  return (
    <div className="rounded bg-background border border-border/60 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="tabular-nums font-bold">{after.toLocaleString()}</div>
      <div className={`text-[10px] tabular-nums ${diff === 0 ? "text-muted-foreground" : diff > 0 ? "text-emerald-700" : "text-destructive"}`}>
        {diff === 0 ? "بدون تغيير" : `${diff > 0 ? "+" : ""}${diff.toLocaleString()}`}
      </div>
    </div>
  );
}
