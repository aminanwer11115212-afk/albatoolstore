import { useState } from "react";
import { toast } from "sonner";
import { useTodos } from "@/hooks/useData";
export default function TodoPage() {
  const { data: todos, isLoading, insert, update, remove } = useTodos();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");

  const handleAdd = async () => {
    if (!title.trim()) { toast.error("العنوان مطلوب"); return; }
    try {
      await insert.mutateAsync({ title, description, priority, status: "pending" });
      setTitle(""); setDescription(""); setPriority("medium");
      toast.success("تم إضافة المهمة");
    } catch (e: any) { toast.error(e.message); }
  };

  const toggle = async (todo: any) => {
    const newStatus = todo.status === "completed" ? "pending" : "completed";
    try { await update.mutateAsync({ id: todo.id, status: newStatus, completed_at: newStatus === "completed" ? new Date().toISOString() : null }); }
    catch (e: any) { toast.error(e.message); }
  };

  const priorityLabels: Record<string, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
  const priorityCls: Record<string, string> = { high: "st-due", medium: "st-pending", low: "st-paid" };

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>قائمة المهام</h5>
        <hr />
        <div className="legacy-form-horizontal">
          <div className="legacy-form-row">
            <label className="legacy-form-label">العنوان</label>
            <div className="legacy-form-control-wrap"><input className="legacy-control" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          </div>
          <div className="legacy-form-row">
            <label className="legacy-form-label">الوصف</label>
            <div className="legacy-form-control-wrap"><input className="legacy-control" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          </div>
          <div className="legacy-form-row">
            <label className="legacy-form-label">الأولوية</label>
            <div className="legacy-form-control-wrap">
              <select className="legacy-control" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="high">عالية</option><option value="medium">متوسطة</option><option value="low">منخفضة</option>
              </select>
            </div>
          </div>
          <div className="legacy-form-row">
            <label className="legacy-form-label"></label>
            <div className="legacy-form-control-wrap"><button onClick={handleAdd} className="legacy-btn legacy-btn-success">+ إضافة</button></div>
          </div>
        </div>
      </div>

      <div className="legacy-card card-block" style={{ marginTop: "1rem" }}>
        <h5>المهام</h5>
        <hr />
        <table className="legacy-table">
          <thead><tr><th>الحالة</th><th>العنوان</th><th>الوصف</th><th>الأولوية</th><th>إعدادات</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={5} style={{ textAlign: "center" }}>جاري التحميل...</td></tr>
            : !(todos || []).length ? <tr><td colSpan={5} style={{ textAlign: "center" }}>لا توجد مهام</td></tr>
            : (todos || []).map((todo: any, i: number) => (
              <tr key={todo.id} className={i % 2 === 0 ? "odd" : "even"}>
                <td><input type="checkbox" checked={todo.status === "completed"} onChange={() => toggle(todo)} /></td>
                <td style={{ textDecoration: todo.status === "completed" ? "line-through" : "none" }}>{todo.title}</td>
                <td>{todo.description || "—"}</td>
                <td><span className={priorityCls[todo.priority] || "st-pending"}>{priorityLabels[todo.priority] || todo.priority}</span></td>
                <td>
                  <button onClick={async () => { if (!confirm("حذف؟")) return; try { await remove.mutateAsync(todo.id); toast.success("تم"); } catch (e: any) { toast.error(e.message); } }}
                    className="btn-xs btn-danger">حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
