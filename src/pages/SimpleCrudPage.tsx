import { useState } from "react";
import { toast } from "sonner";

interface CrudPageProps {
  title: string;
  hook: () => any;
  fields: { key: string; label: string; type?: string }[];
  nameKey?: string;
}

export default function SimpleCrudPage({ title, hook, fields, nameKey = "name" }: CrudPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const initialForm = Object.fromEntries(fields.map((f) => [f.key, ""]));
  const [form, setForm] = useState<Record<string, any>>(initialForm);
  const { data, isLoading, insert, update, remove } = hook();

  const submit = async () => {
    if (!form[nameKey]) { toast.error(`${fields.find((f) => f.key === nameKey)?.label || "الاسم"} مطلوب`); return; }
    try {
      if (editId) { await update.mutateAsync({ id: editId, ...form }); toast.success("تم التحديث"); }
      else { await insert.mutateAsync(form); toast.success("تم الإضافة"); }
      setShowForm(false); setEditId(null); setForm(initialForm);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>{title}</h5>
        <hr />
        <div style={{ marginBottom: "1rem" }}>
          <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(initialForm); }} className="legacy-btn legacy-btn-success">+ إضافة جديد</button>
        </div>

        {showForm && (
          <div className="legacy-form-horizontal" style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid hsl(var(--border))" }}>
            {fields.map((f) => (
              <div className="legacy-form-row" key={f.key}>
                <label className="legacy-form-label">{f.label}</label>
                <div className="legacy-form-control-wrap">
                  <input type={f.type || "text"} className="legacy-control" value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                </div>
              </div>
            ))}
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
          <thead><tr>{fields.map((f) => <th key={f.key}>{f.label}</th>)}<th>إعدادات</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={fields.length + 1} style={{ textAlign: "center" }}>جاري التحميل...</td></tr>
            : (data || []).length === 0 ? <tr><td colSpan={fields.length + 1} style={{ textAlign: "center" }}>لا توجد بيانات</td></tr>
            : (data || []).map((row: any, i: number) => (
              <tr key={row.id} className={i % 2 === 0 ? "odd" : "even"}>
                {fields.map((f) => <td key={f.key}>{row[f.key] || "-"}</td>)}
                <td>
                  <span className="legacy-actions">
                    <button onClick={() => { setEditId(row.id); setForm(Object.fromEntries(fields.map((f) => [f.key, row[f.key] || ""]))); setShowForm(true); }} className="btn-xs btn-warning">تعديل</button>
                    <button onClick={async () => { if (!confirm("حذف؟")) return; try { await remove.mutateAsync(row.id); toast.success("تم"); } catch (e: any) { toast.error(e.message); } }} className="btn-xs btn-danger">حذف</button>
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
