import { useState } from "react";
import { toast } from "sonner";

const defaultTemplates = {
  email: {
    invoice: { subject: "فاتورة جديدة - {{invoice_number}}", body: "عزيزي {{customer_name}},\n\nمرفق فاتورة رقم {{invoice_number}} بمبلغ {{total}}." },
    quote: { subject: "عرض سعر - {{quote_number}}", body: "عزيزي {{customer_name}},\n\nمرفق عرض السعر رقم {{quote_number}} بمبلغ {{total}}." },
    reminder: { subject: "تذكير بالدفع - {{invoice_number}}", body: "عزيزي {{customer_name}},\n\nنود تذكيركم بالفاتورة رقم {{invoice_number}}." },
  },
  sms: {
    invoice: "فاتورة جديدة رقم {{invoice_number}} بمبلغ {{total}}",
    reminder: "تذكير: فاتورة رقم {{invoice_number}} مستحقة",
    thankyou: "شكراً لدفعكم. فاتورة {{invoice_number}}",
  },
};

type Type = "email" | "sms";

export default function TemplatesPage({ type = "email" }: { type?: Type }) {
  const [active, setActive] = useState<Type>(type);

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>إدارة القوالب</h5>
        <hr />
        <div style={{ marginBottom: "1rem" }}>
          <button onClick={() => setActive("email")} className={`legacy-btn ${active === "email" ? "legacy-btn-primary" : "legacy-btn-default"}`}>بريد إلكتروني</button>{" "}
          <button onClick={() => setActive("sms")} className={`legacy-btn ${active === "sms" ? "legacy-btn-primary" : "legacy-btn-default"}`}>SMS</button>
        </div>

        {active === "email" && (
          <div className="legacy-form-horizontal">
            {Object.entries(defaultTemplates.email).map(([key, tmpl]) => (
              <div key={key} style={{ marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid hsl(var(--border))" }}>
                <h5>{key === "invoice" ? "قالب الفاتورة" : key === "quote" ? "قالب عرض السعر" : "قالب التذكير"}</h5>
                <div className="legacy-form-row"><label className="legacy-form-label">العنوان</label><div className="legacy-form-control-wrap"><input className="legacy-control" defaultValue={tmpl.subject} /></div></div>
                <div className="legacy-form-row"><label className="legacy-form-label">المحتوى</label><div className="legacy-form-control-wrap"><textarea className="legacy-control" rows={5} defaultValue={tmpl.body} /></div></div>
                <div className="legacy-form-row"><label className="legacy-form-label"></label><div className="legacy-form-control-wrap"><button onClick={() => toast.success("تم الحفظ")} className="legacy-btn legacy-btn-success">حفظ</button></div></div>
              </div>
            ))}
          </div>
        )}

        {active === "sms" && (
          <div className="legacy-form-horizontal">
            {Object.entries(defaultTemplates.sms).map(([key, tmpl]) => (
              <div key={key} style={{ marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid hsl(var(--border))" }}>
                <h5>{key === "invoice" ? "قالب فاتورة SMS" : key === "reminder" ? "قالب تذكير SMS" : "قالب شكر SMS"}</h5>
                <div className="legacy-form-row"><label className="legacy-form-label">المحتوى</label><div className="legacy-form-control-wrap"><textarea className="legacy-control" rows={2} defaultValue={tmpl} /></div></div>
                <div className="legacy-form-row"><label className="legacy-form-label"></label><div className="legacy-form-control-wrap"><button onClick={() => toast.success("تم الحفظ")} className="legacy-btn legacy-btn-success">حفظ</button></div></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
