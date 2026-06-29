import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [baseCode, setBaseCode] = useState<string>("");
  const [foreignCode, setForeignCode] = useState<string>("USD");
  const [currentRate, setCurrentRate] = useState<number>(1);
  const [newRate, setNewRate] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
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

      // Load ALL products with foreign_price (paginate past the 1000 row default cap)
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

  const preview = useMemo(() => products.map(p => ({
    ...p,
    newPrice: Number(p.foreign_price || 0) * newRateNum,
  })), [products, newRateNum]);

  const updatePrices = async () => {
    if (!newRateNum || newRateNum <= 0) { toast.error("أدخل معدل صحيح"); return; }
    setSaving(true);

    // Save new rate
    const { error: erErr } = await supabase.from("exchange_rates").insert({
      currency_code: foreignCode,
      rate_to_base: newRateNum,
      effective_date: new Date().toISOString().slice(0, 10),
    });
    if (erErr) { setSaving(false); toast.error("فشل حفظ المعدل: " + erErr.message); return; }

    // Update all product sale_price = foreign_price * newRate (parallel batches of 25)
    let updated = 0;
    const batchSize = 25;
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      const results = await Promise.all(batch.map((p) => {
        const fp = Number(p.foreign_price || 0);
        if (!fp) return Promise.resolve({ error: null, skip: true } as any);
        return supabase.from("products").update({ sale_price: fp * newRateNum }).eq("id", p.id);
      }));
      updated += results.filter((r: any) => !r.error && !r.skip).length;
    }

    // Update DRAFT quotes (status='draft') with same currency
    let quotesCount = 0;
    const { data: draftQuotes } = await supabase
      .from("quotes")
      .select("id, discount")
      .eq("status", "draft")
      .eq("currency_code", foreignCode);
    for (const q of draftQuotes || []) {
      const { data: items } = await supabase
        .from("quote_items")
        .select("id, foreign_price, quantity, discount, format_discount")
        .eq("quote_id", q.id);
      let subtotal = 0;
      for (const it of items || []) {
        const fp = Number(it.foreign_price || 0);
        if (!fp) continue;
        const unitPrice = fp * newRateNum;
        const qty = Number(it.quantity || 0);
        const disc = Number(it.discount || 0);
        const discValue = it.format_discount === "amount" ? disc : (unitPrice * qty * disc / 100);
        const total = (unitPrice * qty) - discValue;
        subtotal += total;
        await supabase.from("quote_items")
          .update({ unit_price: unitPrice, discount_value: discValue, total })
          .eq("id", it.id);
      }
      await supabase.from("quotes")
        .update({ exchange_rate_to_base: newRateNum, subtotal, total: subtotal - Number(q.discount || 0) })
        .eq("id", q.id);
      quotesCount++;
    }

    // Update DRAFT/preparing invoices with same currency
    let invoicesCount = 0;
    const { data: draftInvoices } = await supabase
      .from("invoices")
      .select("id, discount, shipping, paid_amount")
      .or("workflow_status.eq.quote,workflow_status.eq.preparing,status.eq.draft")
      .eq("currency_code", foreignCode);
    for (const inv of draftInvoices || []) {
      const { data: items } = await supabase
        .from("invoice_items")
        .select("id, foreign_price, quantity, discount, format_discount")
        .eq("invoice_id", inv.id);
      let subtotal = 0;
      for (const it of items || []) {
        const fp = Number(it.foreign_price || 0);
        if (!fp) continue;
        const unitPrice = fp * newRateNum;
        const qty = Number(it.quantity || 0);
        const disc = Number(it.discount || 0);
        const discValue = it.format_discount === "amount" ? disc : (unitPrice * qty * disc / 100);
        const total = (unitPrice * qty) - discValue;
        subtotal += total;
        await supabase.from("invoice_items")
          .update({ unit_price: unitPrice, discount_value: discValue, total })
          .eq("id", it.id);
      }
      const total = subtotal - Number(inv.discount || 0) + Number(inv.shipping || 0);
      const paid = Number((inv as any).paid_amount || 0);
      const due = Math.max(0, total - paid);
      await supabase.from("invoices")
        .update({ exchange_rate_to_base: newRateNum, subtotal, total, due_amount: due })
        .eq("id", inv.id);

      invoicesCount++;
    }

    setSaving(false);
    setCurrentRate(newRateNum);
    toast.success(`تم التحديث: ${updated} منتج، ${quotesCount} عرض، ${invoicesCount} فاتورة`);
    onSaved?.();
  };

  const fmt = (n: number) => `${baseCode || "SDG"} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            />
            <p className="text-xs text-muted-foreground">أدخل المعدل الجديد للتحويل (مثال: 1.00)</p>
          </div>

          <Button onClick={updatePrices} disabled={saving} className="gap-2">
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
            <Button variant="secondary" onClick={() => onOpenChange(false)}>إغلاق</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
