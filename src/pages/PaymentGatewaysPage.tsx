import { useState } from "react";
import { toast } from "sonner";

const gateways = [
  { id: "stripe", name: "Stripe", description: "بوابة دفع عالمية" },
  { id: "paypal", name: "PayPal", description: "خدمة دفع إلكتروني عالمية" },
  { id: "tap", name: "Tap Payments", description: "بوابة دفع للشرق الأوسط" },
  { id: "moyasar", name: "Moyasar", description: "بوابة سعودية تدعم مدى و Apple Pay" },
  { id: "hyperpay", name: "HyperPay", description: "بوابة دفع للمنطقة العربية" },
  { id: "cash", name: "الدفع النقدي", description: "الدفع عند الاستلام نقداً" },
];

export default function PaymentGatewaysPage() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ cash: true });
  const [editing, setEditing] = useState<string | null>(null);

  const toggle = (id: string) => {
    setEnabled((p) => ({ ...p, [id]: !p[id] }));
    toast.success(`تم ${enabled[id] ? "تعطيل" : "تفعيل"} البوابة`);
  };

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>بوابات الدفع</h5>
        <hr />
        <table className="legacy-table">
          <thead><tr><th>البوابة</th><th>الوصف</th><th>الحالة</th><th>إعدادات</th></tr></thead>
          <tbody>
            {gateways.map((gw, i) => (
              <tr key={gw.id} className={i % 2 === 0 ? "odd" : "even"}>
                <td><b>{gw.name}</b></td>
                <td>{gw.description}</td>
                <td><span className={enabled[gw.id] ? "st-paid" : "st-canceled"}>{enabled[gw.id] ? "مفعّلة" : "معطّلة"}</span></td>
                <td>
                  <span className="legacy-actions">
                    <button onClick={() => toggle(gw.id)} className={`btn-xs ${enabled[gw.id] ? "btn-warning" : "btn-success"}`}>{enabled[gw.id] ? "تعطيل" : "تفعيل"}</button>
                    {gw.id !== "cash" && <button onClick={() => setEditing(editing === gw.id ? null : gw.id)} className="btn-xs btn-info">إعدادات</button>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {editing && editing !== "cash" && (
          <div className="legacy-form-horizontal" style={{ marginTop: "1rem" }}>
            <h5>إعدادات {gateways.find((g) => g.id === editing)?.name}</h5>
            <hr />
            <div className="legacy-form-row"><label className="legacy-form-label">API Key</label><div className="legacy-form-control-wrap"><input className="legacy-control" placeholder="API Key" /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label">Secret Key</label><div className="legacy-form-control-wrap"><input type="password" className="legacy-control" placeholder="Secret Key" /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label"></label><div className="legacy-form-control-wrap"><button onClick={() => { toast.success("تم الحفظ"); setEditing(null); }} className="legacy-btn legacy-btn-success">حفظ</button></div></div>
          </div>
        )}
      </div>
    </article>
  );
}
