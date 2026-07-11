import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, X, Package as PackageIcon, Plus, Scissors } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProducts, useProductCategories, useWarehouses } from "@/hooks/useData";
import { useDialogSize } from "@/hooks/useDialogSize";
import InlineSearchSelect from "@/components/InlineSearchSelect";
import ImageCropDialog from "@/components/shared/ImageCropDialog";

export interface QuickAddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** يُستدعى بعد نجاح الإضافة مع كائن المنتج الكامل + قائمة الفئات */
  onCreated?: (product: any & { categories?: Array<{ id: string; name: string }> }) => void;
  /** الاسم الأولي (مثلاً النص المكتوب في حقل البحث) */
  initialName?: string;
}

const emptyForm = {
  name: "", sku: "", warehouse_id: "", company_id: "",
  purchase_price: "", sale_price: "", stock_quantity: "", min_stock: "",
  unit: "قطعة", description: "", foreign_price: "",
  image_url: "",
};

function useProductCompanies() {
  return useQuery({
    queryKey: ["product_companies"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("product_companies").select("*").order("name");
      if (error) throw error;
      return data as any[];
    },
  });
}

const inputClass = "bg-muted rounded-lg px-3 py-2 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary w-full";
const labelClass = "block text-xs text-muted-foreground mb-1";

export default function QuickAddProductDialog({
  open,
  onOpenChange,
  onCreated,
  initialName = "",
}: QuickAddProductDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { insert } = useProducts();
  const { data: categories, insert: insertCategory } = useProductCategories();
  const { data: warehouses } = useWarehouses();
  const { data: companies } = useProductCompanies();

  const [form, setForm] = useState({ ...emptyForm });
  // قائمة الفئات المختارة (M2M)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [categoryToAdd, setCategoryToAdd] = useState("");

  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { dlgRef, dlgStyle } = useDialogSize("quick_add_product_dialog", open, { w: "min(780px, 96vw)", h: "auto" });

  // Add Category dialog
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);

  // Add Company dialog
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...emptyForm, name: initialName || "" });
      setSelectedCategoryIds([]);
      setCategoryToAdd("");
    }
  }, [open, initialName]);

  // قص الصورة قبل الرفع
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("يرجى اختيار ملف صورة"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("حجم الصورة يجب أن يكون أقل من 5 ميجابايت"); return; }
    setCropFile(file);
    setCropOpen(true);
  };

  const uploadCroppedProductImage = async (cropped: File) => {
    setCropOpen(false);
    setUploadingImage(true);
    try {
      const { uploadProductImage } = await import("@/utils/productImageUpload");
      const url = await uploadProductImage(cropped);
      setForm(f => ({ ...f, image_url: url }));
      toast.success("تم رفع الصورة");
    } catch (err: any) {
      toast.error(err.message || "فشل رفع الصورة");
    } finally {
      setUploadingImage(false);
      setCropFile(null);
    }
  };

  const handleSaveCategory = async () => {
    const name = newCatName.trim();
    if (!name) { toast.error("اسم الفئة مطلوب"); return; }
    setSavingCat(true);
    try {
      const created: any = await insertCategory.mutateAsync({ name });
      toast.success("تمت إضافة الفئة");
      setSelectedCategoryIds((prev) => Array.from(new Set([...prev, created.id])));
      setNewCatName("");
      setCatDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message || "فشل إضافة الفئة");
    } finally {
      setSavingCat(false);
    }
  };

  const handleSaveCompany = async () => {
    const name = newCompanyName.trim();
    if (!name) { toast.error("اسم الماركة مطلوب"); return; }
    setSavingCompany(true);
    try {
      const { data, error } = await (supabase as any)
        .from("product_companies")
        .insert({ name })
        .select()
        .single();
      if (error) throw error;
      toast.success("تمت إضافة الماركة");
      queryClient.invalidateQueries({ queryKey: ["product_companies"] });
      setForm((f) => ({ ...f, company_id: data.id }));
      setNewCompanyName("");
      setCompanyDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message || "فشل إضافة الماركة");
    } finally {
      setSavingCompany(false);
    }
  };

  const addCategoryToSelection = (id: string) => {
    if (!id) return;
    setSelectedCategoryIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setCategoryToAdd("");
  };

  const removeCategory = (id: string) => {
    setSelectedCategoryIds((prev) => prev.filter((x) => x !== id));
  };

  const handleSubmit = async () => {
    if (!form.name) { toast.error("اسم المنتج مطلوب"); return; }
    const payload: any = {
      name: form.name, sku: form.sku || null,
      category_id: null,
      warehouse_id: form.warehouse_id || null, company_id: form.company_id || null,
      purchase_price: parseFloat(form.foreign_price) || 0, sale_price: parseFloat(form.sale_price) || 0,
      stock_quantity: parseInt(form.stock_quantity) || 0, min_stock: parseInt(form.min_stock) || 0,
      unit: form.unit, description: form.description || null,
      foreign_price: parseFloat(form.foreign_price) || null,
      image_url: form.image_url || null,
    };
    setSaving(true);
    let createdId: string | null = null;
    try {
      const created: any = await insert.mutateAsync(payload);
      createdId = created?.id || null;

      if (selectedCategoryIds.length > 0) {
        const links = selectedCategoryIds.map((cid) => ({
          product_id: created.id,
          category_id: cid,
        }));
        const { error: linkErr } = await (supabase as any)
          .from("product_category_links")
          .insert(links);
        if (linkErr) {
          // Rollback: حذف المنتج لتفادي منتج يتيم بلا فئة.
          if (createdId) {
            try { await (supabase as any).from("products").delete().eq("id", createdId); } catch {}
          }
          throw new Error(`فشل ربط الفئات، تم التراجع عن إنشاء المنتج: ${linkErr.message}`);
        }
      }

      const cats = (categories || [])
        .filter((c: any) => selectedCategoryIds.includes(c.id))
        .map((c: any) => ({ id: c.id, name: c.name }));

      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
      queryClient.invalidateQueries({ queryKey: ["product_category_links_all"] });

      if (typeof window !== "undefined") {
        try { window.dispatchEvent(new Event("products:changed")); } catch {}
      }

      toast.success("تم الإضافة");
      onCreated?.({ ...created, categories: cats });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const goToProductsPage = () => {
    onOpenChange(false);
    navigate("/products");
  };

  const availableCategories = (categories || []).filter((c: any) => !selectedCategoryIds.includes(c.id));
  const selectedCategoryObjects = (categories || []).filter((c: any) => selectedCategoryIds.includes(c.id));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          ref={dlgRef}
          style={{ ...dlgStyle, display: "flex", flexDirection: "column", overflow: "hidden" }}
          dir="rtl"
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-base">إضافة منتج جديد</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 overflow-y-auto flex-1 min-h-0 pe-1">
            {/* الصف 1: اسم المنتج (2 col) + كود */}
            <div className="col-span-2">
              <label className={labelClass}>اسم المنتج *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>كود المنتج</label>
              <input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} className={inputClass} />
            </div>

            {/* الصف 2: الفئات (2 col) + الشركة */}
            <div className="col-span-2">
              <label className={labelClass}>الفئات (يمكن اختيار أكثر من فئة)</label>
              <div className="flex items-center gap-2">
                <div className={inputClass + " !p-0"} style={{ minHeight: 38 }}>
                  <InlineSearchSelect
                    value=""
                    options={availableCategories.map((c: any) => ({ value: c.id, label: c.name }))}
                    onChange={(v) => addCategoryToSelection(v)}
                    placeholder="— اختر فئة لإضافتها —"
                    className="bg-transparent border-0 outline-none px-3 text-sm w-full h-full text-right truncate"
                    title="اختر فئة"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCatDialogOpen(true)}
                  title="إضافة فئة جديدة"
                  aria-label="إضافة فئة جديدة"
                  className="shrink-0 w-9 h-9 rounded-lg bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center"
                >
                  <Plus size={16} />
                </button>
              </div>
              {selectedCategoryObjects.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {selectedCategoryObjects.map((c: any) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-md"
                    >
                      {c.name}
                      <button
                        type="button"
                        onClick={() => removeCategory(c.id)}
                        className="hover:opacity-70"
                        aria-label={`حذف ${c.name}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className={labelClass}>الماركة</label>
              <div className="flex items-center gap-2">
                <div className={inputClass + " !p-0"} style={{ minHeight: 38 }}>
                  <InlineSearchSelect
                    value={form.company_id}
                    options={(companies || []).map((c: any) => ({ value: c.id, label: c.name }))}
                    onChange={(v) => setForm({ ...form, company_id: v })}
                    placeholder="— الماركة —"
                    className="bg-transparent border-0 outline-none px-3 text-sm w-full h-full text-right truncate"
                    title="اختر الماركة"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCompanyDialogOpen(true)}
                  title="إضافة ماركة جديدة"
                  aria-label="إضافة ماركة جديدة"
                  className="shrink-0 w-9 h-9 rounded-lg bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* الصف 3: المستودع + الوحدة + (فراغ) */}
            <div>
              <label className={labelClass}>مستودع</label>
              <div className={inputClass + " !p-0"} style={{ minHeight: 38 }}>
                <InlineSearchSelect
                  value={form.warehouse_id}
                  options={(warehouses || []).map((w: any) => ({ value: w.id, label: w.name }))}
                  onChange={(v) => setForm({ ...form, warehouse_id: v })}
                  placeholder="— المستودع —"
                  className="bg-transparent border-0 outline-none px-3 text-sm w-full h-full text-right truncate"
                  title="اختر المستودع"
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>الوحدة</label>
              <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className={inputClass} placeholder="قطعة" />
            </div>
            <div></div>

            {/* الصف 4: الأسعار (بدون سعر الجملة) */}
            <div>
              <label className={labelClass}>سعر البيع بالتجزئة</label>
              <input type="number" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} className={inputClass} placeholder="0.00" />
            </div>
            <div>
              <label className={labelClass}>السعر الأجنبي</label>
              <input type="number" value={form.foreign_price} onChange={e => setForm({ ...form, foreign_price: e.target.value })} className={inputClass} placeholder="0.00" />
            </div>
            <div></div>


            {/* الصف 5: المخزون + الحد الأدنى + (فراغ) */}
            <div>
              <label className={labelClass}>الوحدات بالمخزن</label>
              <input type="number" value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} className={inputClass} placeholder="0" />
            </div>
            <div>
              <label className={labelClass}>الحد الأدنى للتنبيه</label>
              <input type="number" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: e.target.value })} className={inputClass} placeholder="0" />
            </div>
            <div></div>

            {/* الصف 6: الوصف (2 col) + الصورة */}
            <div className="col-span-2">
              <label className={labelClass}>وصف</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputClass + " min-h-[80px]"} />
            </div>
            <div>
              <label className={labelClass}>صورة المنتج</label>
              <div className="flex items-center gap-2 flex-wrap">
                {form.image_url ? (
                  <div className="relative">
                    <img src={form.image_url} alt="معاينة" className="w-16 h-16 rounded-lg object-cover border border-border" />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, image_url: "" })}
                      className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90"
                      aria-label="حذف الصورة"
                    >
                      <X size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const tid = toast.loading("جارٍ تحميل الصورة...");
                        try {
                          const { fetchImageAsFile } = await import("@/utils/fetchImageAsFile");
                          const f = await fetchImageAsFile(form.image_url, "product-image.jpg");
                          toast.dismiss(tid);
                          setCropFile(f);
                          setCropOpen(true);
                        } catch (e: any) {
                          toast.dismiss(tid);
                          toast.error(e?.message || "تعذّر تحميل الصورة لإعادة القص");
                        }
                      }}
                      className="absolute -bottom-2 -left-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90"
                      aria-label="إعادة قص"
                      title="إعادة قص"
                    >
                      <Scissors size={10} />
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-muted border border-dashed border-border flex items-center justify-center">
                    <PackageIcon size={20} className="text-muted-foreground" />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="flex items-center gap-1 bg-primary text-primary-foreground px-2 py-1 rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    <Upload size={12} />
                    {uploadingImage ? "..." : form.image_url ? "تغيير" : "اختر"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 flex flex-row-reverse gap-2 sm:justify-start mt-2 border-t border-border pt-2">

            <Button onClick={handleSubmit} disabled={saving} size="sm">
              {saving ? "جارٍ الحفظ..." : "إضافة"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} size="sm">
              إلغاء
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={goToProductsPage}
              disabled={saving}
              size="sm"
              className="me-auto"
            >
              صفحة المنتجات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageCropDialog
        open={cropOpen}
        file={cropFile}
        onCancel={() => { setCropOpen(false); setCropFile(null); }}
        onConfirm={uploadCroppedProductImage}
        title="قص صورة المنتج"
      />

      {/* Quick Add Category Dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">إضافة فئة جديدة</DialogTitle>
          </DialogHeader>
          <div>
            <label className={labelClass}>اسم الفئة *</label>
            <input
              autoFocus
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSaveCategory(); }}
              className={inputClass}
              placeholder="اكتب اسم الفئة..."
            />
          </div>
          <DialogFooter className="flex flex-row-reverse gap-2 sm:justify-start">
            <Button onClick={handleSaveCategory} disabled={savingCat} size="sm">
              {savingCat ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)} disabled={savingCat} size="sm">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Add Company Dialog */}
      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">إضافة ماركة جديدة</DialogTitle>
          </DialogHeader>
          <div>
            <label className={labelClass}>اسم الماركة *</label>
            <input
              autoFocus
              value={newCompanyName}
              onChange={e => setNewCompanyName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSaveCompany(); }}
              className={inputClass}
              placeholder="اكتب اسم الماركة..."
            />
          </div>
          <DialogFooter className="flex flex-row-reverse gap-2 sm:justify-start">
            <Button onClick={handleSaveCompany} disabled={savingCompany} size="sm">
              {savingCompany ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
            <Button variant="outline" onClick={() => setCompanyDialogOpen(false)} disabled={savingCompany} size="sm">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
