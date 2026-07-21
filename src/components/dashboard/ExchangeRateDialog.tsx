import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw } from "lucide-react";
import { useDialogSize } from "@/hooks/useDialogSize";

type Currency = { id: string; code: string; name: string; is_base: boolean };
type Product = { id: string; name: string; foreign_price: number | null; sale_price: number | null };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}

export default function ExchangeRateDialog({ open, onOpenChange, onSaved }: Props) {
  const qc = useQueryClient();
  const [baseCode, setBaseCode] = useState<string>("");
  const [foreignCode, setForeignCode] = useState<string>("USD");
  const [currentRate, setCurrentRate] = useState<number>(1);
  const [newRate, setNewRate] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const savingRef = useRef(false);
  const { dlgRef, dlgStyle } = useDialogSize("exchange_rate_dialog", open, { w: "min(760px, 96vw)", h: "85vh" });

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: curs } = await supabase
        .from("currencies").select("id, code, name, is_base")
        .eq("is_active", true).order("is_base", { ascending: false });
      const list = (curs || []) as Currency[];
      const base = list.find(c => c.is_base);
      const foreign = list.find(c => !c.is_base);
      setBaseCode(base?.code || "");
      const fc = foreign?.code || "USD";
      setForeignCode(fc);

      const { data: er } = await supabase
        .from("exchange_rates")
        .select("rate_to_base, currency_code, effective_date")
        .eq("currency_code", fc)
        .order("effective_date", { ascending: false })
        .limit(1).maybeSingle();
      const rate = Number(er?.rate_to_base || 1);
      setCurrentRate(rate);
      setNewRate(String(rate));

      const all: Product[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data: page, error } = await supabase
          .from("products")
          .select("id, name, foreign_price, sale_price")
          .not("foreign_price", "is", null)
          .order("name")
          .range(from, from + pageSize - 1);
        if (error || !page || page.length === 0) break;
        all.push(...(page as Product[]));
        if (page.length < pageSize) break;
        from += pageSize;
      }
      setProducts(all);
    })();
  }, [open]);

  const newRateNum = Number(newRate) || 0;
  const rateChanged = newRateNum > 0 && Math.abs(newRateNum - currentRate) > 1e-9;
  const changePct = currentRate > 0 ? ((newRateNum - currentRate) / currentRate) * 100 : 0;

  const preview = useMemo(() => products.map(p => ({
    ...p,
    newPrice: Number(p.foreign_price || 0) * newRateNum,
  })), [products, newRateNum]);

  const requestUpdate = () => {
    if (!newRateNum || newRateNum <= 0) { toast.error("أدخل معدل صحيح"); return; }
    if (!rateChanged) { toast.info("لم يتغيّر المعدل"); return; }
    setConfirmOpen(true);
  };

  const doUpdate = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setConfirmOpen(false);
    try {
      const { data, error } = await (supabase as any).rpc("apply_exchange_rate_bulk", {
        _currency_code: foreignCode,
        _new_rate: newRateNum,
      });
      if (error) throw error;

      // Invalidate every cache that depends on prices/rates
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["products-with-details"] }),
        qc.invalidateQueries({ queryKey: ["products"] }),
        qc.invalidateQueries({ queryKey: ["invoices-with-customers"] }),
        qc.invalidateQueries({ queryKey: ["invoices-full"] }),
        qc.invalidateQueries({ queryKey: ["quotes-with-customers"] }),
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] }),
        qc.invalidateQueries({ queryKey: ["exchange_rates"] }),
        qc.invalidateQueries({ queryKey: ["latest-exchange-rates"] }),
        qc.invalidateQueries({ queryKey: ["activity_log"] }),
      ]);

      setCurrentRate(newRateNum);
      const r = data || {};
      toast.success(
        `تم التحديث بنجاح — ${r.products_updated ?? 0} منتج، ${r.quotes_updated ?? 0} عرض، ${r.invoices_updated ?? 0} فاتورة`
      );
      onSaved?.();
    } catch (e: any) {
      toast.error("فشل تحديث الأسعار: " + (e?.message || "خطأ غير معروف"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const fmt = (n: number) => `${baseCode || "SDG"} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
        <DialogContent ref={dlgRef} style={{ ...dlgStyle, overflowY: "auto", padding: 0 }} dir="rtl">
          <DialogHeader className="bg-primary text-primary-foreground px-5 py-3 rounded-t-lg">
            <DialogTitle className="text-base">تحديث معدل التحويل</DialogTitle>
          </DialogHeader>

          <div className="p-5 space-y-4">
            <div className="text-sm">
              معدل التحويل الحالي: <span className="font-semibold">{currentRate.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              <span className="text-muted-foreground mr-2">({foreignCode} → {baseCode})</span>
            </div>

            <div className="space-y-1">
              <Label className="text-sm">المعدل الجديد</Label>
              <Input
                type="number"
                step="0.0001"
                value={newRate}
                onChange={e => setNewRate(e.target.value)}
                className="text-left"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                أدخل المعدل الجديد للتحويل (مثال: 1.00)
                {rateChanged && (
                  <span className={`mr-2 font-semibold ${changePct >= 0 ? "text-warning" : "text-destructive"}`}>
                    ({changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%)
                  </span>
                )}
              </p>
            </div>

            <Button onClick={requestUpdate} disabled={saving || !rateChanged} className="gap-2">
              <RefreshCw size={16} className={saving ? "animate-spin" : ""} />
              {saving ? "جاري التحديث..." : "تحديث الأسعار"}
            </Button>

            <div className="pt-2">
              <h3 className="text-sm font-semibold mb-2">معاينة تأثير المعدل الجديد على الأسعار</h3>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-right font-semibold">اسم المنتج</th>
                      <th className="px-3 py-2 text-right font-semibold">السعر الأجنبي</th>
                      <th className="px-3 py-2 text-right font-semibold">السعر الحالي</th>
                      <th className="px-3 py-2 text-right font-semibold">السعر الجديد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.length === 0 && (
                      <tr><td colSpan={4} className="text-center text-muted-foreground py-6">لا توجد منتجات بسعر أجنبي</td></tr>
                    )}
                    {preview.map(p => (
                      <tr key={p.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2">{p.name}</td>
                        <td className="px-3 py-2 font-mono">{Number(p.foreign_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 font-mono">{fmt(Number(p.sale_price || 0))}</td>
                        <td className="px-3 py-2 font-mono font-semibold text-primary">{fmt(p.newPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-start pt-2">
              <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>إغلاق</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد تحديث معدل التحويل</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <div>سيتم تغيير المعدل من <b>{currentRate.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b> إلى <b>{newRateNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b> ({foreignCode} → {baseCode}).</div>
              <div>سيؤثر ذلك على <b>{products.length}</b> منتج، بالإضافة إلى مسودات العروض والفواتير بنفس العملة.</div>
              <div className="text-destructive">الفواتير المؤكدة/المكتملة لن تتأثر. لا يمكن التراجع تلقائياً.</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={doUpdate}>تأكيد وتطبيق</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
