import { useState } from "react";
import { toast } from "sonner";
import HomeButton from "@/components/HomeButton";

interface CalendarEvent { id: string; title: string; date: string; color: string; }
const COLORS = ["#e67e22", "#27ae60", "#2980b9", "#8e44ad", "#e74c3c", "#1abc9c"];

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const dayNames = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

  const dateStr = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const eventsFor = (day: number) => events.filter((e) => e.date === dateStr(day));

  const add = () => {
    if (!newTitle.trim() || !selectedDate) return toast.error("أكمل الحقول");
    setEvents((p) => [...p, { id: crypto.randomUUID(), title: newTitle, date: selectedDate, color: selectedColor }]);
    setNewTitle(""); setSelectedDate(""); setShowForm(false);
    toast.success("تمت الإضافة");
  };

  const today = new Date();
  const isToday = (d: number) => today.getDate() === d && today.getMonth() === month && today.getFullYear() === year;

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <HomeButton />
        <h5>التقويم — {monthNames[month]} {year}</h5>
        <hr />
        <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="legacy-btn legacy-btn-default">‹ السابق</button>{" "}
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="legacy-btn legacy-btn-default">التالي ›</button>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="legacy-btn legacy-btn-success">+ حدث جديد</button>
        </div>

        {showForm && (
          <div className="legacy-form-horizontal" style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid hsl(var(--border))" }}>
            <div className="legacy-form-row"><label className="legacy-form-label">العنوان</label><div className="legacy-form-control-wrap"><input className="legacy-control" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label">التاريخ</label><div className="legacy-form-control-wrap"><input type="date" className="legacy-control" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} /></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label">اللون</label><div className="legacy-form-control-wrap"><div style={{ display: "flex", gap: 8 }}>{COLORS.map((c) => <button key={c} onClick={() => setSelectedColor(c)} style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: selectedColor === c ? "2px solid hsl(var(--foreground))" : "2px solid transparent", cursor: "pointer" }} />)}</div></div></div>
            <div className="legacy-form-row"><label className="legacy-form-label"></label><div className="legacy-form-control-wrap"><button onClick={add} className="legacy-btn legacy-btn-success">حفظ</button></div></div>
          </div>
        )}

        <table className="legacy-table" style={{ tableLayout: "fixed" }}>
          <thead><tr>{dayNames.map((d) => <th key={d} style={{ textAlign: "center" }}>{d}</th>)}</tr></thead>
          <tbody>
            {Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) }).map((_, w) => (
              <tr key={w}>
                {Array.from({ length: 7 }).map((__, d) => {
                  const dayNum = w * 7 + d - firstDay + 1;
                  if (dayNum < 1 || dayNum > daysInMonth) return <td key={d} style={{ background: "hsl(var(--muted) / 0.3)", height: 70 }} />;
                  const ev = eventsFor(dayNum);
                  return (
                    <td key={d} style={{ verticalAlign: "top", height: 70, background: isToday(dayNum) ? "hsl(var(--primary) / 0.08)" : undefined }}>
                      <div style={{ fontWeight: isToday(dayNum) ? 700 : 400, fontSize: 12 }}>{dayNum}</div>
                      {ev.slice(0, 2).map((e) => (
                        <div key={e.id} style={{ fontSize: 10, color: "#fff", background: e.color, borderRadius: 3, padding: "1px 4px", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</div>
                      ))}
                      {ev.length > 2 && <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>+{ev.length - 2}</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {events.length > 0 && (
          <>
            <h5 style={{ marginTop: "1.5rem" }}>الأحداث</h5>
            <hr />
            <table className="legacy-table">
              <thead><tr><th>اللون</th><th>العنوان</th><th>التاريخ</th><th>إعدادات</th></tr></thead>
              <tbody>
                {events.sort((a, b) => a.date.localeCompare(b.date)).map((e, i) => (
                  <tr key={e.id} className={i % 2 === 0 ? "odd" : "even"}>
                    <td><span style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", background: e.color }} /></td>
                    <td>{e.title}</td>
                    <td>{e.date}</td>
                    <td><button onClick={() => { setEvents((p) => p.filter((x) => x.id !== e.id)); toast.success("تم"); }} className="btn-xs btn-danger">حذف</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </article>
  );
}
