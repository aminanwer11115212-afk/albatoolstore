import { useState } from "react";
import { toast } from "sonner";

interface Backup { id: string; name: string; date: string; size: string; type: string; }

const mockBackups: Backup[] = [
  { id: "1", name: "نسخة يومية تلقائية", date: "2026-04-12 08:00", size: "12.5 MB", type: "تلقائي" },
  { id: "2", name: "نسخة أسبوعية", date: "2026-04-07 00:00", size: "12.3 MB", type: "تلقائي" },
  { id: "3", name: "نسخة يدوية - قبل التحديث", date: "2026-04-05 14:30", size: "12.1 MB", type: "يدوي" },
];

export default function BackupPage() {
  const [backups] = useState<Backup[]>(mockBackups);
  const [creating, setCreating] = useState(false);

  const create = () => {
    setCreating(true);
    setTimeout(() => { setCreating(false); toast.success("تم إنشاء النسخة الاحتياطية"); }, 1500);
  };

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>النسخ الاحتياطي</h5>
        <hr />
        <div style={{ marginBottom: "1rem" }}>
          <button onClick={create} disabled={creating} className="legacy-btn legacy-btn-primary">
            {creating ? "جاري الإنشاء..." : "+ إنشاء نسخة احتياطية"}
          </button>
        </div>
        <table className="legacy-table">
          <thead><tr><th>الاسم</th><th>التاريخ</th><th>الحجم</th><th>النوع</th><th>إعدادات</th></tr></thead>
          <tbody>
            {backups.map((b, i) => (
              <tr key={b.id} className={i % 2 === 0 ? "odd" : "even"}>
                <td>{b.name}</td>
                <td dir="ltr">{b.date}</td>
                <td>{b.size}</td>
                <td><span className={b.type === "تلقائي" ? "st-pending" : "st-paid"}>{b.type}</span></td>
                <td>
                  <span className="legacy-actions">
                    <button onClick={() => toast.info("جاري التحميل...")} className="btn-xs btn-info">تحميل</button>
                    <button onClick={() => toast.info("جاري الاستعادة...")} className="btn-xs btn-warning">استعادة</button>
                    <button onClick={() => toast.success("تم الحذف")} className="btn-xs btn-danger">حذف</button>
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
