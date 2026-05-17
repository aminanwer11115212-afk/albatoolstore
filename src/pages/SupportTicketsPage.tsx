import { useState } from "react";
import { toast } from "sonner";

interface Ticket { id: string; subject: string; message: string; priority: string; status: string; createdAt: string; }

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("medium");

  const submit = () => {
    if (!subject.trim() || !message.trim()) return toast.error("أكمل الحقول");
    setTickets((p) => [{ id: crypto.randomUUID(), subject, message, priority, status: "open", createdAt: new Date().toLocaleDateString("ar-SD") }, ...p]);
    setSubject(""); setMessage(""); setPriority("medium"); setShowForm(false);
    toast.success("تم الإرسال");
  };

  const pCls: Record<string, string> = { low: "st-paid", medium: "st-pending", high: "st-due" };
  const pLabel: Record<string, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية" };
  const sLabel: Record<string, string> = { open: "مفتوحة", in_progress: "قيد المعالجة", closed: "مغلقة" };
  const sCls: Record<string, string> = { open: "st-pending", in_progress: "st-sent", closed: "st-paid" };

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>تذاكر الدعم الفني</h5>
        <hr />
        <div style={{ marginBottom: "1rem" }}>
          <button onClick={() => setShowForm(!showForm)} className="legacy-btn legacy-btn-success">+ تذكرة جديدة</button>
        </div>

        {showForm && (
          <div className="legacy-form-horizontal" style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid hsl(var(--border))" }}>
            <div className="legacy-form-row"><label className="legacy-form-label">الموضوع</label><div className="legacy-form-control-wrap"><input className="legacy-control" value={subject} onChange={(e) => setSubject(e.target.value)} /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label">الرسالة</label><div className="legacy-form-control-wrap"><textarea className="legacy-control" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label">الأولوية</label><div className="legacy-form-control-wrap"><select className="legacy-control" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">منخفضة</option><option value="medium">متوسطة</option><option value="high">عالية</option></select></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label"></label><div className="legacy-form-control-wrap"><button onClick={submit} className="legacy-btn legacy-btn-success">إرسال</button></div></div>
          </div>
        )}

        <table className="legacy-table">
          <thead><tr><th>#</th><th>الموضوع</th><th>الرسالة</th><th>الأولوية</th><th>الحالة</th><th>التاريخ</th></tr></thead>
          <tbody>
            {tickets.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center" }}>لا توجد تذاكر</td></tr>
            : tickets.map((t, i) => (
              <tr key={t.id} className={i % 2 === 0 ? "odd" : "even"}>
                <td>{i + 1}</td>
                <td>{t.subject}</td>
                <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>{t.message}</td>
                <td><span className={pCls[t.priority]}>{pLabel[t.priority]}</span></td>
                <td><span className={sCls[t.status]}>{sLabel[t.status]}</span></td>
                <td>{t.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
