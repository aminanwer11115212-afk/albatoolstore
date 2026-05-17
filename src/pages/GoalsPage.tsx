import { useState } from "react";
import { toast } from "sonner";
import { useGoals } from "@/hooks/useData";

export default function GoalsPage() {
  const { data: goals, isLoading, insert, update, remove } = useGoals();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ period: "monthly", target_revenue: "", target_expenses: "", target_sales: "", target_net_income: "", start_date: "", end_date: "", notes: "" });

  const submit = async () => {
    try {
      const payload = { ...form, target_revenue: Number(form.target_revenue) || 0, target_expenses: Number(form.target_expenses) || 0, target_sales: Number(form.target_sales) || 0, target_net_income: Number(form.target_net_income) || 0 };
      if (editId) { await update.mutateAsync({ id: editId, ...payload }); toast.success("تم التحديث"); }
      else { await insert.mutateAsync(payload); toast.success("تم إضافة الهدف"); }
      setShowForm(false); setEditId(null);
      setForm({ period: "monthly", target_revenue: "", target_expenses: "", target_sales: "", target_net_income: "", start_date: "", end_date: "", notes: "" });
    } catch (e: any) { toast.error(e.message); }
  };

  const periodLabels: Record<string, string> = { monthly: "شهري", quarterly: "ربع سنوي", yearly: "سنوي" };

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>حدد الأهداف</h5>
        <hr />
        <div style={{ marginBottom: "1rem" }}>
          <button onClick={() => { setShowForm(!showForm); setEditId(null); }} className="legacy-btn legacy-btn-success">+ هدف جديد</button>
        </div>

        {showForm && (
          <div className="legacy-form-horizontal" style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid hsl(var(--border))" }}>
            <div className="legacy-form-row">
              <label className="legacy-form-label">الفترة</label>
              <div className="legacy-form-control-wrap"><select className="legacy-control" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}><option value="monthly">شهري</option><option value="quarterly">ربع سنوي</option><option value="yearly">سنوي</option></select></div>
            </div>
            <div className="legacy-form-row"><label className="legacy-form-label">الإيرادات المستهدفة</label><div className="legacy-form-control-wrap"><input type="number" className="legacy-control" value={form.target_revenue} onChange={(e) => setForm({ ...form, target_revenue: e.target.value })} /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label">المصروفات المستهدفة</label><div className="legacy-form-control-wrap"><input type="number" className="legacy-control" value={form.target_expenses} onChange={(e) => setForm({ ...form, target_expenses: e.target.value })} /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label">المبيعات المستهدفة</label><div className="legacy-form-control-wrap"><input type="number" className="legacy-control" value={form.target_sales} onChange={(e) => setForm({ ...form, target_sales: e.target.value })} /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label">صافي الإيرادات</label><div className="legacy-form-control-wrap"><input type="number" className="legacy-control" value={form.target_net_income} onChange={(e) => setForm({ ...form, target_net_income: e.target.value })} /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label">تاريخ البداية</label><div className="legacy-form-control-wrap"><input type="date" className="legacy-control" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label">تاريخ النهاية</label><div className="legacy-form-control-wrap"><input type="date" className="legacy-control" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label">ملاحظات</label><div className="legacy-form-control-wrap"><input className="legacy-control" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div></div>
            <div className="legacy-form-row">
              <label className="legacy-form-label"></label>
              <div className="legacy-form-control-wrap">
                <button onClick={submit} className="legacy-btn legacy-btn-success">{editId ? "تحديث" : "حفظ"}</button>{" "}
                <button onClick={() => setShowForm(false)} className="legacy-btn legacy-btn-default">إلغاء</button>
              </div>
            </div>
          </div>
        )}

        <table className="legacy-table">
          <thead><tr><th>الفترة</th><th>الإيرادات</th><th>المصروفات</th><th>المبيعات</th><th>صافي الإيرادات</th><th>إعدادات</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} style={{ textAlign: "center" }}>جاري التحميل...</td></tr>
            : !(goals || []).length ? <tr><td colSpan={6} style={{ textAlign: "center" }}>لا توجد أهداف</td></tr>
            : (goals || []).map((g: any, i: number) => (
              <tr key={g.id} className={i % 2 === 0 ? "odd" : "even"}>
                <td>{periodLabels[g.period] || g.period}</td>
                <td>{Number(g.target_revenue).toLocaleString()}</td>
                <td>{Number(g.target_expenses).toLocaleString()}</td>
                <td>{Number(g.target_sales).toLocaleString()}</td>
                <td>{Number(g.target_net_income).toLocaleString()}</td>
                <td>
                  <span className="legacy-actions">
                    <button onClick={() => { setEditId(g.id); setForm({ period: g.period, target_revenue: g.target_revenue, target_expenses: g.target_expenses, target_sales: g.target_sales, target_net_income: g.target_net_income, start_date: g.start_date || "", end_date: g.end_date || "", notes: g.notes || "" }); setShowForm(true); }} className="btn-xs btn-warning">تعديل</button>
                    <button onClick={async () => { if (!confirm("حذف؟")) return; try { await remove.mutateAsync(g.id); toast.success("تم"); } catch (e: any) { toast.error(e.message); } }} className="btn-xs btn-danger">حذف</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
