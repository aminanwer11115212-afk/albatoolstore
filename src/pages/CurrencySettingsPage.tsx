import { useState } from "react";
import { toast } from "sonner";

interface Currency { id: string; code: string; name: string; symbol: string; rate: number; }

const defaults: Currency[] = [
  { id: "1", code: "SAR", name: "ريال سعودي", symbol: "ر.س", rate: 1 },
  { id: "2", code: "USD", name: "دولار أمريكي", symbol: "$", rate: 3.75 },
  { id: "3", code: "EUR", name: "يورو", symbol: "€", rate: 4.1 },
  { id: "4", code: "AED", name: "درهم إماراتي", symbol: "د.إ", rate: 1.02 },
  { id: "5", code: "KWD", name: "دينار كويتي", symbol: "د.ك", rate: 12.2 },
];

export default function CurrencySettingsPage() {
  const [list, setList] = useState<Currency[]>(defaults);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", symbol: "", rate: "" });

  const add = () => {
    if (!form.code || !form.name) return toast.error("أكمل البيانات");
    setList((p) => [...p, { ...form, id: Date.now().toString(), rate: parseFloat(form.rate) || 1 }]);
    setForm({ code: "", name: "", symbol: "", rate: "" });
    setShowAdd(false);
    toast.success("تمت الإضافة");
  };

  const del = (id: string) => { setList((p) => p.filter((c) => c.id !== id)); toast.success("تم الحذف"); };

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>إدارة العملات</h5>
        <hr />
        <div style={{ marginBottom: "1rem" }}>
          <button onClick={() => setShowAdd(!showAdd)} className="legacy-btn legacy-btn-success">+ إضافة عملة</button>{" "}
          <button onClick={() => toast.info("جاري التحديث...")} className="legacy-btn legacy-btn-info">تحديث الأسعار</button>
        </div>

        {showAdd && (
          <div className="legacy-form-horizontal" style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid hsl(var(--border))" }}>
            <div className="legacy-form-row"><label className="legacy-form-label">رمز العملة</label><div className="legacy-form-control-wrap"><input className="legacy-control" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="USD" /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label">الاسم</label><div className="legacy-form-control-wrap"><input className="legacy-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="دولار" /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label">الرمز</label><div className="legacy-form-control-wrap"><input className="legacy-control" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="$" /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label">سعر الصرف</label><div className="legacy-form-control-wrap"><input type="number" className="legacy-control" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label"></label><div className="legacy-form-control-wrap"><button onClick={add} className="legacy-btn legacy-btn-success">حفظ</button></div></div>
          </div>
        )}

        <table className="legacy-table">
          <thead><tr><th>رمز العملة</th><th>الاسم</th><th>الرمز</th><th>سعر الصرف</th><th>إعدادات</th></tr></thead>
          <tbody>
            {list.map((c, i) => (
              <tr key={c.id} className={i % 2 === 0 ? "odd" : "even"}>
                <td><b>{c.code}</b></td>
                <td>{c.name}</td>
                <td>{c.symbol}</td>
                <td>{c.rate}</td>
                <td>{c.code !== "SAR" && <button onClick={() => del(c.id)} className="btn-xs btn-danger">حذف</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
