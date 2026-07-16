import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";

/**
 * أداة مطوّر مخفية — تُفتح فقط عبر Ctrl+Shift+9.
 * لا تظهر في أي شاشة إعدادات. متاحة لمستخدمي admin فقط (الـ RPC يتحقق).
 * تصفير سريع لـ:
 *   - كميات كل المنتجات
 *   - كشف حساب كل العملاء (حذف الدفعات والأرصدة الدائنة + تعليم الفواتير كمدفوعة + تصفير الأرصدة)
 */
export default function HiddenDevResetDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState({ stock: true, ledger: true });
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Shift+9 (يعمل مع Digit9 لتفادي مشاكل لوحة عربية)
      if (e.ctrlKey && e.shiftKey && (e.key === "9" || e.code === "Digit9")) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const anySelected = scope.stock || scope.ledger;
  const canRun = anySelected && confirmText.trim() === "تصفير" && !busy;

  const run = async () => {
    if (!canRun) return;
    if (!confirm("تنفيذ التصفير المخفي؟ لا يمكن التراجع.")) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(
        "admin_reset_stock_and_ledgers" as any,
        { _scope: scope },
      );
      if (error) throw error;
      setResult(data);
      [
        "products", "products-full", "product",
        "invoices", "invoices-full", "invoices-with-customers",
        "transactions", "transactionsWithAccounts",
        "customers", "customer-statement", "customer-transactions",
        "customer_balance_stats", "activity-log",
      ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      window.dispatchEvent(new Event("customers:changed"));
      window.dispatchEvent(new Event("invoices:changed"));
      window.dispatchEvent(new Event("products:changed"));
      toast.success("تم التصفير بنجاح");
      setConfirmText("");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر التنفيذ — يلزم صلاحية admin");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setConfirmText(""); setResult(null); } }}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle size={18} /> أداة مطوّر مخفية — تصفير سريع
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive leading-relaxed">
            هذه الأداة <b>غير معلنة في الإعدادات</b> ومخصصة للمبرمج فقط. لا يمكن التراجع عن العملية.
          </div>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer">
            <Checkbox checked={scope.stock} onCheckedChange={() => setScope((s) => ({ ...s, stock: !s.stock }))} className="mt-1" />
            <div className="flex-1">
              <div className="font-semibold text-foreground">تصفير كميات كل المنتجات</div>
              <div className="text-xs text-muted-foreground mt-0.5">يضبط <code>stock_quantity</code> إلى صفر لكل المنتجات.</div>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer">
            <Checkbox checked={scope.ledger} onCheckedChange={() => setScope((s) => ({ ...s, ledger: !s.ledger }))} className="mt-1" />
            <div className="flex-1">
              <div className="font-semibold text-foreground">تصفير كشف حساب كل العملاء</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                يحذف كل الدفعات والأرصدة الدائنة، ويعلّم كل الفواتير غير الملغاة كمدفوعة، ويعيد الأرصدة إلى صفر.
              </div>
            </div>
          </label>

          <div className="space-y-1.5">
            <Label className="text-xs">اكتب كلمة <b className="text-destructive">تصفير</b> للتأكيد:</Label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="تصفير" className="max-w-xs" dir="rtl" />
          </div>

          <div className="flex gap-2">
            <Button variant="destructive" onClick={run} disabled={!canRun}>
              <Trash2 size={16} className="ml-1" />
              {busy ? "جارِ التنفيذ..." : "تنفيذ الآن"}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>إغلاق</Button>
          </div>

          {result && (
            <pre className="text-[11px] bg-muted p-3 rounded-lg overflow-auto max-h-40" dir="ltr">
{JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
