import { useRef, useState } from "react";
import { Plus, Edit, Trash2, Eye, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useAccounts } from "@/hooks/useData";
import { toast } from "sonner";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";
import HomeButton from "@/components/HomeButton";

export default function AccountsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", account_number: "", account_type: "bank", bank_name: "", description: "" });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const { data: accounts, isLoading, insert, update, remove } = useAccounts();

  const filtered = (accounts || []).filter((a: any) => !search || startsWithAny([a.name, a.account_number], search));
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const typeMap: Record<string, string> = { bank: "بنكي", cash: "نقدي", mobile: "محفظة إلكترونية" };

  const handleSubmit = async () => {
    if (savingRef.current) return;
    if (!form.name.trim()) { toast.error("اسم الحساب مطلوب"); return; }
    if (form.account_type === "bank" && !form.bank_name.trim()) { toast.error("اسم البنك مطلوب للحساب البنكي"); return; }
    savingRef.current = true; setSaving(true);
    try {
      if (editId) { await update.mutateAsync({ id: editId, ...form }); toast.success("تم التحديث"); }
      else { await insert.mutateAsync(form); toast.success("تم الإضافة"); }
      setShowForm(false); setEditId(null);
      setForm({ name: "", account_number: "", account_type: "bank", bank_name: "", description: "" });
    } catch (e: any) { toast.error(e.message); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const inputCls = "bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary w-full";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">إدارة الحسابات</h1>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm({ name: "", account_number: "", account_type: "bank", bank_name: "", description: "" }); }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90"><Plus size={16} /> حساب جديد</button>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-foreground">{editId ? "تعديل" : "إضافة حساب"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })} className={inputCls}>
              <option value="bank">بنكي</option>
              <option value="cash">نقدي</option>
              <option value="mobile">محفظة إلكترونية</option>
            </select>
            {form.account_type === "bank" && (
              <input placeholder="اسم البنك (مثال: بنك الخرطوم)" value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} className={inputCls} />
            )}
            <input placeholder="اسم الحساب *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
            <input placeholder="رقم الحساب" value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} className={inputCls} />
            <input placeholder="وصف" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={saving} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed">{saving ? "جارٍ الحفظ..." : (editId ? "تحديث" : "إضافة")}</button>
            <button onClick={() => setShowForm(false)} disabled={saving} className="bg-muted text-muted-foreground px-6 py-2 rounded-lg text-sm">إلغاء</button>
          </div>
        </div>
      )}

      <div className="legacy-card card-block">
        <HomeButton />
        <div className="p-4 border-b border-border flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">عرض</span>
            <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }} className="bg-muted border border-border rounded px-2 py-1 text-sm text-foreground">
              <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option>
            </select>
          </div>
          <div className="flex items-center bg-muted rounded-lg px-3 py-2">
            <Search size={16} className="text-muted-foreground ml-2" />
            <input type="text" placeholder="بحث..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="bg-transparent border-none outline-none text-sm flex-1 text-foreground placeholder:text-muted-foreground" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm mobile-stack-table">
            <thead><tr className="bg-muted">
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground w-10">#</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">اسم الحساب</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">رقم الحساب</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">النوع</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الرصيد</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">إعدادات</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
              : paginated.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">لا يوجد حسابات</td></tr>
              : paginated.map((a: any, i: number) => (
                <tr key={a.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td data-label="#" className="px-4 py-3 text-muted-foreground">{(page-1)*perPage + i + 1}</td>
                  <td data-label="اسم الحساب" className="px-4 py-3 font-medium text-foreground">{a.name} {a.is_default && <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs mr-1">افتراضي</span>}</td>
                  <td data-label="رقم الحساب" className="px-4 py-3 text-foreground">{a.account_number || "-"}</td>
                  <td data-label="النوع" className="px-4 py-3 text-foreground">{typeMap[a.account_type] || a.account_type}</td>
                  <td data-label="الرصيد" className="px-4 py-3 font-bold text-foreground">{Number(a.balance || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditId(a.id); setForm({ name: a.name, account_number: a.account_number || "", account_type: a.account_type || "bank", bank_name: a.bank_name || "", description: a.description || "" }); setShowForm(true); }}
                        className="px-2 py-1 bg-primary/10 text-primary rounded text-xs hover:bg-primary/20 flex items-center gap-1"><Edit size={12} /> تعديل</button>
                      {!a.is_default && <button onClick={async () => { if (!confirm("حذف؟")) return; try { await remove.mutateAsync(a.id); toast.success("تم"); } catch (e: any) { toast.error(e.message); } }}
                        className="px-2 py-1 bg-destructive/10 text-destructive rounded text-xs hover:bg-destructive/20"><Trash2 size={12} /></button>}
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
