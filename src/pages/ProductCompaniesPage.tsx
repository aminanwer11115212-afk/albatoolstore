import { useState } from "react";
import { Plus, Edit, Trash2, Building2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ZoomControls from "@/components/ZoomControls";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";

function useProductCompanies() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["product_companies"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("product_companies").select("*").order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const insert = useMutation({
    mutationFn: async (row: any) => {
      const { data, error } = await (supabase as any).from("product_companies").insert(row).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["product_companies"] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...row }: any) => {
      const { data, error } = await (supabase as any).from("product_companies").update(row).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["product_companies"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("product_companies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["product_companies"] }),
  });

  return { ...query, insert, update, remove };
}

function useProductCompanyStats() {
  return useQuery({
    queryKey: ["product_company_stats"],
    queryFn: async () => {
      const { data: products, error } = await supabase.from("products").select("company_id, stock_quantity, sale_price");
      if (error) throw error;
      const stats: Record<string, { totalProducts: number; stockQty: number; stockValue: number }> = {};
      (products || []).forEach((p: any) => {
        const cid = p.company_id || "none";
        if (!stats[cid]) stats[cid] = { totalProducts: 0, stockQty: 0, stockValue: 0 };
        stats[cid].totalProducts++;
        stats[cid].stockQty += Number(p.stock_quantity || 0);
        stats[cid].stockValue += Number(p.stock_quantity || 0) * Number(p.sale_price || 0);
      });
      return stats;
    },
  });
}

export default function ProductCompaniesPage() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });

  const { data: companies, isLoading } = useProductCompanies();
  const { insert, update, remove } = useProductCompanies();
  const { data: stats } = useProductCompanyStats();

  const filtered = (companies || []).filter((c: any) =>
    !search.trim() || c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!form.name) { toast.error("اسم الماركة مطلوب"); return; }
    try {
      if (editId) { await update.mutateAsync({ id: editId, ...form }); toast.success("تم التحديث"); }
      else { await insert.mutateAsync(form); toast.success("تم الإضافة"); }
      setShowForm(false); setEditId(null); setForm({ name: "", description: "" });
    } catch (e: any) { toast.error(e.message); }
  };

  const inputClass = "bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary w-full";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">شركات المنتجات</h1>
        <div className="flex items-center gap-2">
          <ZoomControls />
          <button onClick={() => { setShowForm(true); setEditId(null); setForm({ name: "", description: "" }); }}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90">
            <Plus size={16} /> ماركة جديدة
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-foreground">{editId ? "تعديل الماركة" : "إضافة ماركة جديدة"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input placeholder="اسم الماركة *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <input placeholder="الوصف" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputClass} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90">{editId ? "تحديث" : "إضافة"}</button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="bg-muted text-muted-foreground px-6 py-2 rounded-lg text-sm">إلغاء</button>
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
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الاسم</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">إجمالي المنتجات</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">كمية المخزون</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">قيمة (المبيعات / المخزون)</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الاعدادات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد شركات</td></tr>
              ) : filtered.map((c: any, i: number) => {
                const s = stats?.[c.id] || { totalProducts: 0, stockQty: 0, stockValue: 0 };
                return (
                  <tr key={c.id} className="border-b border-border hover:bg-muted/50">
                    <td className="px-5 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-foreground flex items-center gap-2">
                      <Building2 size={16} className="text-primary" /> {c.name}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{s.totalProducts}</td>
                    <td className="px-5 py-3 text-muted-foreground">{s.stockQty}</td>
                    <td className="px-5 py-3 text-muted-foreground">{s.stockValue.toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditId(c.id); setForm({ name: c.name, description: c.description || "" }); setShowForm(true); }} className="p-1.5 text-yellow-500 hover:bg-yellow-500/10 rounded"><Edit size={15} /></button>
                        <button onClick={async () => { if (!confirm("حذف الماركة؟")) return; try { await remove.mutateAsync(c.id); toast.success("تم الحذف"); } catch (e: any) { toast.error(e.message); } }} className="p-1.5 text-destructive hover:bg-destructive/10 rounded"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
