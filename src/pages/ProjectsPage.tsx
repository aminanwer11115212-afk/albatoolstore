import { useState } from "react";
import { Plus, Edit, Trash2, Eye, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useProjects, useCustomers } from "@/hooks/useData";
import { toast } from "sonner";

const statusMap: Record<string, string> = { active: "نشط", completed: "مكتمل", on_hold: "معلق", cancelled: "ملغي" };
const statusColors: Record<string, string> = { active: "bg-success/10 text-success", completed: "bg-primary/10 text-primary", on_hold: "bg-warning/10 text-warning", cancelled: "bg-destructive/10 text-destructive" };
const priorityMap: Record<string, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة" };

export default function ProjectsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [form, setForm] = useState({ name: "", customer_id: "", description: "", budget: "", status: "active", start_date: "", end_date: "", progress: "0", priority: "medium", tag: "" });
  const { data: projects, isLoading, insert, update, remove } = useProjects();
  const { data: customers } = useCustomers();

  const filtered = (projects || []).filter((p: any) => !search || p.name?.includes(search) || p.description?.includes(search));
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const handleSubmit = async () => {
    if (!form.name) { toast.error("اسم المشروع مطلوب"); return; }
    try {
      const payload = { ...form, customer_id: form.customer_id || null, budget: parseFloat(form.budget) || 0, start_date: form.start_date || null, end_date: form.end_date || null, progress: parseInt(form.progress) || 0, priority: form.priority || null, tag: form.tag || null };
      if (editId) { await update.mutateAsync({ id: editId, ...payload }); toast.success("تم التحديث"); }
      else { await insert.mutateAsync(payload); toast.success("تم الإضافة"); }
      setShowForm(false); setEditId(null);
      setForm({ name: "", customer_id: "", description: "", budget: "", status: "active", start_date: "", end_date: "", progress: "0", priority: "medium", tag: "" });
    } catch (e: any) { toast.error(e.message); }
  };

  const inputCls = "bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary w-full";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">إدارة المشاريع</h1>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm({ name: "", customer_id: "", description: "", budget: "", status: "active", start_date: "", end_date: "", progress: "0", priority: "medium", tag: "" }); }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90"><Plus size={16} /> مشروع جديد</button>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-foreground">{editId ? "تعديل المشروع" : "إضافة مشروع جديد"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <input placeholder="اسم المشروع *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
            <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} className={inputCls}>
              <option value="">-- العميل --</option>
              {(customers || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="number" placeholder="الميزانية" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} className={inputCls} />
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>
              <option value="active">نشط</option><option value="on_hold">معلق</option><option value="completed">مكتمل</option><option value="cancelled">ملغي</option>
            </select>
            <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className={inputCls}>
              <option value="high">عالية</option><option value="medium">متوسطة</option><option value="low">منخفضة</option>
            </select>
            <input type="number" min="0" max="100" placeholder="التقدم %" value={form.progress} onChange={e => setForm({ ...form, progress: e.target.value })} className={inputCls} />
            <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className={inputCls} />
            <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className={inputCls} />
            <input placeholder="وسم" value={form.tag} onChange={e => setForm({ ...form, tag: e.target.value })} className={inputCls} />
            <input placeholder="وصف" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={`${inputCls} col-span-full`} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90">{editId ? "تحديث" : "إضافة"}</button>
            <button onClick={() => setShowForm(false)} className="bg-muted text-muted-foreground px-6 py-2 rounded-lg text-sm">إلغاء</button>
          </div>
        </div>
      )}

      <div className="legacy-card card-block">
        <div className="p-4 border-b border-border flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">عرض</span>
            <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }} className="bg-muted border border-border rounded px-2 py-1 text-sm text-foreground">
              <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option>
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
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">المشروع</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">العميل</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الحالة</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الأولوية</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">التقدم</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الميزانية</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">إعدادات</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
              : paginated.length === 0 ? <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">لا توجد مشاريع</td></tr>
              : paginated.map((p: any, i: number) => {
                const customer = (customers || []).find((c: any) => c.id === p.customer_id);
                return (
                  <tr key={p.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{(page-1)*perPage + i + 1}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                    <td className="px-4 py-3 text-foreground">{customer?.name || "-"}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[p.status] || ""}`}>{statusMap[p.status] || p.status}</span></td>
                    <td className="px-4 py-3 text-foreground">{priorityMap[p.priority] || p.priority || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${p.progress || 0}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{p.progress || 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">{Number(p.budget || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditId(p.id); setForm({ name: p.name, customer_id: p.customer_id || "", description: p.description || "", budget: String(p.budget || ""), status: p.status, start_date: p.start_date || "", end_date: p.end_date || "", progress: String(p.progress || 0), priority: p.priority || "medium", tag: p.tag || "" }); setShowForm(true); }}
                          className="px-2 py-1 bg-primary/10 text-primary rounded text-xs hover:bg-primary/20 flex items-center gap-1"><Edit size={12} /> تعديل</button>
                        <button onClick={async () => { if (!confirm("حذف؟")) return; try { await remove.mutateAsync(p.id); toast.success("تم"); } catch (e: any) { toast.error(e.message); } }}
                          className="px-2 py-1 bg-destructive/10 text-destructive rounded text-xs hover:bg-destructive/20"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
