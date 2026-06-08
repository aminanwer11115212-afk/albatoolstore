import { useState } from "react";
import ZoomControls from "@/components/ZoomControls";
import { Link } from "react-router-dom";
import { Plus, RefreshCw, Edit, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePackagingTypes } from "@/hooks/useData";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function PackagingTypesPage() {
  const { data, isLoading, refetch, update, remove } = usePackagingTypes();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [editRow, setEditRow] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = (data || []).filter((r: any) => {
    const s = search.trim();
    if (!s) return true;
    return startsWithAny([r.name, r.description], s);
  });

  const showAll = perPage === -1;
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginated = showAll ? filtered : filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const fromIdx = filtered.length === 0 ? 0 : showAll ? 1 : (safePage - 1) * perPage + 1;
  const toIdx = showAll ? filtered.length : Math.min(safePage * perPage, filtered.length);

  const openEdit = (row: any) => {
    setEditRow(row);
    setEditName(row.name || "");
    setEditDesc(row.description || "");
  };

  const submitEdit = async () => {
    if (!editName.trim()) { toast.error("الاسم مطلوب"); return; }
    try {
      await update.mutateAsync({ id: editRow.id, name: editName.trim(), description: editDesc.trim() || null });
      toast.success("تم التحديث");
      setEditRow(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await remove.mutateAsync(deleteId);
      toast.success("تم الحذف");
    } catch (e: any) { toast.error(e.message); }
    finally { setDeleteId(null); }
  };

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <div className="grid_3 grid_4">
          <div className="header-block" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <h3 className="title" style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <span>إدارة أنواع التغليف</span>
              <Link to="/packaging/add" className="legacy-btn legacy-btn-primary btn-sm">
                <Plus /> إضافة جديدة
              </Link>
              <button onClick={() => refetch?.()} className="legacy-btn legacy-btn-info btn-sm">
                <RefreshCw /> تحديث
              </button>
              <ZoomControls />
            </h3>
          </div>

          <p>&nbsp;</p>

          <div className="legacy-dt-toolbar">
            <label>
              أظهر{" "}
              <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={-1}>الكل</option>
              </select>{" "}
              مدخلات
            </label>
            <label>
              ابحث:
              <input
                type="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </label>
          </div>

          <table className="legacy-table">
            <thead>
              <tr>
                <th className="text-center" style={{ width: 50 }}>#</th>
                <th>اسم النوع</th>
                <th>الوصف</th>
                <th className="text-center" style={{ width: 160 }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: "2rem" }}>جارٍ التحميل...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: "2rem" }}>لا توجد بيانات</td></tr>
              ) : paginated.map((r: any, i: number) => (
                <tr key={r.id} className={i % 2 === 0 ? "odd" : "even"}>
                  <td className="text-center">{(showAll ? 0 : (safePage - 1) * perPage) + i + 1}</td>
                  <td>{r.name || "-"}</td>
                  <td>{r.description || ""}</td>
                  <td className="text-center">
                    <span className="legacy-actions" style={{ justifyContent: "center" }}>
                      <button onClick={() => openEdit(r)} className="legacy-btn legacy-btn-info btn-sm" title="تعديل">
                        <Edit />
                      </button>
                      <button onClick={() => openEdit(r)} className="legacy-btn legacy-btn-success btn-sm" title="عرض">
                        <Eye />
                      </button>
                      <button onClick={() => setDeleteId(r.id)} className="legacy-btn legacy-btn-danger btn-sm" title="حذف">
                        <Trash2 />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div className="legacy-dt-info">
              إظهار {fromIdx} إلى {toIdx} من أصل {filtered.length} مدخل
            </div>
            {!showAll && totalPages > 1 && (
              <ul className="legacy-pagination">
                <li className={`page-item ${safePage === 1 ? "disabled" : ""}`}>
                  <button className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>السابق</button>
                </li>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
                  Math.max(0, Math.min(safePage - 3, totalPages - 5)),
                  Math.max(0, Math.min(safePage - 3, totalPages - 5)) + 5
                ).map((p) => (
                  <li key={p} className={`page-item ${p === safePage ? "active" : ""}`}>
                    <button className="page-link" onClick={() => setPage(p)}>{p}</button>
                  </li>
                ))}
                <li className={`page-item ${safePage === totalPages ? "disabled" : ""}`}>
                  <button className="page-link" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>التالي</button>
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>

      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل نوع التغليف</DialogTitle>
          </DialogHeader>
          <div className="legacy-form-horizontal">
            <div className="legacy-form-row">
              <label className="legacy-form-label">اسم النوع <span style={{ color: "hsl(var(--destructive))" }}>*</span></label>
              <div className="legacy-form-control-wrap">
                <input type="text" className="legacy-control" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
            </div>
            <div className="legacy-form-row">
              <label className="legacy-form-label">الوصف</label>
              <div className="legacy-form-control-wrap">
                <textarea className="legacy-control" rows={3} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setEditRow(null)} className="legacy-btn legacy-btn-default">إلغاء</button>
            <button onClick={submitEdit} className="legacy-btn legacy-btn-success">حفظ التعديل</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف نوع التغليف؟ لا يمكن التراجع عن هذه العملية.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
