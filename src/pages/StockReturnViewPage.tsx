import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings } from "@/hooks/useData";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Edit, FileText, Printer, Eye, RefreshCw, XCircle, ArrowRight } from "lucide-react";
import { resolveLogoUrl } from "@/utils/albatoolLogo";

const statusLabels: Record<string, { label: string; bg: string }> = {
  pending:   { label: "معلق",  bg: "bg-amber-500 text-white" },
  completed: { label: "مكتمل", bg: "bg-emerald-500 text-white" },
  cancelled: { label: "ملغي",  bg: "bg-red-500 text-white" },
};

export default function StockReturnViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: companyArr } = useCompanySettings();
  const company = (companyArr as any)?.[0] || null;

  const [ret, setRet] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStatusChange, setShowStatusChange] = useState(false);
  const [newStatus, setNewStatus] = useState("pending");
  const [statusSaving, setStatusSaving] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [editingCell, setEditingCell] = useState<{ index: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: r } = await supabase.from("stock_returns").select("*, customers(name, phone, email, address, balance)").eq("id", id).single();
    const { data: itms } = await supabase.from("stock_return_items").select("*").eq("stock_return_id", id);
    setRet(r);
    setItems(itms || []);
    if (r) setNewStatus(r.status || "pending");
    setLoading(false);
  };

  const handleStatusChange = async () => {
    if (!ret) return;
    try {
      const { error } = await supabase.from("stock_returns").update({ status: newStatus }).eq("id", ret.id);
      if (error) throw error;
      await load();
      toast.success("تم تغيير الوضع");
      setShowStatusChange(false);
    } catch (e: any) { toast.error(e.message || "تعذّر تغيير الوضع"); }
  };

  const handleDelete = async () => {
    if (!ret || !confirm("هل أنت متأكد من إلغاء المرتجع؟")) return;
    try {
      const { error } = await supabase.from("stock_returns").update({ status: "cancelled" }).eq("id", ret.id);
      if (error) throw error;
      await load();
      toast.success("تم إلغاء المرتجع");
    } catch (e: any) { toast.error(e.message || "تعذّر إلغاء المرتجع"); }
  };

  const startEdit = (index: number, field: string, value: any) => {
    setEditingCell({ index, field });
    setEditValue(String(value));
  };

  const saveEdit = async () => {
    if (!editingCell || !ret) return;
    const { index, field } = editingCell;
    const item = items[index];
    const val = parseFloat(editValue) || 0;
    const updates: any = { [field]: val };
    const qty = field === "quantity" ? val : item.quantity;
    const price = field === "unit_price" ? val : item.unit_price;
    updates.total = qty * price;
    try {
      const { error: itErr } = await supabase.from("stock_return_items").update(updates).eq("id", item.id);
      if (itErr) throw itErr;
      const newItems = items.map((it, i) => i === index ? { ...it, ...updates } : it);
      const newTotal = newItems.reduce((s: number, it: any) => s + Number(it.total || 0), 0);
      const { error: rErr } = await supabase.from("stock_returns").update({ total: newTotal }).eq("id", ret.id);
      if (rErr) throw new Error(`تم حفظ البند لكن فشل تحديث الإجمالي: ${rErr.message}`);
      await load();
      toast.success("تم التحديث");
    } catch (e: any) { toast.error(e.message); }
    setEditingCell(null);
  };

  const EditableCell = ({ value, index, field }: { value: number; index: number; field: string }) => {
    const isEditing = editingCell?.index === index && editingCell?.field === field;
    if (isEditing) {
      return (
        <input type="number" value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={saveEdit} onKeyDown={e => e.key === "Enter" && saveEdit()}
          className="w-20 bg-background border border-primary rounded px-1 py-0.5 text-center text-sm" autoFocus />
      );
    }
    return (
      <span onClick={() => startEdit(index, field, value)}
        className="cursor-pointer hover:bg-primary/10 rounded px-1 py-0.5 transition-colors" title="اضغط للتعديل">
        {value.toLocaleString("en", { minimumFractionDigits: 2 })}
      </span>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  if (!ret) return (
    <div className="text-center py-20 text-muted-foreground">
      <FileText size={48} className="mx-auto mb-3 opacity-30" />
      <p>المرتجع غير موجود</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/stock-return")}>العودة للمرتجعات</Button>
    </div>
  );

  const st = statusLabels[ret.status] || statusLabels.pending;
  const currency = company?.currency || "SDG";

  return (
    <div className="space-y-4" dir="rtl">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => navigate(`/stock-return/edit/${ret.id}`)} className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5 text-xs h-9">
          <Edit size={14} /> تعديل المرتجع
        </Button>
        <Button onClick={() => navigate(`/preview/return/${ret.id}`)} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs h-9">
          <Printer size={14} /> طباعة
        </Button>
        <Button onClick={() => navigate(`/preview/return/${ret.id}`)} variant="outline" className="gap-1.5 text-xs h-9">
          <Eye size={14} /> معاينة
        </Button>
        <Button onClick={() => setShowStatusChange(true)} className="bg-sky-500 hover:bg-sky-600 text-white gap-1.5 text-xs h-9">
          <RefreshCw size={14} /> تغيير الوضع
        </Button>
        <Button onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white gap-1.5 text-xs h-9">
          <XCircle size={14} /> إلغاء
        </Button>
        <Button onClick={() => navigate("/stock-return")} variant="outline" className="gap-1.5 text-xs h-9 mr-auto">
          <ArrowRight size={14} /> العودة للمرتجعات
        </Button>
      </div>

      {/* Document */}
      <article className="content"><div className="legacy-invoice-doc">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">مرتجع</h2>
            <p className="text-muted-foreground text-sm">RET #{ret.return_number}</p>
            <p className="text-muted-foreground text-sm mt-2">السبب: {ret.reason || "-"}</p>
            <div className="mt-4">
              <p className="text-muted-foreground text-sm">المبلغ الإجمالي</p>
              <p className="text-2xl font-bold text-foreground">{currency} {Number(ret.total || 0).toLocaleString("en", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
          <div className="text-left">
            <img src={resolveLogoUrl(company?.logo_url)} alt="Logo" className="h-16 mb-2" />
            <div className="text-sm text-muted-foreground mt-4">
              <p className="font-medium text-foreground">مرتجع من</p>
              <p className="text-primary font-semibold text-base">{ret.customers?.name || "عميل"}</p>
              {ret.customers?.address && <p>{ret.customers.address}</p>}
              
              {ret.customers?.email && <p>البريد الالكتروني: {ret.customers.email}</p>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-6 text-sm mb-6">
          <p>تاريخ المرتجع : {ret.date}</p>
        </div>

        <div className="mb-4">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${st.bg}`}>{st.label}</span>
        </div>

        <div className="overflow-x-auto mb-6 legacy-table-wrap">
          <table className="legacy-table w-full" style={{borderRadius: 4, overflow: 'hidden'}}>
            <thead>
              <tr className="bg-muted">
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground w-10">#</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">المنتج</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">السعر</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">الكمية</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-border hover:bg-muted/50">
                  <td className="px-3 py-2 text-center text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{it.product_name}</td>
                  <td className="px-3 py-2 text-center"><EditableCell value={Number(it.unit_price)} index={i} field="unit_price" /></td>
                  <td className="px-3 py-2 text-center"><EditableCell value={Number(it.quantity)} index={i} field="quantity" /></td>
                  <td className="px-3 py-2 text-center font-semibold">{currency} {Number(it.total).toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">لا توجد بنود</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-start">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between border-t border-border pt-2 mt-2 font-bold text-base">
              <span>الإجمالي:</span><span className="text-primary">{currency} {Number(ret.total || 0).toLocaleString("en", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </div></article>

      {/* Status Change Dialog */}
      <Dialog open={showStatusChange} onOpenChange={setShowStatusChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center bg-purple-600 text-white -m-6 mb-4 py-3 rounded-t-lg">تغيير الوضع</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir="rtl">
            <div>
              <label className="text-sm text-muted-foreground block mb-1 text-right">اجعلها كـ</label>
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                className="w-full bg-muted rounded-lg px-3 py-2 text-sm border border-border">
                <option value="pending">معلق</option>
                <option value="completed">مكتمل</option>
                <option value="cancelled">ملغي</option>
              </select>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <Button onClick={handleStatusChange} className="bg-purple-600 hover:bg-purple-700 text-white px-8">تغيير الوضع</Button>
              <Button variant="outline" onClick={() => setShowStatusChange(false)} className="px-8">إغلاق</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
