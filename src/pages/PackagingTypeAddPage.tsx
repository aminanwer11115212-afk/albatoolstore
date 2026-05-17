import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Save } from "lucide-react";
import { toast } from "sonner";
import { usePackagingTypes } from "@/hooks/useData";
import ZoomControls from "@/components/ZoomControls";

export default function PackagingTypeAddPage() {
  const navigate = useNavigate();
  const { insert } = usePackagingTypes();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("الاسم مطلوب"); return; }
    setSaving(true);
    try {
      await insert.mutateAsync({ name: name.trim(), description: description.trim() || null });
      toast.success("تم إضافة نوع التغليف");
      navigate("/packaging");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <div className="grid_3 grid_4">
          <div className="header-block" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <h3 className="title" style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span>إضافة نوع تغليف جديد</span>
              <Link to="/packaging" className="legacy-btn legacy-btn-default btn-sm">
                <ArrowRight /> العودة للقائمة
              </Link>
              <ZoomControls />
            </h3>
          </div>

          <p>&nbsp;</p>

          <form onSubmit={submit} className="legacy-form-horizontal">
            <div className="legacy-form-row">
              <label className="legacy-form-label">
                اسم النوع <span style={{ color: "hsl(var(--destructive))" }}>*</span>
              </label>
              <div className="legacy-form-control-wrap">
                <input
                  type="text"
                  className="legacy-control"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: كرتون كبير"
                  autoFocus
                />
              </div>
            </div>

            <div className="legacy-form-row">
              <label className="legacy-form-label">الوصف</label>
              <div className="legacy-form-control-wrap">
                <textarea
                  className="legacy-control"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="وصف اختياري لنوع التغليف"
                />
              </div>
            </div>

            <div className="legacy-form-row">
              <label className="legacy-form-label"></label>
              <div className="legacy-form-control-wrap">
                <button type="submit" disabled={saving} className="legacy-btn legacy-btn-success">
                  <Save />
                  {saving ? "جاري الحفظ..." : "حفظ"}
                </button>{" "}
                <Link to="/packaging" className="legacy-btn legacy-btn-default">إلغاء</Link>
              </div>
            </div>
          </form>
        </div>
      </div>
    </article>
  );
}
