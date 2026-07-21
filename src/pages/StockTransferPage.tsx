import { useMemo, useRef, useState } from "react";
import ZoomControls from "@/components/ZoomControls";
import { Plus, Search, ArrowLeftRight, Loader2, X } from "lucide-react";
import { useProducts, useWarehouses } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { startsWithMatch } from "@/utils/searchMatch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function useStockTransfersWithDetails() {
  return useQuery({
    queryKey: ["stock-transfers-details"],
    queryFn: async () => {
      const [transfersRes, productsRes, warehousesRes] = await Promise.all([
        supabase.from("stock_transfers").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("products").select("id, name, stock_quantity"),
        supabase.from("warehouses").select("id, name"),
      ]);
      if (transfersRes.error) throw transfersRes.error;
      const productsMap = new Map((productsRes.data || []).map((p: any) => [p.id, p.name]));
      const warehousesMap = new Map((warehousesRes.data || []).map((w: any) => [w.id, w.name]));
      return (transfersRes.data || []).map((t: any) => ({
        ...t,
        product_name: productsMap.get(t.product_id) || "-",
        from_warehouse_name: warehousesMap.get(t.from_warehouse_id) || "-",
        to_warehouse_name: warehousesMap.get(t.to_warehouse_id) || "-",
      }));
    },
  });
}

const REASONS: Record<string, string> = {
  missing_fields: "الحقول ناقصة",
  same_warehouse: "لا يمكن التحويل لنفس المستودع",
  invalid_quantity: "كمية غير صالحة",
  product_not_found: "المنتج غير موجود",
  from_warehouse_not_found: "مستودع المصدر غير موجود",
  to_warehouse_not_found: "مستودع الهدف غير موجود",
  insufficient_stock: "الكمية المتوفرة أقل من المطلوب",
  wrong_source_warehouse: "المنتج غير موجود في مستودع المصدر المحدّد",
};

export default function StockTransferPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    product_id: "", from_warehouse_id: "", to_warehouse_id: "", quantity: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const { data: transfers, isLoading } = useStockTransfersWithDetails();
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();

  const filtered = (transfers || []).filter((t: any) =>
    !search.trim() || startsWithMatch(t.product_name, search),
  );

  const selectedProduct = useMemo(
    () => (products || []).find((p: any) => p.id === form.product_id),
    [products, form.product_id]
  );

  const resetForm = () => {
    setForm({ product_id: "", from_warehouse_id: "", to_warehouse_id: "", quantity: "", notes: "" });
  };

  const handleSubmit = async () => {
    if (savingRef.current) return;
    if (!form.product_id || !form.from_warehouse_id || !form.to_warehouse_id || !form.quantity) {
      toast.error("جميع الحقول مطلوبة"); return;
    }
    const qty = parseInt(form.quantity, 10);
    if (!qty || qty <= 0) { toast.error("كمية غير صالحة"); return; }
    if (form.from_warehouse_id === form.to_warehouse_id) {
      toast.error("لا يمكن التحويل لنفس المستودع"); return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("transfer_stock_once", {
        _product_id: form.product_id,
        _from_warehouse: form.from_warehouse_id,
        _to_warehouse: form.to_warehouse_id,
        _quantity: qty,
        _notes: form.notes || null,
      });
      if (error) throw error;
      const res = data as any;
      if (res?.ok === false) {
        const msg = REASONS[res.reason] || res.reason || "فشل التحويل";
        toast.error(msg, {
          description: res.reason === "insufficient_stock"
            ? `المتاح: ${res.available} — المطلوب: ${res.requested}`
            : undefined,
        });
        return;
      }
      toast.success("تم تحويل المخزون", {
        description: res?.relocated_product_warehouse ? "تم نقل المنتج إلى المستودع الهدف" : undefined,
      });
      setShowForm(false);
      resetForm();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["stock-transfers-details"] }),
        qc.invalidateQueries({ queryKey: ["stock-tracking"] }),
        qc.invalidateQueries({ queryKey: ["products"] }),
        qc.invalidateQueries({ queryKey: ["products-with-details"] }),
      ]);
    } catch (e: any) {
      toast.error(e?.message || "فشل التحويل");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-6 font-cairo">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">تحويل المخزون</h1>
        <div className="flex items-center gap-2">
          <ZoomControls />
          <Button onClick={() => setShowForm(true)} className="gap-2 min-h-[44px]">
            <Plus size={16} /> تحويل جديد
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl border border-border p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">تحويل مخزون جديد</h3>
            <Button variant="ghost" size="icon" onClick={() => { setShowForm(false); resetForm(); }} disabled={saving}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">المنتج</label>
              <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
                <SelectContent>
                  {(products || []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.stock_quantity != null && <span className="text-muted-foreground text-xs">({p.stock_quantity})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProduct && (
                <p className="text-xs text-muted-foreground mt-1">
                  المتوفر حالياً: <span className="font-semibold text-foreground">{selectedProduct.stock_quantity ?? 0}</span>
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">من المستودع</label>
              <Select value={form.from_warehouse_id} onValueChange={(v) => setForm({ ...form, from_warehouse_id: v })}>
                <SelectTrigger><SelectValue placeholder="من" /></SelectTrigger>
                <SelectContent>
                  {(warehouses || []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">إلى المستودع</label>
              <Select value={form.to_warehouse_id} onValueChange={(v) => setForm({ ...form, to_warehouse_id: v })}>
                <SelectTrigger><SelectValue placeholder="إلى" /></SelectTrigger>
                <SelectContent>
                  {(warehouses || []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">الكمية</label>
              <Input
                type="number" inputMode="numeric" min={1}
                value={form.quantity}
                onChange={e => setForm({ ...form, quantity: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-muted-foreground mb-1">ملاحظات</label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="ملاحظات اختيارية" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={saving} className="min-h-[44px] gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "جارٍ التحويل..." : "تحويل"}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }} disabled={saving} className="min-h-[44px]">
              إلغاء
            </Button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-3 border-b border-border flex items-center gap-3">
          <div className="flex items-center bg-muted rounded-lg px-3 py-2 max-w-sm w-full">
            <Search size={16} className="text-muted-foreground ml-2" />
            <input
              type="text" placeholder="بحث بالمنتج..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none outline-none text-sm flex-1 text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm mobile-stack-table">
            <thead>
              <tr className="bg-muted">
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">#</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">المنتج</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">من المستودع</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">إلى المستودع</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الكمية</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">التاريخ</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد تحويلات</td></tr>
              ) : filtered.map((t: any, i: number) => (
                <tr key={t.id} className="border-b border-border hover:bg-muted/50">
                  <td data-label="#" className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                  <td data-label="المنتج" className="px-4 py-3 font-medium text-foreground">{t.product_name}</td>
                  <td data-label="من" className="px-4 py-3 text-muted-foreground">{t.from_warehouse_name}</td>
                  <td data-label="إلى" className="px-4 py-3 text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <ArrowLeftRight size={14} className="text-primary" /> {t.to_warehouse_name}
                    </span>
                  </td>
                  <td data-label="الكمية" className="px-4 py-3 font-semibold text-foreground">{t.quantity}</td>
                  <td data-label="التاريخ" className="px-4 py-3 text-muted-foreground">{t.date}</td>
                  <td data-label="ملاحظات" className="px-4 py-3 text-muted-foreground">{t.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
