import { useState } from "react";
import ZoomControls from "@/components/ZoomControls";
import { Plus, Search, ArrowLeftRight } from "lucide-react";
import { useProductsWithDetails, useWarehouses, useStockTransfers } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

function useStockTransfersWithDetails() {
  return useQuery({
    queryKey: ["stock-transfers-details"],
    queryFn: async () => {
      const [transfersRes, productsRes, warehousesRes] = await Promise.all([
        supabase.from("stock_transfers").select("*").order("created_at", { ascending: false }),
        supabase.from("products").select("id, name"),
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

export default function StockTransferPage() {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ product_id: "", from_warehouse_id: "", to_warehouse_id: "", quantity: "", notes: "" });

  const { data: transfers, isLoading } = useStockTransfersWithDetails();
  const { data: products } = useProductsWithDetails();
  const { data: warehouses } = useWarehouses();
  const { insert } = useStockTransfers();

  const filtered = (transfers || []).filter((t: any) =>
    !search.trim() || t.product_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!form.product_id || !form.from_warehouse_id || !form.to_warehouse_id || !form.quantity) {
      toast.error("جميع الحقول مطلوبة"); return;
    }
    if (form.from_warehouse_id === form.to_warehouse_id) {
      toast.error("لا يمكن التحويل لنفس المستودع"); return;
    }
    try {
      await insert.mutateAsync({
        product_id: form.product_id,
        from_warehouse_id: form.from_warehouse_id,
        to_warehouse_id: form.to_warehouse_id,
        quantity: parseInt(form.quantity),
        notes: form.notes || null,
      });
      toast.success("تم تحويل المخزون");
      setShowForm(false);
      setForm({ product_id: "", from_warehouse_id: "", to_warehouse_id: "", quantity: "", notes: "" });
    } catch (e: any) { toast.error(e.message); }
  };

  const inputClass = "bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary w-full";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">تحويل المخزون</h1>
        <div className="flex items-center gap-2">
          <ZoomControls />
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90">
            <Plus size={16} /> تحويل جديد
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-foreground">تحويل مخزون جديد</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">المنتج</label>
              <select value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })} className={inputClass}>
                <option value="">-- اختر المنتج --</option>
                {(products || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">من المستودع</label>
              <select value={form.from_warehouse_id} onChange={e => setForm({ ...form, from_warehouse_id: e.target.value })} className={inputClass}>
                <option value="">-- من --</option>
                {(warehouses || []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">إلى المستودع</label>
              <select value={form.to_warehouse_id} onChange={e => setForm({ ...form, to_warehouse_id: e.target.value })} className={inputClass}>
                <option value="">-- إلى --</option>
                {(warehouses || []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">الكمية</label>
              <input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className={inputClass} placeholder="0" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-muted-foreground mb-1">ملاحظات</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputClass} placeholder="ملاحظات اختيارية" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90">تحويل</button>
            <button onClick={() => setShowForm(false)} className="bg-muted text-muted-foreground px-6 py-2 rounded-lg text-sm">إلغاء</button>
          </div>
        </div>
      )}

      <div className="legacy-card card-block">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="flex items-center bg-muted rounded-lg px-3 py-2 max-w-sm w-full">
            <Search size={16} className="text-muted-foreground ml-2" />
            <input type="text" placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-transparent border-none outline-none text-sm flex-1 text-foreground placeholder:text-muted-foreground" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">#</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">المنتج</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">من المستودع</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">إلى المستودع</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الكمية</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">التاريخ</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد تحويلات</td></tr>
              ) : filtered.map((t: any, i: number) => (
                <tr key={t.id} className="border-b border-border hover:bg-muted/50">
                  <td className="px-5 py-3 text-muted-foreground">{i + 1}</td>
                  <td className="px-5 py-3 font-medium text-foreground">{t.product_name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{t.from_warehouse_name}</td>
                  <td className="px-5 py-3 text-muted-foreground flex items-center gap-1"><ArrowLeftRight size={14} className="text-primary" /> {t.to_warehouse_name}</td>
                  <td className="px-5 py-3 font-semibold text-foreground">{t.quantity}</td>
                  <td className="px-5 py-3 text-muted-foreground">{t.date}</td>
                  <td className="px-5 py-3 text-muted-foreground">{t.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
