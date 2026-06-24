import { useState } from "react";
import { Search, Plus, Edit, Trash2, Eye, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useSuppliers } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SupplierDetailView from "@/components/SupplierDetailView";
import { startsWithAny } from "@/utils/searchMatch";

const emptyForm = { name: "", phone: "", email: "", address: "", company: "", notes: "", balance: "" };

export default function SuppliersPage() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewSupplier, setViewSupplier] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const { data: suppliers, isLoading, insert, update, remove } = useSuppliers();

  const filtered = (suppliers || []).filter((s: any) =>
    !search.trim() || startsWithAny([s.name, s.phone, s.company, s.email], search),
  );
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const handleSubmit = async () => {
    const name = form.name.trim();
    if (!name) { toast.error("الاسم مطلوب"); return; }
    if (name.length > 100) { toast.error("الاسم طويل جداً"); return; }
    if (form.email && form.email.length > 0 && !/^\S+@\S+\.\S+$/.test(form.email)) {
      toast.error("البريد الإلكتروني غير صالح"); return;
    }
    const payload: any = {
      name,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      company: form.company.trim() || null,
      notes: form.notes.trim() || null,
    };
    // الرصيد يُحسب تلقائياً من أوامر الشراء عبر trigger recompute_supplier_balance.
    // نسمح فقط بإدخال رصيد افتتاحي عند إنشاء مورد جديد، ولا نسمح بتعديله لاحقاً
    // حتى لا يتعارض مع القيمة المُعاد حسابها.
    if (!editId) {
      payload.balance = form.balance === "" ? 0 : Number(form.balance) || 0;
    }
    try {
      if (editId) {
        const updated = await update.mutateAsync({ id: editId, ...payload });
        toast.success("تم التحديث");
        if (viewSupplier && viewSupplier.id === editId) setViewSupplier({ ...viewSupplier, ...payload });
      } else {
        await insert.mutateAsync(payload);
        toast.success("تمت الإضافة");
      }
      setShowForm(false); setEditId(null); setForm(emptyForm);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleEdit = (s: any) => {
    setEditId(s.id);
    setForm({
      name: s.name || "",
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
      company: s.company || "",
      notes: s.notes || "",
      balance: s.balance != null ? String(s.balance) : "",
    });
    setShowForm(true);
    setViewSupplier(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المورد؟")) return;
    try {
      const [purchaseCheck, transactionCheck, productCheck] = await Promise.all([
        supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("supplier_id", id),
        supabase.from("transactions").select("id", { count: "exact", head: true }).eq("supplier_id", id),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("supplier_id", id),
      ]);

      if (
        (purchaseCheck.count ?? 0) > 0 ||
        (transactionCheck.count ?? 0) > 0 ||
        (productCheck.count ?? 0) > 0
      ) {
        toast.error("لا يمكن حذف المورد لأنه مرتبط بحركات أو بضائع في النظام (مشتريات، معاملات مالية، أو منتجات).");
        return;
      }

      await remove.mutateAsync(id);
      toast.success("تم الحذف");
      if (viewSupplier && viewSupplier.id === id) setViewSupplier(null);
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ أثناء محاولة الحذف");
    }
  };

  const inputCls = "bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary w-full";
  const labelCls = "block text-xs font-medium text-muted-foreground mb-1.5";

  // Detail view
  if (viewSupplier) {
    return (
      <SupplierDetailView
        supplier={viewSupplier}
        onBack={() => setViewSupplier(null)}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">الموردين</h1>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm); }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90"><Plus size={16} /> مورد جديد</button>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground text-lg">{editId ? "تعديل المورد" : "إضافة مورد جديد"}</h3>
            <button onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); }} className="text-muted-foreground hover:text-foreground p-1 rounded">
              <X size={18} />
            </button>
          </div>

          {/* Basic info */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3 pb-1 border-b border-border">البيانات الأساسية</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>الاسم <span className="text-destructive">*</span></label>
                <input placeholder="اسم المورد" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} maxLength={100} />
              </div>
              <div>
                <label className={labelCls}>اسم الشركة</label>
                <input placeholder="الشركة" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className={inputCls} maxLength={100} />
              </div>
              <div>
                <label className={labelCls}>
                  {editId ? "الرصيد الحالي (محسوب تلقائياً)" : "الرصيد الافتتاحي"}
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={form.balance}
                  onChange={e => !editId && setForm({ ...form, balance: e.target.value })}
                  className={inputCls}
                  dir="ltr"
                  readOnly={!!editId}
                  disabled={!!editId}
                  title={editId ? "الرصيد يُحسب تلقائياً من أوامر الشراء — لا يُعدّل يدوياً" : "أدخل الرصيد الافتتاحي للمورد"}
                />
              </div>
            </div>
          </div>

          {/* Contact info */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3 pb-1 border-b border-border">معلومات الاتصال</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>الهاتف</label>
                <input placeholder="رقم الهاتف" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} dir="ltr" maxLength={30} />
              </div>
              <div>
                <label className={labelCls}>البريد الإلكتروني</label>
                <input type="email" placeholder="email@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} dir="ltr" maxLength={120} />
              </div>
              <div>
                <label className={labelCls}>العنوان</label>
                <input placeholder="العنوان" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className={inputCls} maxLength={200} />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3 pb-1 border-b border-border">ملاحظات</h4>
            <textarea
              placeholder="ملاحظات إضافية عن المورد..."
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className={`${inputCls} min-h-[80px] resize-y`}
              maxLength={500}
            />
          </div>

          <div className="flex gap-2 pt-2 border-t border-border">
            <button onClick={handleSubmit} disabled={insert.isPending || update.isPending}
              className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60">
              {editId ? "تحديث المورد" : "إضافة المورد"}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); }} className="bg-muted text-muted-foreground px-6 py-2.5 rounded-lg text-sm">إلغاء</button>
          </div>
        </div>
      )}

      <div className="legacy-card card-block">
        <div className="p-4 border-b border-border flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">عرض</span>
            <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }} className="bg-muted border border-border rounded px-2 py-1 text-sm text-foreground">
              <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center bg-muted rounded-lg px-3 py-2">
            <Search size={16} className="text-muted-foreground ml-2" />
            <input type="text" placeholder="بحث..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="bg-transparent border-none outline-none text-sm flex-1 text-foreground placeholder:text-muted-foreground" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted">
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground w-10">#</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الاسم</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الشركة</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الهاتف</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">البريد</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الرصيد</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">إعدادات</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
              : paginated.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا يوجد موردين</td></tr>
              : paginated.map((s: any, i: number) => (
                <tr key={s.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">{(page - 1) * perPage + i + 1}</td>
                  <td className="px-4 py-3 font-medium text-primary cursor-pointer hover:underline" onClick={() => setViewSupplier(s)}>{s.name}</td>
                  <td className="px-4 py-3 text-foreground">{s.company || "-"}</td>
                  <td className="px-4 py-3 text-foreground" dir="ltr">{s.phone || "-"}</td>
                  <td className="px-4 py-3 text-foreground" dir="ltr">{s.email || "-"}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{Number(s.balance || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setViewSupplier(s)} className="px-2 py-1 bg-blue-500/10 text-blue-600 rounded text-xs hover:bg-blue-500/20 flex items-center gap-1"><Eye size={12} /> عرض</button>
                      <button onClick={() => handleEdit(s)} className="px-2 py-1 bg-primary/10 text-primary rounded text-xs hover:bg-primary/20 flex items-center gap-1"><Edit size={12} /> تعديل</button>
                      <button onClick={() => handleDelete(s.id)}
                        className="px-2 py-1 bg-destructive/10 text-destructive rounded text-xs hover:bg-destructive/20"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
          <span>عرض {Math.min((page-1)*perPage+1, filtered.length)} إلى {Math.min(page*perPage, filtered.length)} من {filtered.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-50"><ChevronRight size={16} /></button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)} className={`px-3 py-1 rounded text-xs ${page === p ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{p}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-muted disabled:opacity-50"><ChevronLeft size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
