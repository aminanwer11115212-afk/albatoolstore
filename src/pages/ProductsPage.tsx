import { useState, useRef, useEffect, useMemo, KeyboardEvent as ReactKeyboardEvent } from "react";
import { usePageRenderCount } from "@/hooks/usePageRenderCount";
import { Search, Plus, Edit, Trash2, Package as PackageIcon, Boxes, AlertTriangle, CheckCircle2, BarChart3, DollarSign, Upload, X, FileDown, Snowflake, Scissors } from "lucide-react";
import { useProductsWithDetails, useProducts, useProductCategories, useWarehouses, useSuppliers } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { mobileDocListCSS } from "@/components/mobile/MobileDocList";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import ImageCropDialog from "@/components/shared/ImageCropDialog";
import ConfirmUnlinkDeleteDialog from "@/components/shared/ConfirmUnlinkDeleteDialog";

import EditableCell from "@/components/EditableCell";
import InlineSearchSelect, { InlineSearchSelectHandle } from "@/components/InlineSearchSelect";
import { useSpaceToDelete } from "@/hooks/useSpaceToDelete";
import { useIsMobile } from "@/hooks/use-mobile";
import { openWhatsApp } from "@/utils/whatsapp";

type Focusable = { focus: () => void } | null;
import { useColumnWidths, ColumnResizeHandle, useSharedColsLocked, COLS_BTN_SAVE_LABEL, COLS_BTN_EDIT_LABEL, COLS_BTN_SAVE_TITLE, COLS_BTN_EDIT_TITLE, COLS_TOAST_SAVED, COLS_TOAST_EDIT_MODE, COLS_TOAST_SAVE_FAILED } from "@/hooks/useColumnWidths";
import { userScopedLegacyKey } from "@/lib/userScopedKey";
import { useRowHeights } from "@/hooks/useRowHeights";
// تطبيع إدخال الأرقام: يحوّل الأرقام العربية/الفارسية إلى لاتينية ويزيل المسافات
function normalizeNumStr(v: string): string {
  if (!v) return "";
  const map: Record<string, string> = { "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9","۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9","٫":".","،":"," };
  return v.replace(/[٠-٩۰-۹٫،]/g, (c) => map[c] ?? c).trim();
}

function useProductCompanies() {
  return useQuery({
    queryKey: ["product_companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_companies").select("*").order("name");
      if (error) throw error;
      return data;
    }
  });
}

export default function ProductsPage() {
  usePageRenderCount("/products");
  const location = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const { getHeight: getRowH, startDrag: startRowDrag, resetHeight: resetRowH, locked: rowsLocked, setLocked: setRowsLocked } = useRowHeights("products:rowH");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterWarehouse, setFilterWarehouse] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterName, setFilterName] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const PP_SHOW_FROZEN = userScopedLegacyKey("products-page:showFrozen");
  const PP_FROZEN_MODE = userScopedLegacyKey("products-page:frozenMode");
  const PP_STOCK_FILTER = userScopedLegacyKey("products-page:stockFilter");
  const PP_PAGE = userScopedLegacyKey("products-page:page");
  const PP_PER_PAGE = userScopedLegacyKey("products-page:perPage");

  // وضع تجميد ثلاثي: hide = إخفاء المجمدة, all = إظهار الكل, only = المجمدة فقط
  const [frozenMode, setFrozenMode] = useState<"hide" | "all" | "only">(() => {
    try {
      const v = localStorage.getItem(PP_FROZEN_MODE);
      if (v === "hide" || v === "all" || v === "only") return v;
      // ترقية من القديم
      const legacy = localStorage.getItem(PP_SHOW_FROZEN);
      return legacy === "0" ? "hide" : "all";
    } catch { return "all"; }
  });
  useEffect(() => { try { localStorage.setItem(PP_FROZEN_MODE, frozenMode); } catch {} }, [frozenMode]);
  const showFrozen = frozenMode !== "hide";
  const onlyFrozen = frozenMode === "only";
  const setShowFrozen = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === "function" ? (v as any)(showFrozen) : v;
    setFrozenMode(next ? "all" : "hide");
  };

  const [stockFilter, setStockFilter] = useState<"all" | "in" | "out" | "low">(() => {
    try { const v = localStorage.getItem(PP_STOCK_FILTER); return (v === "in" || v === "out" || v === "low" || v === "all") ? v : "all"; } catch { return "all"; }
  });
  useEffect(() => { try { localStorage.setItem(PP_STOCK_FILTER, stockFilter); } catch {} }, [stockFilter]);

  const [page, setPage] = useState<number>(() => {
    try { return Math.max(1, Number(localStorage.getItem(PP_PAGE) || 1)); } catch { return 1; }
  });
  useEffect(() => { try { localStorage.setItem(PP_PAGE, String(page)); } catch {} }, [page]);

  const [perPage, setPerPage] = useState<number>(() => {
    try { return Number(localStorage.getItem(PP_PER_PAGE) || 25); } catch { return 25; }
  });
  useEffect(() => { try { localStorage.setItem(PP_PER_PAGE, String(perPage)); } catch {} }, [perPage]);

  // ترتيب أبجدي اختياري للجدول الرئيسي (تصاعدي/تنازلي/إيقاف = ترتيب الإدخال)
  const [nameSortDir, setNameSortDir] = useState<"none" | "asc" | "desc">(() => {
    try { return (localStorage.getItem("products_name_sort") as any) || "none"; } catch { return "none"; }
  });
  useEffect(() => { try { localStorage.setItem("products_name_sort", nameSortDir); } catch {} }, [nameSortDir]);

  // مزامنة: أعد جلب المنتجات عند أي تغيير من فاتورة/مرتجع/تحويل (يبث events بنفس الاسم)
  useEffect(() => {
    const onChanged = () => {
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    };
    window.addEventListener("products:changed", onChanged);
    return () => window.removeEventListener("products:changed", onChanged);
  }, []);

  const [openFilter, setOpenFilter] = useState<{ key: string; mode: "list" | "search" } | null>(null);
  // isMobile state removed — the desktop table is now shown on mobile via the
  // global `.desktop-on-mobile` CSS, so we no longer branch on viewport here.

  const [filterQuery, setFilterQuery] = useState("");
  const [filterHighlight, setFilterHighlight] = useState(0);

  const [quickAdd, setQuickAdd] = useState<{ name: string; sku: string; category_id: string; company_id: string; warehouse_id: string; sale_price: string; foreign_price: string; supplier_id: string }>({ name: "", sku: "", category_id: "", company_id: "", warehouse_id: "", sale_price: "", foreign_price: "", supplier_id: "" });
  const [quickSaving, setQuickSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", sku: "", warehouse_id: "", company_id: "", supplier_id: "",
    purchase_price: "", sale_price: "", stock_quantity: "", min_stock: "",
    unit: "قطعة", description: "", foreign_price: "",
    image_url: "", is_frozen: false,
  });
  // فئات متعددة (M2M)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [categoryToAdd, setCategoryToAdd] = useState("");
  // ماركات متعددة (M2M)
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const [brandToAdd, setBrandToAdd] = useState("");
  // حوارات إضافة سريعة
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [keepFields, setKeepFields] = useState<boolean>(false);
  const [exchangeRate, setExchangeRate] = useState<number>(1);

  useEffect(() => {
    const fetchRate = async () => {
      try {
        const { data: currencies, error: cErr } = await supabase.from("currencies").select("*").eq("is_active", true).order("is_base", { ascending: false });
        if (cErr) throw cErr;
        if (currencies && currencies.length > 0) {
          const nonBase = currencies.find((c: any) => !c.is_base);
          if (nonBase) {
            const { data: er, error: erErr } = await supabase
              .from("exchange_rates")
              .select("rate_to_base")
              .eq("currency_code", nonBase.code)
              .order("effective_date", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (erErr) throw erErr;
            if (er?.rate_to_base) {
              setExchangeRate(Number(er.rate_to_base));
            }
          }
        }
      } catch (e: any) {
        console.error("[ProductsPage] exchange rate fetch failed:", e);
        toast.message("تعذّر جلب سعر الصرف الحالي — الأسعار بالعملة الأجنبية قد تكون غير دقيقة");
        console.error("Error fetching rate:", e);
      }
    };
    fetchRate();
  }, []);

  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // حوار حذف ذكي مع فكّ الربط (فئة/ماركة/مستودع/مورد)
  const [unlinkDialog, setUnlinkDialog] = useState<{
    entityLabel: string;
    entityName: string;
    usageLabel: string;
    usageNames: string[];
    usageCount: number;
    warning?: string;
    onConfirm: () => Promise<boolean>;
  } | null>(null);

  // Refs لتنقّل Enter/Tab بنمط نافذة العميل
  const fieldRefs = useRef<Focusable[]>([]);
  const saveBtnRef = useRef<HTMLButtonElement | null>(null);
  const focusAt = (i: number) => {
    const el = fieldRefs.current[i];
    if (el && typeof el.focus === "function") {
      el.focus();
      // auto-select text in input/textarea after focusing
      setTimeout(() => {
        const dom = el as any;
        if (dom && typeof dom.select === "function" && dom.tagName !== "BUTTON") {
          try { dom.select(); } catch {}
        }
      }, 0);
    } else {
      saveBtnRef.current?.focus();
    }
  };
  const handleFieldEnter = (idx: number) => (e: ReactKeyboardEvent) => {
    if (e.key !== "Enter") return;
    if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
    e.preventDefault();
    focusAt(idx + 1);
  };
  // Auto-select all text when a number/text input receives focus (prevents accumulation)
  const handleNumFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    try { e.target.select(); } catch {}
  };

  // Dashboard removed — table-only view

  // أعمدة قابلة للسحب لجدول إدارة جميع المنتجات
  // [#, الاسم, الفئة, الشركة, المستودع, السعر, السعر الأجنبي, الصورة, المورد, تجميد, إعدادات]
  // 11 columns for isAllProducts: #, اسم, الفئة, الشركة, المستودع, السعر, السعر الأجنبي, الصورة, المورد, تجميد, إعدادات
  const PRODUCTS_COLS_KEY = userScopedLegacyKey("products-page:colWidths:v1");
  const PRODUCTS_LOCK_KEY = userScopedLegacyKey("products-page:colsLocked:v1");
  const PRODUCTS_DEFAULTS: (number | null)[] = [60, null, 140, 140, 140, 110, 110, 130, 140, 80, 110];
  const [colsLocked, setColsLocked] = useSharedColsLocked(() => localStorage.getItem(PRODUCTS_LOCK_KEY) === "true");
  const { widths: colWidths, minWidths: colMinWidths, startDrag: startColDrag, reset: resetColWidths, saveAsUserDefault: saveColDefault, tableProps } = useColumnWidths(
    PRODUCTS_COLS_KEY,
    PRODUCTS_DEFAULTS,
    colsLocked,
  );

  const { data: products, isLoading, error } = useProductsWithDetails();
  const { insert, update, remove } = useProducts();
  // النواة: تنفيذ الحذف الفعلي بعد فحص الارتباطات (بلا confirm — للاستخدام من مسطرة الحذف)
  const performProductDelete = async (pId: string): Promise<boolean> => {
    try {
      const [invoiceCheck, quoteCheck, purchaseCheck, returnCheck, transferCheck] = await Promise.all([
        supabase.from("invoice_items").select("id", { count: "exact", head: true }).eq("product_id", pId),
        supabase.from("quote_items").select("id", { count: "exact", head: true }).eq("product_id", pId),
        supabase.from("purchase_order_items").select("id", { count: "exact", head: true }).eq("product_id", pId),
        supabase.from("stock_return_items").select("id", { count: "exact", head: true }).eq("product_id", pId),
        supabase.from("stock_transfers").select("id", { count: "exact", head: true }).eq("product_id", pId),
      ]);
      if (
        (invoiceCheck.count ?? 0) > 0 ||
        (quoteCheck.count ?? 0) > 0 ||
        (purchaseCheck.count ?? 0) > 0 ||
        (returnCheck.count ?? 0) > 0 ||
        (transferCheck.count ?? 0) > 0
      ) {
        toast.error("لا يمكن حذف المنتج لأنه مرتبط بحركات في النظام (فواتير، عروض أسعار، مشتريات، أو تحويلات). يمكنك تجميده بدلاً من ذلك.");
        return false;
      }
      await remove.mutateAsync(pId);
      toast.success("تم حذف المنتج بنجاح");
      return true;
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ أثناء محاولة الحذف");
      return false;
    }
  };

  const handleDeleteProduct = async (pId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المنتج؟")) return;
    await performProductDelete(pId);
  };

  // مسطرة → تحديد الصف، مسطرة مضاعفة → حذف كل المحدَّدين (نفس نمط جدول البنود)
  const { isPending: isRowPendingDelete } = useSpaceToDelete(async (uid) => {
    await performProductDelete(uid);
  });
  const { data: categories, insert: insertCategory } = useProductCategories();
  const { data: warehouses } = useWarehouses();
  const { data: companies } = useProductCompanies();
  const { data: suppliers } = useSuppliers();

  // ترتيب ثابت: الأحدث إضافةً أولاً + كسر تعادل بـ id حتى لا تقفز الصفوف
  // عند تساوي created_at أو بعد عمليات التعديل/إعادة الجلب.
  const allProducts = useMemo(() => {
    const arr = [...(products || [])];
    arr.sort((a: any, b: any) => {
      const ta = a?.created_at ? Date.parse(a.created_at) : 0;
      const tb = b?.created_at ? Date.parse(b.created_at) : 0;
      if (tb !== ta) return tb - ta;
      return String(b?.id || "").localeCompare(String(a?.id || ""));
    });
    return arr;
  }, [products]);
  const isOutOfStockPage = location.pathname === "/products/out-of-stock";
  const isInStockPage = location.pathname === "/products/in-stock";
  const isReportPage = location.pathname === "/products/report";
  const isPriceReport = location.pathname === "/products/price-report";
  const isAllProducts = location.pathname === "/products";
  const isAddPage = location.pathname === "/products/add";

  // Filter by stock status (incl. low stock chip) — memoized
  const pageProducts = useMemo(() => allProducts.filter((product: any) => {
    const qty = Number(product.stock_quantity || 0);
    const minS = Number(product.min_stock || 0);
    if (isOutOfStockPage) return qty <= 0;
    if (isInStockPage) return qty > 0;
    if (stockFilter === "in") return qty > 0;
    if (stockFilter === "out") return qty <= 0;
    if (stockFilter === "low") return qty > 0 && minS > 0 && qty <= minS;
    return true;
  }), [allProducts, isOutOfStockPage, isInStockPage, stockFilter]);

  // Apply dropdown filters + per-column header filters — memoized
  const filtered = useMemo(() => {
    const term = search.trim();
    return pageProducts.filter((p: any) => {
      if (filterWarehouse && p.warehouse_id !== filterWarehouse) return false;
      if (filterCategory) {
        const cats: any[] = p.categories || [];
        const matchesM2M = cats.some((c: any) => c.id === filterCategory);
        const matchesLegacy = p.category_id === filterCategory;
        if (!matchesM2M && !matchesLegacy) return false;
      }
      if (filterCompany) {
        const brs: any[] = p.brands || [];
        const matchesM2M = brs.some((b: any) => b.id === filterCompany);
        const matchesLegacy = p.company_id === filterCompany;
        if (!matchesM2M && !matchesLegacy) return false;
      }
      if (filterSupplier && p.supplier_id !== filterSupplier) return false;
      if (filterName && !startsWithMatch(p.name, filterName)) return false;
      if (filterSku && !startsWithMatch(p.sku, filterSku)) return false;
      if (onlyFrozen) { if (!p.is_frozen) return false; }
      else if (!showFrozen && p.is_frozen) return false;
      if (!term) return true;
      const catNames = (p.categories || []).map((c: any) => c.name).join(" ");
      const brandNames = (p.brands || []).map((b: any) => b.name).join(" ");
      return startsWithAny(
        [p.name, p.sku, p.product_categories?.name, catNames, p.product_companies?.name, brandNames, p.warehouses?.name, p.suppliers?.name],
        term,
      );
    });
  }, [pageProducts, filterWarehouse, filterCategory, filterCompany, filterSupplier, filterName, filterSku, showFrozen, onlyFrozen, search]);

  // تطبيق الترتيب الأبجدي على القائمة المفلترة (بدون تعديل الأصل)
  const sortedFiltered = useMemo(() => {
    if (nameSortDir === "none") return filtered;
    const arr = [...filtered];
    arr.sort((a: any, b: any) =>
      String(a?.name || "").localeCompare(String(b?.name || ""), "ar") *
      (nameSortDir === "asc" ? 1 : -1),
    );
    return arr;
  }, [filtered, nameSortDir]);


  const activeFiltersCount = [filterWarehouse, filterCategory, filterCompany, filterSupplier, filterName, filterSku, stockFilter !== "all" ? stockFilter : "", frozenMode !== "all" ? "frozen" : ""].filter(Boolean).length;
  const clearFilters = () => {
    setFilterWarehouse(""); setFilterCategory(""); setFilterCompany(""); setFilterSupplier("");
    setFilterName(""); setFilterSku(""); setStockFilter("all"); setFrozenMode("hide");
    setSearch(""); setPage(1);
  };

  // Pagination (only for /products) — memoized
  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / perPage));
  const paginated = useMemo(
    () => isAllProducts ? sortedFiltered.slice((page - 1) * perPage, page * perPage) : sortedFiltered,
    [sortedFiltered, isAllProducts, page, perPage],
  );
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    setPage(1);
  }, [search, filterWarehouse, filterCategory, filterCompany, filterSupplier, filterName, filterSku, stockFilter, frozenMode, perPage]);

  const { outOfStockCount, inStockCount, lowStockCount, inventoryValue } = useMemo(() => {
    let out = 0, inS = 0, low = 0, val = 0;
    for (const p of allProducts as any[]) {
      const q = Number(p.stock_quantity || 0);
      const m = Number(p.min_stock || 0);
      if (q <= 0) out++; else { inS++; if (q <= m) low++; }
      val += q * Number(p.purchase_price || 0);
    }
    return { outOfStockCount: out, inStockCount: inS, lowStockCount: low, inventoryValue: val };
  }, [allProducts]);

  // Quick-Add handler
  const handleQuickAdd = async () => {
    const name = quickAdd.name.trim();
    if (!name) { toast.error("اسم المنتج مطلوب"); return; }
    setQuickSaving(true);
    try {
      const payload: any = {
        name,
        sku: quickAdd.sku.trim() || null,
        category_id: quickAdd.category_id || null,
        company_id: quickAdd.company_id || null,
        warehouse_id: quickAdd.warehouse_id || null,
        supplier_id: quickAdd.supplier_id || null,
        sale_price: parseFloat(quickAdd.sale_price) || 0,
        foreign_price: quickAdd.foreign_price === "" ? null : (parseFloat(quickAdd.foreign_price) || 0),
        stock_quantity: 0, min_stock: 0,
        unit: "قطعة",
      };
      const created: any = await insert.mutateAsync(payload);
      if (quickAdd.category_id && created?.id) {
        try { await syncProductCategoryLinks(created.id, [quickAdd.category_id]); } catch {}
      }
      if (quickAdd.company_id && created?.id) {
        try {
          await (supabase as any).from("product_brand_links")
            .insert({ product_id: created.id, brand_id: quickAdd.company_id });
        } catch {}
      }
      toast.success("تمت الإضافة");
      setQuickAdd({ name: "", sku: "", category_id: "", company_id: "", warehouse_id: "", sale_price: "", foreign_price: "", supplier_id: "" });
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      window.dispatchEvent(new Event("products:changed"));
    } catch (e: any) {
      toast.error(e.message || "فشل الإضافة");
    } finally { setQuickSaving(false); }
  };

  // Quick add suppliers/categories/companies/warehouses inline — optimistic
  // نُدخل عنصراً مؤقتاً في الكاش فوراً ثم نستبدله بالـ id الحقيقي عند الرد
  const optimisticCreateInline = async (
    key: string,
    table: string,
    name: string
  ): Promise<string | null> => {
    const tempId = `__tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const prev = queryClient.getQueryData<any[]>([key]);
    queryClient.setQueryData<any[]>([key], (old) => ([...(old || []), { id: tempId, name }]));
    try {
      const { data, error } = await (supabase as any).from(table).insert({ name }).select().single();
      if (error) throw error;
      // استبدال العنصر المؤقت بالنهائي
      queryClient.setQueryData<any[]>([key], (old) =>
        (old || []).map((x: any) => (x.id === tempId ? data : x))
      );
      // إبطال للحصول على ترتيب/حقول إضافية من DB
      queryClient.invalidateQueries({ queryKey: [key], refetchType: "active" });
      return data?.id || null;
    } catch (e: any) {
      if (prev) queryClient.setQueryData([key], prev);
      toast.error(e.message || "فشل الإضافة");
      return null;
    }
  };
  const createCategoryInline = (name: string) => optimisticCreateInline("product_categories", "product_categories", name);
  const createCompanyInline = (name: string) => optimisticCreateInline("product_companies", "product_companies", name);
  const createWarehouseInline = (name: string) => optimisticCreateInline("warehouses", "warehouses", name);
  const createSupplierInline = (name: string) => optimisticCreateInline("suppliers", "suppliers", name);

  const resetForm = () => {
    setForm({
      name: "", sku: "", warehouse_id: "", company_id: "", supplier_id: "",
      purchase_price: "", sale_price: "", stock_quantity: "", min_stock: "",
      unit: "قطعة", description: "", foreign_price: "",
      image_url: "", is_frozen: false,
    });
    setSelectedCategoryIds([]);
    setCategoryToAdd("");
    setSelectedBrandIds([]);
    setBrandToAdd("");
  };

  // قص الصورة قبل الرفع (للنموذج الرئيسي وللمعاينة داخل الجدول)
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const cropTargetRef = useRef<null | ((f: File) => Promise<void> | void)>(null);

  const openCropForFile = (file: File, onCropped: (f: File) => Promise<void> | void) => {
    if (!file.type.startsWith("image/")) { toast.error("يرجى اختيار ملف صورة"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("حجم الصورة يجب أن يكون أقل من 5 ميجابايت"); return; }
    cropTargetRef.current = onCropped;
    setCropFile(file);
    setCropOpen(true);
  };

  /** إعادة قص صورة محفوظة: نحمّلها كملف ثم نمرّها لنفس مسار القص. */
  const startRecrop = async (url: string, onCropped: (f: File) => Promise<void> | void) => {
    const tid = toast.loading("جارٍ تحميل الصورة لإعادة القص...");
    try {
      const { fetchImageAsFile } = await import("@/utils/fetchImageAsFile");
      const f = await fetchImageAsFile(url, "product-image.jpg");
      toast.dismiss(tid);
      openCropForFile(f, onCropped);
    } catch (e: any) {
      toast.dismiss(tid);
      toast.error(e?.message || "تعذّر تحميل الصورة لإعادة القص");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    openCropForFile(file, async (cropped) => {
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
      }
    });
  };


  // إعادة كتابة روابط الفئات للمنتج
  const syncProductCategoryLinks = async (productId: string, categoryIds: string[]) => {
    const { error: delErr } = await (supabase as any)
      .from("product_category_links")
      .delete()
      .eq("product_id", productId);
    if (delErr) throw delErr;
    if (categoryIds.length > 0) {
      const rows = categoryIds.map((cid) => ({ product_id: productId, category_id: cid }));
      const { error: insErr } = await (supabase as any)
        .from("product_category_links")
        .insert(rows);
      if (insErr) throw insErr;
    }
  };

  // إعادة كتابة روابط الماركات للمنتج
  const syncProductBrandLinks = async (productId: string, brandIds: string[]) => {
    const { error: delErr } = await (supabase as any)
      .from("product_brand_links")
      .delete()
      .eq("product_id", productId);
    if (delErr) throw delErr;
    if (brandIds.length > 0) {
      const rows = brandIds.map((bid) => ({ product_id: productId, brand_id: bid }));
      const { error: insErr } = await (supabase as any)
        .from("product_brand_links")
        .insert(rows);
      if (insErr) throw insErr;
    }
  };

  // حذف فئة من المنتج — optimistic
  const deleteProductCategory = async (productId: string, categoryId: string) => {
    const prevProducts = queryClient.getQueryData<any[]>(["products"]);
    const prevDetails = queryClient.getQueryData<any[]>(["products-with-details"]);
    const apply = (old: any[] | undefined) => (old || []).map((p: any) => {
      if (p.id !== productId) return p;
      const cats = (p.categories || []).filter((c: any) => c.id !== categoryId);
      const newPrimary = p.category_id === categoryId ? (cats[0]?.id || null) : p.category_id;
      return { ...p, categories: cats, category_id: newPrimary, product_categories: cats[0] || null };
    });
    queryClient.setQueryData(["products"], apply);
    queryClient.setQueryData(["products-with-details"], apply);
    try {
      await (supabase as any).from("product_category_links").delete().eq("product_id", productId).eq("category_id", categoryId);
      const next = queryClient.getQueryData<any[]>(["products-with-details"]);
      const p = (next || []).find((x: any) => x.id === productId);
      const primary = p?.category_id ?? null;
      await update.mutateAsync({ id: productId, category_id: primary });
      window.dispatchEvent(new Event("products:changed"));
      return true;
    } catch (err: any) {
      queryClient.setQueryData(["products"], prevProducts);
      queryClient.setQueryData(["products-with-details"], prevDetails);
      toast.error(err.message || "فشل الحذف");
      return false;
    }
  };

  // حذف ماركة من المنتج — optimistic
  const deleteProductBrand = async (productId: string, brandId: string) => {
    const prevProducts = queryClient.getQueryData<any[]>(["products"]);
    const prevDetails = queryClient.getQueryData<any[]>(["products-with-details"]);
    const apply = (old: any[] | undefined) => (old || []).map((p: any) => {
      if (p.id !== productId) return p;
      const brs = (p.brands || []).filter((b: any) => b.id !== brandId);
      const newPrimary = p.company_id === brandId ? (brs[0]?.id || null) : p.company_id;
      return { ...p, brands: brs, company_id: newPrimary, product_companies: brs[0] || null };
    });
    queryClient.setQueryData(["products"], apply);
    queryClient.setQueryData(["products-with-details"], apply);
    try {
      await (supabase as any).from("product_brand_links").delete().eq("product_id", productId).eq("brand_id", brandId);
      const next = queryClient.getQueryData<any[]>(["products-with-details"]);
      const p = (next || []).find((x: any) => x.id === productId);
      const primary = p?.company_id ?? null;
      await update.mutateAsync({ id: productId, company_id: primary });
      window.dispatchEvent(new Event("products:changed"));
      return true;
    } catch (err: any) {
      queryClient.setQueryData(["products"], prevProducts);
      queryClient.setQueryData(["products-with-details"], prevDetails);
      toast.error(err.message || "فشل الحذف");
      return false;
    }
  };

  // حذف مستودع من المنتج
  const deleteProductWarehouse = async (productId: string) => {
    try {
      updateField(productId, "warehouse_id", null);
      await update.mutateAsync({ id: productId, warehouse_id: null });
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
      return true;
    } catch (err: any) { toast.error(err.message || "فشل الحذف"); return false; }
  };

  // إزالة المورد من المنتج (لا يحذف المورد من النظام)
  const deleteProductSupplier = async (productId: string) => {
    try {
      updateField(productId, "supplier_id", null);
      await update.mutateAsync({ id: productId, supplier_id: null });
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
      return true;
    } catch (err: any) { toast.error(err.message || "فشل الحذف"); return false; }
  };


  // أسماء المنتجات المستخدمة لمعرف معين (للرسائل)
  const formatUsageList = (names: string[]) => {
    const shown = names.slice(0, 5).join("، ");
    const extra = names.length > 5 ? ` و${names.length - 5} آخرون` : "";
    return shown + extra;
  };

  // حذف فعلي للفئة (بعد فكّ الروابط)
  const performDeleteCategory = async (categoryId: string): Promise<boolean> => {
    try {
      await (supabase as any).from("product_category_links").delete().eq("category_id", categoryId);
      await (supabase as any).from("products").update({ category_id: null }).eq("category_id", categoryId);
      const { error: derr } = await (supabase as any).from("product_categories").delete().eq("id", categoryId);
      if (derr) throw derr;
      queryClient.invalidateQueries({ queryKey: ["product_categories"] });
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
      toast.success("تم حذف الفئة");
      return true;
    } catch (err: any) { toast.error(err.message || "فشل الحذف"); return false; }
  };

  const deleteCategoryFromSystem = async (categoryId: string): Promise<boolean> => {
    try {
      const [{ data: links }, { data: legacy }, { data: catRow }] = await Promise.all([
        (supabase as any).from("product_category_links").select("product_id").eq("category_id", categoryId),
        (supabase as any).from("products").select("id").eq("category_id", categoryId),
        (supabase as any).from("product_categories").select("name").eq("id", categoryId).maybeSingle(),
      ]);
      const ids = new Set<string>([...(links || []).map((x: any) => x.product_id), ...(legacy || []).map((x: any) => x.id)]);
      if (ids.size === 0) return await performDeleteCategory(categoryId);
      const names = (products || []).filter((p: any) => ids.has(p.id)).map((p: any) => p.name);
      setUnlinkDialog({
        entityLabel: "الفئة",
        entityName: catRow?.name || "",
        usageLabel: "منتج",
        usageNames: names,
        usageCount: ids.size,
        onConfirm: () => performDeleteCategory(categoryId),
      });
      return false;
    } catch (err: any) { toast.error(err.message || "فشل الحذف"); return false; }
  };

  // حذف فعلي للماركة (بعد فكّ الروابط)
  const performDeleteBrand = async (brandId: string): Promise<boolean> => {
    try {
      await (supabase as any).from("product_brand_links").delete().eq("brand_id", brandId);
      await (supabase as any).from("products").update({ company_id: null }).eq("company_id", brandId);
      const { error: derr } = await (supabase as any).from("product_companies").delete().eq("id", brandId);
      if (derr) throw derr;
      queryClient.invalidateQueries({ queryKey: ["product_companies"] });
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
      toast.success("تم حذف الماركة");
      return true;
    } catch (err: any) { toast.error(err.message || "فشل الحذف"); return false; }
  };

  const deleteBrandFromSystem = async (brandId: string): Promise<boolean> => {
    try {
      const [{ data: links }, { data: legacy }, { data: brRow }] = await Promise.all([
        (supabase as any).from("product_brand_links").select("product_id").eq("brand_id", brandId),
        (supabase as any).from("products").select("id").eq("company_id", brandId),
        (supabase as any).from("product_companies").select("name").eq("id", brandId).maybeSingle(),
      ]);
      const ids = new Set<string>([...(links || []).map((x: any) => x.product_id), ...(legacy || []).map((x: any) => x.id)]);
      if (ids.size === 0) return await performDeleteBrand(brandId);
      const names = (products || []).filter((p: any) => ids.has(p.id)).map((p: any) => p.name);
      setUnlinkDialog({
        entityLabel: "الماركة",
        entityName: brRow?.name || "",
        usageLabel: "منتج",
        usageNames: names,
        usageCount: ids.size,
        onConfirm: () => performDeleteBrand(brandId),
      });
      return false;
    } catch (err: any) { toast.error(err.message || "فشل الحذف"); return false; }
  };

  // حذف فعلي للمستودع (بعد فكّ الربط)
  const performDeleteWarehouse = async (warehouseId: string): Promise<boolean> => {
    try {
      await (supabase as any).from("products").update({ warehouse_id: null }).eq("warehouse_id", warehouseId);
      const { error: derr } = await (supabase as any).from("warehouses").delete().eq("id", warehouseId);
      if (derr) throw derr;
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
      toast.success("تم حذف المستودع");
      return true;
    } catch (err: any) { toast.error(err.message || "فشل الحذف"); return false; }
  };

  const deleteWarehouseFromSystem = async (warehouseId: string): Promise<boolean> => {
    try {
      const [{ data: used }, { data: whRow }] = await Promise.all([
        (supabase as any).from("products").select("id, name").eq("warehouse_id", warehouseId),
        (supabase as any).from("warehouses").select("name").eq("id", warehouseId).maybeSingle(),
      ]);
      const rows = (used || []) as any[];
      if (rows.length === 0) return await performDeleteWarehouse(warehouseId);
      const names = rows.map((p: any) => p.name);
      setUnlinkDialog({
        entityLabel: "المستودع",
        entityName: whRow?.name || "",
        usageLabel: "منتج",
        usageNames: names,
        usageCount: rows.length,
        warning: `سيصبح ${rows.length} منتج بدون مستودع محدد.`,
        onConfirm: () => performDeleteWarehouse(warehouseId),
      });
      return false;
    } catch (err: any) { toast.error(err.message || "فشل الحذف"); return false; }
  };

  // حذف فعلي للمورد (بعد فكّ الربط من المنتجات) — يُرفض إن كانت هناك فواتير شراء
  const performDeleteSupplier = async (supplierId: string): Promise<boolean> => {
    try {
      await (supabase as any).from("products").update({ supplier_id: null }).eq("supplier_id", supplierId);
      const { error: derr } = await (supabase as any).from("suppliers").delete().eq("id", supplierId);
      if (derr) throw derr;
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
      toast.success("تم حذف المورد");
      return true;
    } catch (err: any) { toast.error(err.message || "فشل الحذف"); return false; }
  };

  const deleteSupplierFromSystem = async (supplierId: string): Promise<boolean> => {
    try {
      const [{ data: usedP }, { data: usedPO }, { data: sRow }] = await Promise.all([
        (supabase as any).from("products").select("id, name").eq("supplier_id", supplierId),
        (supabase as any).from("purchase_orders").select("id").eq("supplier_id", supplierId).limit(1),
        (supabase as any).from("suppliers").select("name").eq("id", supplierId).maybeSingle(),
      ]);
      if ((usedPO || []).length > 0) {
        toast.error("لا يمكن حذف المورد — يوجد فواتير شراء مرتبطة به");
        return false;
      }
      const rows = (usedP || []) as any[];
      if (rows.length === 0) return await performDeleteSupplier(supplierId);
      const names = rows.map((p: any) => p.name);
      setUnlinkDialog({
        entityLabel: "المورد",
        entityName: sRow?.name || "",
        usageLabel: "منتج",
        usageNames: names,
        usageCount: rows.length,
        onConfirm: () => performDeleteSupplier(supplierId),
      });
      return false;
    } catch (err: any) { toast.error(err.message || "فشل الحذف"); return false; }
  };



  const handleSubmit = async () => {
    if (!form.name?.trim()) { toast.error("اسم المنتج مطلوب"); return; }
    if (!form.sale_price || parseFloat(form.sale_price) <= 0) { toast.error("سعر البيع مطلوب ويجب أن يكون أكبر من صفر"); return; }
    if (!form.warehouse_id) { toast.error("المخزن مطلوب"); return; }
    // أول ماركة محفوظة كـ company_id للحفاظ على التكامل الخلفي مع باقي النظام
    const primaryBrandId = selectedBrandIds[0] || null;
    const payload: any = {
      name: form.name, sku: form.sku || null,
      category_id: selectedCategoryIds[0] || null,
      warehouse_id: form.warehouse_id || null, company_id: primaryBrandId,
      supplier_id: form.supplier_id || null,
      purchase_price: parseFloat(form.purchase_price) || 0, sale_price: parseFloat(form.sale_price) || 0,
      min_stock: parseInt(form.min_stock) || 0,
      unit: form.unit, description: form.description || null,
      foreign_price: parseFloat(form.foreign_price) || null,
      image_url: form.image_url || null,
      is_frozen: !!form.is_frozen,
    };
    // الكمية تُدار عبر حركات المخزون (فواتير/مرتجعات/تحويلات) — لا تكتبها مباشرة عند التعديل.
    // عند الإنشاء فقط تُعتبر كمية افتتاحية.
    if (!editId) {
      payload.stock_quantity = parseInt(form.stock_quantity) || 0;
    }
    try {
      let productId: string;
      if (editId) {
        const upd: any = await update.mutateAsync({ id: editId, ...payload });
        productId = upd?.id || editId;
        toast.success("تم التحديث");
      } else {
        const created: any = await insert.mutateAsync(payload);
        productId = created.id;
        toast.success("تم الإضافة");
      }
      await syncProductCategoryLinks(productId, selectedCategoryIds);
      await syncProductBrandLinks(productId, selectedBrandIds);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
      queryClient.invalidateQueries({ queryKey: ["product_category_links_all"] });
      window.dispatchEvent(new Event("products:changed"));
      if (keepFields && !editId) {
        setForm(prev => ({
          ...prev,
          name: "",
          sku: "",
          purchase_price: "",
          sale_price: "",
          foreign_price: "",
          stock_quantity: "",
          min_stock: "",
          description: "",
          image_url: "",
        }));
      } else {
        setShowForm(false);
        setEditId(null);
        resetForm();
      }
    } catch (e: any) { toast.error(e.message); }
  };

  const handleEdit = (p: any) => {
    setEditId(p.id);
    setForm({
      name: p.name, sku: p.sku || "", warehouse_id: p.warehouse_id || "",
      company_id: p.company_id || "", supplier_id: p.supplier_id || "",
      purchase_price: String(p.purchase_price || ""), sale_price: String(p.sale_price || ""),
      stock_quantity: String(p.stock_quantity || ""), min_stock: String(p.min_stock || ""), unit: p.unit || "قطعة",
      description: p.description || "",
      foreign_price: String(p.foreign_price || ""),
      image_url: p.image_url || "",
      is_frozen: Boolean(p.is_frozen),
    });
    const cats: any[] = p.categories || [];
    const ids = cats.map((c: any) => c.id);
    if (ids.length === 0 && p.category_id) ids.push(p.category_id);
    setSelectedCategoryIds(ids);
    setCategoryToAdd("");
    const brs: any[] = p.brands || [];
    const bids = brs.map((b: any) => b.id);
    if (bids.length === 0 && p.company_id) bids.push(p.company_id);
    setSelectedBrandIds(bids);
    setBrandToAdd("");
    setShowForm(true);
  };

  const handleSaveCategoryQuick = async () => {
    const name = newCatName.trim();
    if (!name) { toast.error("اسم الفئة مطلوب"); return; }
    try {
      const created: any = await insertCategory.mutateAsync({ name });
      toast.success("تمت إضافة الفئة");
      setSelectedCategoryIds((prev) => Array.from(new Set([...prev, created.id])));
      setNewCatName("");
      setCatDialogOpen(false);
    } catch (e: any) { toast.error(e.message || "فشل إضافة الفئة"); }
  };

  const handleSaveCompanyQuick = async () => {
    const name = newCompanyName.trim();
    if (!name) { toast.error("اسم الماركة مطلوب"); return; }
    try {
      const { data, error } = await (supabase as any)
        .from("product_companies")
        .insert({ name })
        .select()
        .single();
      if (error) throw error;
      toast.success("تمت إضافة الماركة");
      queryClient.invalidateQueries({ queryKey: ["product_companies"] });
      setSelectedBrandIds((prev) => prev.includes(data.id) ? prev : [...prev, data.id]);
      setNewCompanyName("");
      setCompanyDialogOpen(false);
    } catch (e: any) { toast.error(e.message || "فشل إضافة الماركة"); }
  };

  const addCatToSelection = (id: string) => {
    if (!id) return;
    setSelectedCategoryIds((prev) => prev.includes(id) ? prev : [...prev, id]);
    setCategoryToAdd("");
  };
  const removeCatFromSelection = (id: string) => {
    setSelectedCategoryIds((prev) => prev.filter((x) => x !== id));
  };
  const availableCategories = (categories || []).filter((c: any) => !selectedCategoryIds.includes(c.id));
  const selectedCategoryObjects = (categories || []).filter((c: any) => selectedCategoryIds.includes(c.id));

  const addBrandToSelection = (id: string) => {
    if (!id) return;
    setSelectedBrandIds((prev) => prev.includes(id) ? prev : [...prev, id]);
    setBrandToAdd("");
  };
  const removeBrandFromSelection = (id: string) => {
    setSelectedBrandIds((prev) => prev.filter((x) => x !== id));
  };
  const availableBrands = (companies || []).filter((b: any) => !selectedBrandIds.includes(b.id));
  const selectedBrandObjects = (companies || []).filter((b: any) => selectedBrandIds.includes(b.id));

  // تحرير مباشر للحقول من داخل الجدول — Optimistic UI فوري + حفظ بالخلفية
  const updateField = async (id: string, field: string, value: any) => {
    const prevProducts = queryClient.getQueryData<any[]>(["products"]);
    const prevDetails = queryClient.getQueryData<any[]>(["products-with-details"]);
    const patch = (old: any[] | undefined) =>
      (old || []).map((p: any) => p.id === id ? { ...p, [field]: value } : p);
    queryClient.setQueryData(["products"], patch);
    queryClient.setQueryData(["products-with-details"], patch);
    try {
      await update.mutateAsync({ id, [field]: value });
      window.dispatchEvent(new Event("products:changed"));
    } catch (e: any) {
      queryClient.setQueryData(["products"], prevProducts);
      queryClient.setQueryData(["products-with-details"], prevDetails);
      toast.error(e.message || "فشل التحديث — تم التراجع");
    }
  };

  // Patch متعدد الحقول للمنتج (يشمل علاقات مثل categories/brands) — يرجع snapshot للـ rollback
  const patchProductCaches = (id: string, partial: Record<string, any>) => {
    const prevProducts = queryClient.getQueryData<any[]>(["products"]);
    const prevDetails = queryClient.getQueryData<any[]>(["products-with-details"]);
    const apply = (old: any[] | undefined) =>
      (old || []).map((p: any) => p.id === id ? { ...p, ...partial } : p);
    queryClient.setQueryData(["products"], apply);
    queryClient.setQueryData(["products-with-details"], apply);
    return () => {
      queryClient.setQueryData(["products"], prevProducts);
      queryClient.setQueryData(["products-with-details"], prevDetails);
    };
  };

  // تحديث متفائل لحقل التجميد (يظهر فوراً قبل رد الخادم)
  const optimisticPatchProducts = (ids: string[], patch: Record<string, any>) => {
    const keys = [["products-with-details"], ["products"]];
    const snapshots: Array<{ key: any; data: any }> = [];
    for (const key of keys) {
      const data = queryClient.getQueryData<any>(key as any);
      snapshots.push({ key, data });
      if (Array.isArray(data)) {
        queryClient.setQueryData(key as any, data.map((p: any) => ids.includes(p.id) ? { ...p, ...patch } : p));
      }
    }
    return snapshots;
  };
  const setFrozenOptimistic = async (ids: string[], freeze: boolean): Promise<boolean> => {
    if (ids.length === 0) return true;
    const snaps = optimisticPatchProducts(ids, { is_frozen: freeze });
    try {
      const { error } = await (supabase as any).from("products").update({ is_frozen: freeze }).in("id", ids);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      window.dispatchEvent(new Event("products:changed"));
      return true;
    } catch (e: any) {
      // rollback optimistic UI
      for (const s of snaps) queryClient.setQueryData(s.key, s.data);
      const action = freeze ? "تجميد" : "إلغاء تجميد";
      const count = ids.length;
      toast.error(
        `فشل ${action} ${count > 1 ? `${count} منتج` : "المنتج"} — تم التراجع عن التحديث`,
        { description: e?.message || "تحقق من الاتصال أو الصلاحيات ثم أعد المحاولة" }
      );
      return false;
    }
  };

  // تحديد متعدد للمنتجات
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIdxRef = useRef<number | null>(null);
  const lastSpaceTapRef = useRef<number>(0);
  const selectedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  const deleteSelected = async () => {
    const ids = Array.from(selectedIdsRef.current);
    if (ids.length === 0) return;
    for (const id of ids) {
      try { await performProductDelete(id); } catch (err) { console.error("[deleteSelected]", err); }
    }
    setSelectedIds(new Set());
    toast.success(`تم حذف ${ids.length} منتج`);
  };
  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Multi-select: Ctrl toggles a single row, Shift extends range from the last anchor.
  const selectWithModifiers = (
    index: number,
    opts: { shift?: boolean; ctrl?: boolean } = {}
  ) => {
    const list = paginated as any[];
    const id = list[index]?.id;
    if (!id) return;
    const anchor = lastSelectedIdxRef.current;
    if (opts.shift && anchor !== null && anchor !== undefined) {
      const [a, b] = anchor <= index ? [anchor, index] : [index, anchor];
      const rangeIds = list.slice(a, b + 1).map(p => p.id);
      setSelectedIds(prev => {
        const next = opts.ctrl ? new Set(prev) : new Set<string>();
        rangeIds.forEach(rid => next.add(rid));
        return next;
      });
    } else if (opts.ctrl) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      lastSelectedIdxRef.current = index;
    } else {
      setSelectedIds(prev => {
        if (prev.size === 1 && prev.has(id)) return new Set();
        return new Set([id]);
      });
      lastSelectedIdxRef.current = index;
    }
  };
  const freezeSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) { toast.info("لم يتم تحديد أي منتج"); return; }
    const ok = await setFrozenOptimistic(ids, true);
    if (!ok) return;
    toast.success(`تم تجميد ${ids.length} منتج`);
    setSelectedIds(new Set());
  };
  const unfreezeSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) { toast.info("لم يتم تحديد أي منتج"); return; }
    const ok = await setFrozenOptimistic(ids, false);
    if (!ok) return;
    toast.success(`تم إلغاء تجميد ${ids.length} منتج`);
    setSelectedIds(new Set());
  };
  const selectAllVisible = () => {
    setSelectedIds(new Set(paginated.map((p: any) => p.id)));
  };

  const toggleAllFrozen = async (freeze: boolean) => {
    const ids = filtered.map((p: any) => p.id);
    if (ids.length === 0) return;
    const ok = await setFrozenOptimistic(ids, freeze);
    if (!ok) return;
    toast.success(freeze ? "تم تجميد كل المعروض" : "تم إلغاء التجميد عن كل المعروض");
  };

  // ============ PDF export (Excel-like table + company letterhead) ============
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const isMobileUI = useIsMobile();
  // ورقة إجراءات صورة المنتج (موبايل): تعديل / عرض الصورة / مشاركة / حذف
  const [imgActionProduct, setImgActionProduct] = useState<any | null>(null);
  const [imgLightbox, setImgLightbox] = useState<{ url: string; name: string } | null>(null);
  // خيارات المعاينة (فلترة/ترتيب) — مستقلّة عن فلاتر الجدول الرئيسي
  const [pv, setPv] = useState<{
    search: string;
    category: string;
    brand: string;
    warehouse: string;
    sortBy: "name" | "category" | "brand";
    sortDir: "asc" | "desc";
    showPrice: boolean;
  }>({ search: "", category: "", brand: "", warehouse: "", sortBy: "name", sortDir: "asc", showPrice: false });

  // ورّث فلاتر الصفحة عند فتح المعاينة
  const openPdfPreview = () => {
    setPv((prev) => ({
      ...prev,
      search: (search as string) || "",
      category: filterCategory || "",
      brand: filterCompany || "",
      warehouse: filterWarehouse || "",
      sortBy: "name",
      sortDir: "asc",
      // showPrice: يُحافَظ عليه من الحالة السابقة
    }));
    setPdfPreviewOpen(true);
  };

  const pdfList = useMemo(() => {
    const src = filtered as any[];
    const q = pv.search.trim().toLowerCase();
    const catByProd = (p: any) => p.categories?.[0]?.id || p.product_categories?.id || p.category_id || "";
    const brandByProd = (p: any) => p.brands?.[0]?.id || p.product_companies?.id || p.company_id || "";
    const rows = src.filter(p => {
      if (q && !((p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))) return false;
      if (pv.category && catByProd(p) !== pv.category) return false;
      if (pv.brand && brandByProd(p) !== pv.brand) return false;
      if (pv.warehouse && p.warehouse_id !== pv.warehouse) return false;
      return true;
    });
    const keyOf = (p: any) => {
      if (pv.sortBy === "category") return String(p.categories?.[0]?.name || p.product_categories?.name || "");
      if (pv.sortBy === "brand") return String(p.brands?.[0]?.name || p.product_companies?.name || "");
      return String(p.name || "");
    };
    rows.sort((a, b) => keyOf(a).localeCompare(keyOf(b), "ar") * (pv.sortDir === "asc" ? 1 : -1));
    return rows;
  }, [filtered, pv]);

  const exportFilteredPdf = async (mode: "print" | "preview" = "print", listOverride?: any[]) => {
    if (isExportingPdf) return;
    const list = listOverride || (filtered as any[]);
    setIsExportingPdf(true);
    const toastId = toast.loading(`جارٍ إنشاء كتالوج PDF لـ ${list.length} منتج...`);
    try {
      const escHtml = (s: any) => String(s ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

      // ترويسة الشركة الكاملة (نفس حقول قوالب الفواتير)
      let company: any = {};
      try {
        const { data: cs } = await (supabase as any)
          .from("company_settings").select("*").maybeSingle();
        if (cs) company = cs;
      } catch { /* ignore */ }
      const companyName = company.company_name || "الشركة";
      const logoUrl = company.logo_url || "";

      // SVG placeholder مضمَّن — يظهر مربعاً عند غياب الصورة أو فشل تحميلها
      const placeholderSvg =
        `data:image/svg+xml;utf8,` + encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'>
            <rect width='100%' height='100%' fill='#f1f5f9'/>
            <g fill='#94a3b8' font-family='Cairo,Arial,sans-serif' font-size='10' text-anchor='middle'>
              <rect x='30' y='34' width='60' height='44' rx='4' fill='none' stroke='#cbd5e1' stroke-width='2'/>
              <circle cx='47' cy='52' r='4' fill='#cbd5e1'/>
              <path d='M35 74 L55 58 L70 70 L85 60 L85 78 L35 78 Z' fill='#cbd5e1'/>
              <text x='60' y='96'>بدون صورة</text>
            </g>
          </svg>`
        );

      const wById = new Map<string, string>((warehouses || []).map((w: any) => [w.id, w.name]));

      // ملخّص الفلاتر المطبّقة يظهر تحت العنوان
      const activeFilters: string[] = [];
      if (pv.category) {
        const c = (categories || []).find((x: any) => x.id === pv.category);
        if (c) activeFilters.push(`الفئة: ${c.name}`);
      }
      if (pv.brand) {
        const b = (companies || []).find((x: any) => x.id === pv.brand);
        if (b) activeFilters.push(`الماركة: ${b.name}`);
      }
      if (pv.warehouse) {
        const w = (warehouses || []).find((x: any) => x.id === pv.warehouse);
        if (w) activeFilters.push(`المستودع: ${w.name}`);
      }
      if (pv.search.trim()) activeFilters.push(`بحث: ${pv.search.trim()}`);
      activeFilters.push(
        `الترتيب: ${pv.sortBy === "name" ? "الاسم" : pv.sortBy === "category" ? "الفئة" : "الماركة"} (${pv.sortDir === "asc" ? "تصاعدي" : "تنازلي"})`
      );

      const showPriceCol = !!pv.showPrice;
      const priceFmt = (n: any) => Number(n || 0).toLocaleString("ar-EG");
      const rows = list.map((p: any, i: number) => {
        const brandName = p.brands?.[0]?.name || p.product_companies?.name || "";
        const catName = p.categories?.[0]?.name || p.product_categories?.name || "";
        const whName = p.warehouse_id ? (wById.get(p.warehouse_id) || "") : "";
        const src = p.image_url ? escHtml(p.image_url) : placeholderSvg;
        return `
          <tr>
            <td class="c-num">${i + 1}</td>
            <td class="c-img"><div class="thumb">
              <img src="${src}" alt="${escHtml(p.name || "")}" loading="lazy"
                   onerror="this.onerror=null;this.src='${placeholderSvg}'"/>
            </div></td>
            <td class="c-name">${escHtml(p.name || "")}</td>
            <td class="c-meta">${escHtml(catName)}</td>
            <td class="c-meta">${escHtml(brandName)}</td>
            <td class="c-meta">${escHtml(whName)}</td>
            <td class="c-sku">${escHtml(p.sku || "")}</td>
            ${showPriceCol ? `<td class="c-price">${priceFmt(p.sale_price)}</td>` : ""}
          </tr>`;
      }).join("");

      const today = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
      const autoPrint = mode === "print";

      const html = `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>كتالوج المنتجات — ${escHtml(companyName)}</title>
<style>
  @page { size: A4; margin: 8mm 6mm 10mm 6mm; }
  * { box-sizing: border-box; }
  html, body { font-family: "Cairo", "Segoe UI", Tahoma, Arial, sans-serif; color: #1f2937; }
  body { margin: 0; padding: 0; background: #fff; }

  .toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; gap: 8px; padding: 10px 14px;
    background: #0f172a; color: #fff; border-bottom: 1px solid #1e293b;
  }
  .toolbar button {
    background: #0ea5e9; color: #fff; border: 0; border-radius: 6px;
    padding: 8px 14px; font: 600 13px "Cairo",sans-serif; cursor: pointer;
  }
  .toolbar button.ghost { background: transparent; border: 1px solid #334155; }

  .page { padding: 6px 8px; }

  /* ترويسة الشركة — مضغوطة للطباعة لتوفير مساحة المنتجات */
  .letterhead {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 10px; margin-bottom: 6px;
    background: linear-gradient(135deg, #5b2c8e, #7e3eb5);
    color: #fff; border-radius: 8px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .letterhead .logo {
    width: 40px; height: 40px; background: #fff; border-radius: 6px; padding: 3px;
    display: flex; align-items: center; justify-content: center;
    color: #5b2c8e; font-weight: 800; font-size: 16px;
  }
  .letterhead .logo img { width: 100%; height: 100%; object-fit: contain; }
  .letterhead .co { flex: 1; min-width: 0; }
  .letterhead .co h2 { margin: 0 0 2px; font-size: 13px; font-weight: 800; }
  .letterhead .co .meta { font-size: 9.5px; opacity: 0.95; line-height: 1.4; }
  .letterhead .side {
    text-align: center; padding: 4px 8px; min-width: 140px;
    background: rgba(255,255,255,0.16); border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.28);
  }
  .letterhead .side .t { font-size: 11px; font-weight: 800; }
  .letterhead .side .st { font-size: 9.5px; opacity: 0.92; margin-top: 1px; }

  .filters-note {
    background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 5px;
    padding: 3px 8px; margin-bottom: 5px; font-size: 9.5px; color: #475569;
    display: flex; flex-wrap: wrap; gap: 6px;
  }
  .filters-note b { color: #0f172a; }

  table.products { width: 100%; border-collapse: collapse; }
  table.products thead { display: table-header-group; } /* تكرار الترويسة كل صفحة */
  table.products tfoot { display: table-footer-group; }
  table.products th, table.products td {
    border: 1px solid #e5e7eb; padding: 2px 4px; vertical-align: middle;
    font-size: 9.5px; line-height: 1.15;
  }
  table.products thead th {
    background: #f1f5f9; color: #0f172a; font-weight: 800; font-size: 10px;
    padding: 3px 4px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .repeat-brand td {
    background: #ede9fe; color: #4c1d95; font-weight: 800; text-align: center;
    padding: 2px; font-size: 9.5px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  table.products tr { page-break-inside: avoid; break-inside: avoid; }

  .c-num  { width: 24px; text-align: center; color: #64748b; }
  .c-img  { width: 34px; }
  .c-name { font-weight: 700; color: #0f172a; }
  .c-meta { width: 90px; color: #334155; }
  .c-sku  { width: 75px; font-family: ui-monospace, monospace; color: #0369a1; font-size: 9px; }
  .c-price{ width: 70px; text-align: center; font-weight: 700; color: #059669; }

  /* الصورة مربعة مضغوطة للطباعة (28×28) لتوفير أكبر عدد من الصفوف */
  .thumb {
    width: 26px; height: 26px; background: #f8fafc; border: 1px solid #e5e7eb;
    border-radius: 3px; overflow: hidden; margin: auto;
    display: flex; align-items: center; justify-content: center;
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .footer {
    margin-top: 6px; padding-top: 4px; border-top: 1px dashed #cbd5e1;
    color: #64748b; font-size: 9px; text-align: center;
  }

  @media print {
    .toolbar { display: none !important; }
    .page { padding: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
    <button class="ghost" onclick="window.close()">إغلاق</button>
    <div style="margin-inline-start:auto; align-self:center; font-size:12px; color:#94a3b8;">
      ${list.length} منتج • ${escHtml(companyName)}
    </div>
  </div>
  <div class="page">
    <div class="letterhead">
      <div class="logo">${logoUrl ? `<img src="${escHtml(logoUrl)}" alt="logo"/>` : escHtml(companyName.charAt(0))}</div>
      <div class="co">
        <h2>${escHtml(companyName)}</h2>
        <div class="meta">
          ${company.phone ? `📞 ${escHtml(company.phone)} &nbsp;` : ""}
          ${company.email ? `✉️ ${escHtml(company.email)} &nbsp;` : ""}
          ${company.address ? `📍 ${escHtml(company.address)}` : ""}
        </div>
      </div>
      <div class="side">
        <div class="t">كتالوج المنتجات</div>
        <div class="st">${escHtml(today)} • ${list.length} صنف</div>
      </div>
    </div>

    ${activeFilters.length ? `<div class="filters-note"><b>الفلاتر المطبَّقة:</b> ${activeFilters.map(f => escHtml(f)).join(" • ")}</div>` : ""}

    <table class="products">
      <thead>
        <tr class="repeat-brand"><td colspan="${pv.showPrice ? 8 : 7}">${escHtml(companyName)} — كتالوج المنتجات</td></tr>
        <tr>
          <th class="c-num">#</th>
          <th class="c-img">الصورة</th>
          <th class="c-name">اسم المنتج</th>
          <th class="c-meta">الفئة</th>
          <th class="c-meta">الماركة</th>
          <th class="c-meta">المستودع</th>
          <th class="c-sku">SKU</th>
          ${pv.showPrice ? `<th class="c-price">السعر</th>` : ""}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="footer">${pv.showPrice ? "الكتالوج مع الأسعار — قابلة للتغيير." : "تم إنشاء الكتالوج تلقائياً — لا يحتوي على أسعار."}</div>
  </div>
  ${autoPrint ? `<script>
    window.addEventListener('load', () => {
      const imgs = Array.from(document.images);
      Promise.all(imgs.map(img => img.complete ? Promise.resolve() :
        new Promise(res => { img.onload = img.onerror = () => res(null); })
      )).then(() => setTimeout(() => window.print(), 300));
    });
  </script>` : ``}
</body>
</html>`;
      const w = window.open("", "_blank");
      if (!w) { toast.error("افتح نافذة المتصفح المنبثقة", { id: toastId }); return; }
      w.document.write(html);
      w.document.close();
      toast.success(`تم إنشاء الكتالوج بنجاح (${list.length} منتج)`, { id: toastId });
    } catch (e: any) {
      toast.error(e.message || "فشل التصدير", { id: toastId });
    } finally {
      setIsExportingPdf(false);
    }
  };




  const inputClass = "bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary w-full min-w-0";
  const selectClass = "bg-muted rounded-lg px-3 py-2 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary";
  const cellInput = "bg-transparent border border-border rounded px-2 py-1 text-sm w-full min-w-0 focus:ring-1 focus:ring-primary outline-none";
  const cellSelect = "bg-transparent border-0 outline-none px-1 text-xs w-full min-w-0 h-full focus:bg-primary/10";

  const pageTitle = isOutOfStockPage ? "المنتجات المنتهية" : isInStockPage ? "المنتجات المتوفرة" : isReportPage ? "تقرير كل المنتجات" : isPriceReport ? "تقرير الأسعار" : isAddPage ? "إضافة منتج جديد" : "إدارة جميع المنتجات";
  const emptyMessage = isOutOfStockPage ? "لا توجد منتجات منتهية" : isInStockPage ? "لا توجد منتجات متوفرة" : "لا توجد منتجات";

  // Show add form automatically on /products/add
  const shouldShowForm = showForm || isAddPage;

  // Determine which columns to show
  const showFilters = isAllProducts || isInStockPage || isOutOfStockPage || isPriceReport || isReportPage;

  // Excel-style filter popover (matches CustomersPage)
  const filterPopRef = useRef<HTMLDivElement | null>(null);
  const closeFilter = () => { setOpenFilter(null); setFilterQuery(""); setFilterHighlight(0); };
  useEffect(() => {
    if (!openFilter) return;
    const onDown = (e: MouseEvent) => {
      const el = filterPopRef.current;
      if (el && !el.contains(e.target as Node)) closeFilter();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFilter();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [openFilter]);

  // اختصار عام: Shift+Enter لتجميد المنتجات المحددة من أي مكان داخل الصفحة
  // (سواء التركيز على الجدول، الفلاتر، أو خارج أي input). يتجاهل الحقول النصية لتجنّب التداخل.
  useEffect(() => {
    if (!isAllProducts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !e.shiftKey) return;
      if (selectedIds.size === 0) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      // لا تعترض إذا المستخدم يكتب نصاً
      if (tag === "INPUT" || tag === "TEXTAREA" || (t as any)?.isContentEditable) {
        const inp = t as HTMLInputElement;
        // استثناء: checkboxes تسمح بالاختصار
        if (tag !== "INPUT" || (inp.type !== "checkbox")) return;
      }
      e.preventDefault();
      e.stopPropagation();
      freezeSelected();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isAllProducts, selectedIds]);


  const renderFilterPopover = (col: {
    key: string;
    kind: "text" | "select";
    value: string;
    setValue: (v: string) => void;
    options?: { value: string; label: string }[];
    placeholder?: string;
  }) => {
    const isOpen = openFilter?.key === col.key;
    if (!isOpen) return null;
    const filterActive = !!col.value;
    const opts = col.kind === "select" && filterQuery
      ? (col.options || []).filter(o => startsWithMatch(o.label, filterQuery))
      : (col.options || []);
    const onPopKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Tab") { closeFilter(); }
    };
    return (
      <div ref={filterPopRef} onKeyDown={onPopKeyDown} onClick={(e) => e.stopPropagation()} style={{ position: "absolute", insetInlineStart: 0, top: "100%", marginTop: 2, zIndex: 51, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: 6, minWidth: 200 }}>
          {col.kind === "text" ? (
            <div style={{ position: "relative" }}>
              <input
                autoFocus
                type="text"
                value={col.value}
                placeholder={col.placeholder}
                onChange={(e) => { col.setValue(e.target.value); setPage(1); }}
                onKeyDown={(e) => { if (e.key === "Escape") { setOpenFilter(null); setFilterQuery(""); } else if (e.key === "Enter") { setOpenFilter(null); } }}
                style={{ width: "100%", padding: "4px 22px 4px 6px", fontSize: 11, border: "1px solid hsl(var(--border))", borderRadius: 3, background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}
              />
              {col.value && (
                <button type="button" onClick={() => { col.setValue(""); setPage(1); }} title="مسح" style={{ position: "absolute", insetInlineEnd: 4, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "hsl(var(--muted-foreground))", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
              )}
            </div>
          ) : (
            <>
              <div style={{ position: "relative" }}>
                <input
                  autoFocus
                  type="text"
                  value={filterQuery}
                  placeholder="اكتب للبحث..."
                  onChange={(e) => { setFilterQuery(e.target.value); setFilterHighlight(0); }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { e.preventDefault(); setOpenFilter(null); setFilterQuery(""); }
                    else if (e.key === "ArrowDown") { e.preventDefault(); setFilterHighlight(h => Math.min(h + 1, opts.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setFilterHighlight(h => Math.max(h - 1, 0)); }
                    else if (e.key === "Enter") {
                      e.preventDefault();
                      const o = opts[filterHighlight];
                      if (o) { col.setValue(o.value); setPage(1); setOpenFilter(null); setFilterQuery(""); }
                    }
                  }}
                  style={{ width: "100%", padding: "4px 22px 4px 6px", fontSize: 11, border: "1px solid hsl(var(--border))", borderRadius: 3, background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}
                />
                {filterQuery && (
                  <button type="button" onClick={() => { setFilterQuery(""); setFilterHighlight(0); }} title="مسح البحث" style={{ position: "absolute", insetInlineEnd: 4, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "hsl(var(--muted-foreground))", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
                )}
              </div>
              <div style={{ maxHeight: 180, overflowY: "auto", marginTop: 4, border: "1px solid hsl(var(--border))", borderRadius: 3 }}>
                <button type="button" onClick={() => { col.setValue(""); setPage(1); setOpenFilter(null); setFilterQuery(""); }} style={{ display: "block", width: "100%", textAlign: "right", padding: "4px 6px", fontSize: 11, background: "transparent", border: "none", borderBottom: "1px solid hsl(var(--border))", cursor: "pointer", color: "hsl(var(--muted-foreground))" }}>— الكل —</button>
                {opts.length === 0 ? (
                  <div style={{ padding: "10px 6px", fontSize: 11, color: "hsl(var(--muted-foreground))", textAlign: "center" }}>
                    {filterQuery ? `لا نتائج لـ "${filterQuery}"` : "لا توجد عناصر"}
                  </div>
                ) : opts.map((o, i) => (
                  <button key={o.value} type="button"
                    onMouseEnter={() => setFilterHighlight(i)}
                    onClick={() => { col.setValue(o.value); setPage(1); setOpenFilter(null); setFilterQuery(""); }}
                    style={{ display: "block", width: "100%", textAlign: "right", padding: "4px 6px", fontSize: 11, background: i === filterHighlight ? "hsl(var(--primary) / 0.2)" : (col.value === o.value ? "hsl(var(--primary) / 0.1)" : "transparent"), border: "none", cursor: "pointer", color: "hsl(var(--foreground))" }}>{o.label}</button>
                ))}
              </div>
            </>
          )}
          {filterActive && (
            <button type="button" onClick={() => { col.setValue(""); setPage(1); setOpenFilter(null); setFilterQuery(""); }} style={{ marginTop: 4, width: "100%", padding: "3px 6px", fontSize: 10, border: "1px solid hsl(var(--border))", borderRadius: 3, background: "hsl(var(--muted))", cursor: "pointer" }}>✕ مسح الفلتر</button>
          )}
        </div>
    );
  };

  const headerClickFor = (key: string, kind: "text" | "select") => () => {
    if (openFilter?.key === key) { setOpenFilter(null); setFilterQuery(""); }
    else { setOpenFilter({ key, mode: kind === "select" ? "search" : "list" }); setFilterQuery(""); setFilterHighlight(0); }
  };

  const filterIndicator = (active: boolean) => (
    <span style={{ marginInlineStart: 4, fontSize: 9, color: active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>🔍</span>
  );

  return (
    <div className={`space-y-0`}>
      <article className="content invoices-compact desktop-on-mobile flex-1 flex flex-col">
        <style>{`
          .invoices-compact { font-size: 14px; font-weight: 600; }
          .invoices-compact .legacy-card { padding: 6px; }
          .invoices-compact h5 { font-size: 16px; margin: 4px 0; font-weight: 700; }
          .invoices-compact hr { margin: 4px 0; }
          .invoices-compact .legacy-dt-toolbar { font-size: 14px; gap: 8px; padding: 4px 0; font-weight: 600; }
          .invoices-compact .legacy-dt-toolbar input,
          .invoices-compact .legacy-dt-toolbar select { height: 28px; font-size: 14px; padding: 2px 6px; font-weight: 600; }
          .invoices-compact .legacy-table { font-size: 14px; border-collapse: separate; border-spacing: 0; font-weight: 600; }
          .invoices-compact .legacy-table th, .invoices-compact .legacy-table td {
            padding: 5px 8px; border-right: 1px solid hsl(var(--border)); border-bottom: 1px solid hsl(var(--border));
            font-weight: 600;
          }
          .invoices-compact .legacy-table td input,
          .invoices-compact .legacy-table td select,
          .invoices-compact .legacy-table td textarea,
          .invoices-compact .legacy-table td button,
          .invoices-compact .legacy-table td span { font-weight: 600; font-size: 14px; }
          .invoices-compact .legacy-table th { padding: 7px 8px; font-size: 14px; background: hsl(var(--muted)); font-weight: 700; }
          .invoices-compact .legacy-table thead tr.xls-filter th { background: hsl(var(--card)); padding: 2px 4px; }
          .invoices-compact .legacy-table thead tr.xls-filter input,
          .invoices-compact .legacy-table thead tr.xls-filter select {
            width: 100%; height: 24px; font-size: 13px; padding: 1px 4px; font-weight: 600;
            background: hsl(var(--background)); border: 1px solid hsl(var(--border)); border-radius: 3px; color: hsl(var(--foreground));
          }
          .invoices-compact .btn-xs { padding: 3px 8px; font-size: 13px; height: 26px; line-height: 20px; font-weight: 700; }
          .invoices-compact .legacy-actions { gap: 3px; display: inline-flex; }
          .invoices-compact .legacy-pagination { display: inline-flex; gap: 2px; padding: 0; margin: 8px 0; list-style: none; flex-wrap: wrap; }
          .invoices-compact .legacy-pagination .page-link { padding: 3px 10px; font-size: 14px; font-weight: 600; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); color: hsl(var(--foreground)); border-radius: 3px; cursor: pointer; }
          .invoices-compact .legacy-pagination .page-item.active .page-link { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-color: hsl(var(--primary)); }
          .invoices-compact .legacy-pagination .page-item.disabled .page-link { opacity: 0.4; cursor: not-allowed; }
          .invoices-compact .legacy-dt-info { font-size: 14px; padding: 4px 0; font-weight: 600; }
          .btn-xxs { padding: 1px 6px !important; font-size: 10px !important; line-height: 1.2 !important; min-height: 0 !important; height: 22px !important; border-radius: 3px !important; display: inline-flex; align-items: center; }
          .btn-xxs.btn-success { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border: 1px solid hsl(var(--primary)); }
          .btn-xxs.btn-warning { background: hsl(45 95% 55%); color: #000; border: 1px solid hsl(45 95% 50%); }
          .btn-xxs.btn-info { background: hsl(200 80% 50%); color: #fff; border: 1px solid hsl(200 80% 45%); text-decoration: none; }
        `}</style>
        <div className="legacy-card">
          <div className="grid_3 grid_4 table-responsive">
            <h5>{pageTitle}</h5>
            <hr />
            <div className="legacy-dt-toolbar" style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}>
              {isAllProducts && (
                <label>
                  عرض
                  <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={500}>500</option>
                  </select>
                  سجل
                </label>
              )}
              <label>بحث: <input type="search" placeholder="اسم/كود/فئة..." value={search} onChange={e => setSearch(e.target.value)} /></label>
              <span className="text-xs text-muted-foreground">{filtered.length} منتج</span>
              {isAllProducts && (
                !colsLocked ? (
                  <>
                    <button type="button" className="btn-xxs btn-success" title={COLS_BTN_SAVE_TITLE}
                      onClick={() => { try { setColsLocked(true); toast.success(COLS_TOAST_SAVED); } catch { toast.error(COLS_TOAST_SAVE_FAILED); } }}
                    >🔒</button>
                    <button
                      type="button"
                      className="btn-xxs"
                      title="تعيين عرض الأعمدة الحالي كافتراضي شخصي — يطبّق عند الضغط على إعادة الضبط"
                      style={{ background: "hsl(220 90% 55%)", color: "#fff", border: "none" }}
                      onClick={() => { saveColDefault(); toast.success("تم تعيين عرض الأعمدة كافتراضي"); }}
                    >★ افتراضي</button>
                    <button
                      type="button"
                      className="btn-xxs"
                      title="إعادة الضبط — يرجع للافتراضي الشخصي إن وجد، وإلا للافتراضي العام"
                      style={{ background: "hsl(0 70% 55%)", color: "#fff", border: "none" }}
                      onClick={() => { resetColWidths(); toast("تم إعادة الضبط"); }}
                    >↺ ضبط</button>
                  </>
                ) : (
                  <button type="button" className="btn-xxs btn-warning" title={COLS_BTN_EDIT_TITLE}
                    onClick={() => { setColsLocked(false); toast(COLS_TOAST_EDIT_MODE); }}
                  >✎</button>
                )
              )}
              <button type="button"
                className={rowsLocked ? "btn-xxs btn-warning" : "btn-xxs btn-success"}
                title={rowsLocked ? "تفعيل تغيير ارتفاع كل صف بسحب حافته السفلى" : "قفل ارتفاع الصفوف"}
                onClick={() => { setRowsLocked(v => !v); toast(rowsLocked ? "وضع تعديل ارتفاع الصفوف" : "تم قفل ارتفاع الصفوف"); }}
              >{rowsLocked ? "↕" : "🔒"}</button>
              <a href="/dev/fields-playground" target="_blank" rel="noopener" className="btn-xxs btn-info" title="فتح صفحة اختبار الحقول والقوائم">🧪</a>
              {activeFiltersCount > 0 && (
                <button type="button" className="btn-xxs btn-warning" onClick={clearFilters} title="مسح الفلاتر">
                  ✕ {activeFiltersCount}
                </button>
              )}
              {!isPriceReport && !isAddPage && (
                <button
                  onClick={() => { setShowForm(true); setEditId(null); resetForm(); }}
                  className="btn-xs btn-success"
                  style={{ fontSize: 12, marginInlineStart: "auto" }}
                >
                  + منتج جديد
                </button>
              )}
            </div>

            {/* Chips تصنيف سريعة */}
            {isAllProducts && (
              <div className="flex flex-wrap gap-2 mt-2" dir="rtl">
                {([
                  { v: "all", label: `الكل (${allProducts.length})` },
                  { v: "in", label: `متوفرة (${inStockCount})` },
                  { v: "low", label: `منخفضة (${lowStockCount})` },
                  { v: "out", label: `نافذة (${outOfStockCount})` },
                ] as { v: typeof stockFilter; label: string }[]).map(s => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setStockFilter(s.v)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition ${stockFilter === s.v ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}
                  >
                    {s.label}
                  </button>
                ))}
                {([
                  { v: "hide", label: "إخفاء المجمّدة" },
                  { v: "all", label: "إظهار الكل" },
                  { v: "only", label: "المجمّدة فقط" },
                ] as { v: typeof frozenMode; label: string }[]).map(f => (
                  <button
                    key={f.v}
                    type="button"
                    onClick={() => setFrozenMode(f.v)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition ${frozenMode === f.v ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}
                    title="عرض المنتجات بحسب حالة التجميد"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

      {/* Stat cards removed (Dashboard hidden) */}

      {/* Add/Edit form - Dialog (نمط نافذة العميل) */}
      <Dialog open={shouldShowForm} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditId(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden p-0" dir="rtl">
          <DialogHeader className="shrink-0 px-6 pt-6">
            <DialogTitle>{editId ? "تعديل المنتج" : "إضافة منتج جديد"}</DialogTitle>
          </DialogHeader>
          {shouldShowForm && (() => {
            const inp = "w-full min-w-0 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary";
            const lbl = "text-xs font-medium text-muted-foreground mb-1 block";
            const selWrap = `${inp} !p-0`;
            const selInner = "bg-transparent border-0 outline-none px-3 text-sm w-full min-w-0 h-full text-right truncate";
            let i = 0;
            const idx = () => i++;
            return (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-2">
                  {/* الصف 1: اسم المنتج | كود | الوحدة */}
                  {(() => { const k = idx(); return (
                    <div>
                      <label className={lbl}>اسم المنتج *</label>
                      <input ref={el => fieldRefs.current[k] = el} value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        onKeyDown={handleFieldEnter(k)}
                        onFocus={(e) => { try { e.target.select(); } catch {} }}
                        className={inp} placeholder="أدخل اسم المنتج" />
                    </div>
                  ); })()}

                  {(() => { const k = idx(); return (
                    <div>
                      <label className={lbl}>كود المنتج</label>
                      <input ref={el => fieldRefs.current[k] = el} value={form.sku}
                        onChange={e => setForm({ ...form, sku: e.target.value })}
                        onKeyDown={handleFieldEnter(k)}
                        onFocus={(e) => { try { e.target.select(); } catch {} }}
                        className={inp} placeholder="SKU" />
                    </div>
                  ); })()}

                  {(() => { const k = idx(); return (
                    <div>
                      <label className={lbl}>الوحدة</label>
                      <input ref={el => fieldRefs.current[k] = el} value={form.unit}
                        onChange={e => setForm({ ...form, unit: e.target.value })}
                        onKeyDown={handleFieldEnter(k)}
                        onFocus={(e) => { try { e.target.select(); } catch {} }}
                        className={inp} placeholder="قطعة" />
                    </div>
                  ); })()}

                  {/* الصف 2: الفئات | الماركات | المستودع */}
                  {(() => { const k = idx(); return (
                    <div>
                      <label className={lbl}>الفئات (يمكن اختيار أكثر من فئة)</label>
                      <div className={selWrap} style={{ minHeight: 38 }}>
                        <InlineSearchSelect
                          ref={(h) => { fieldRefs.current[k] = h as Focusable; }}
                          value=""
                          options={availableCategories.map((c: any) => ({ value: c.id, label: c.name }))}
                          onChange={(v) => addCatToSelection(v)}
                          onAdd={async (name) => {
                            const id = await createCategoryInline(name);
                            if (id) addCatToSelection(id);
                            return id;
                          }}
                          onNavigateNext={() => focusAt(k + 1)}
                          placeholder="-- ابحث أو أضف فئة --"
                          addLabel="إضافة فئة"
                          className={selInner}
                        />
                      </div>
                      {selectedCategoryObjects.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {selectedCategoryObjects.map((c: any) => (
                            <span key={c.id} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-md">
                              {c.name}
                              <button type="button" onClick={() => removeCatFromSelection(c.id)} className="hover:opacity-70" aria-label={`حذف ${c.name}`}>
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ); })()}

                  {(() => { const k = idx(); return (
                    <div>
                      <label className={lbl}>الماركات (يمكن اختيار أكثر من ماركة)</label>
                      <div className={selWrap} style={{ minHeight: 38 }}>
                        <InlineSearchSelect
                          ref={(h) => { fieldRefs.current[k] = h as Focusable; }}
                          value=""
                          options={availableBrands.map((b: any) => ({ value: b.id, label: b.name }))}
                          onChange={(v) => addBrandToSelection(v)}
                          onAdd={async (name) => {
                            const id = await createCompanyInline(name);
                            if (id) addBrandToSelection(id);
                            return id;
                          }}
                          onNavigateNext={() => focusAt(k + 1)}
                          placeholder="-- ابحث أو أضف ماركة --"
                          addLabel="إضافة ماركة"
                          className={selInner}
                        />
                      </div>
                      {selectedBrandObjects.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {selectedBrandObjects.map((b: any) => (
                            <span key={b.id} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-md">
                              {b.name}
                              <button type="button" onClick={() => removeBrandFromSelection(b.id)} className="hover:opacity-70" aria-label={`حذف ${b.name}`}>
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ); })()}

                  {(() => { const k = idx(); return (
                    <div>
                      <label className={lbl}>المستودع</label>
                      <div className={selWrap} style={{ minHeight: 38 }}>
                        <InlineSearchSelect
                          ref={(h) => { fieldRefs.current[k] = h as Focusable; }}
                          value={form.warehouse_id}
                          options={(warehouses || []).map((w: any) => ({ value: w.id, label: w.name }))}
                          onChange={(v) => setForm({ ...form, warehouse_id: v })}
                          onAdd={createWarehouseInline}
                          onNavigateNext={() => focusAt(k + 1)}
                          placeholder="-- ابحث أو أضف مستودع --"
                          addLabel="إضافة مستودع"
                          className={selInner}
                        />
                      </div>
                    </div>
                  ); })()}

                  {/* الصف 3: المورد | سعر الجملة | سعر القطاعي */}
                  {(() => { const k = idx(); return (
                    <div>
                      <label className={lbl}>المورد</label>
                      <div className={selWrap} style={{ minHeight: 38 }}>
                        <InlineSearchSelect
                          ref={(h) => { fieldRefs.current[k] = h as Focusable; }}
                          value={form.supplier_id}
                          options={(suppliers || []).map((s: any) => ({ value: s.id, label: s.name }))}
                          onChange={(v) => setForm({ ...form, supplier_id: v })}
                          onAdd={createSupplierInline}
                          onNavigateNext={() => focusAt(k + 1)}
                          placeholder="-- ابحث أو أضف مورد --"
                          addLabel="إضافة مورد"
                          className={selInner}
                        />
                      </div>
                    </div>
                  ); })()}

                  {(() => { const k = idx(); return (
                    <div>
                      <label className={lbl}>سعر الجملة</label>
                      <input ref={el => fieldRefs.current[k] = el} type="number" value={form.purchase_price}
                        onChange={e => setForm({ ...form, purchase_price: e.target.value })}
                        onKeyDown={handleFieldEnter(k)} onFocus={handleNumFocus} className={inp} placeholder="0.00" />
                    </div>
                  ); })()}

                  {(() => { const k = idx(); return (
                    <div>
                      <label className={lbl}>سعر القطاعي</label>
                      <input ref={el => fieldRefs.current[k] = el} type="number" value={form.sale_price}
                        onChange={e => setForm({ ...form, sale_price: e.target.value })}
                        onKeyDown={handleFieldEnter(k)} onFocus={handleNumFocus} className={inp} placeholder="0.00" />
                      {(() => {
                        const pVal = parseFloat(form.purchase_price) || 0;
                        const sVal = parseFloat(form.sale_price) || 0;
                        if (pVal > 0 && sVal > 0) {
                          const diff = sVal - pVal;
                          const percent = (diff / pVal) * 100;
                          return (
                            <div className="text-[11px] mt-1 flex gap-2 justify-end font-bold">
                              <span className={diff >= 0 ? "text-green-500" : "text-red-500"}>
                                الربح: {diff.toFixed(2)}
                              </span>
                              <span className={diff >= 0 ? "text-green-500" : "text-red-500"}>
                                ({percent.toFixed(1)}%)
                              </span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  ); })()}

                  {/* الصف 4: سعر الأجنبي | الكمية | الحد الأدنى */}
                  {(() => { const k = idx(); return (
                    <div>
                      <label className={lbl}>سعر الأجنبي</label>
                      <input ref={el => fieldRefs.current[k] = el} type="number" value={form.foreign_price}
                        onChange={e => setForm({ ...form, foreign_price: e.target.value })}
                        onKeyDown={handleFieldEnter(k)} onFocus={handleNumFocus} className={inp} placeholder="0.00" />
                      {(() => {
                        const fVal = parseFloat(form.foreign_price) || 0;
                        if (fVal > 0) {
                          return (
                            <div className="text-[11px] mt-1 text-muted-foreground font-semibold text-left">
                              يعادل: {(fVal * exchangeRate).toFixed(2)} (صرف: {exchangeRate})
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  ); })()}

                  {(() => { const k = idx(); return (
                    <div>
                      <label className={lbl}>
                        الوحدات بالمخزن
                        {editId && <span className="text-[10px] text-muted-foreground mr-1">(تُحسب من حركات المخزون)</span>}
                      </label>
                      <input ref={el => fieldRefs.current[k] = el} type="number" value={form.stock_quantity}
                        onChange={e => setForm({ ...form, stock_quantity: e.target.value })}
                        onKeyDown={handleFieldEnter(k)} onFocus={handleNumFocus}
                        disabled={!!editId}
                        readOnly={!!editId}
                        title={editId ? "تُحدَّث تلقائياً من الفواتير والمرتجعات والتحويلات" : ""}
                        className={`${inp} ${editId ? "opacity-60 cursor-not-allowed" : ""}`} placeholder="0" />
                    </div>
                  ); })()}

                  {(() => { const k = idx(); return (
                    <div>
                      <label className={lbl}>الحد الأدنى للتنبيه</label>
                      <input ref={el => fieldRefs.current[k] = el} type="number" value={form.min_stock}
                        onChange={e => setForm({ ...form, min_stock: e.target.value })}
                        onKeyDown={handleFieldEnter(k)} onFocus={handleNumFocus} className={inp} placeholder="0" />
                    </div>
                  ); })()}

                  {/* الوصف بعرض كامل */}
                  {(() => { const k = idx(); return (
                    <div className="md:col-span-3">
                      <label className={lbl}>الوصف</label>
                      <textarea ref={el => fieldRefs.current[k] = el} value={form.description}
                        onChange={e => setForm({ ...form, description: e.target.value })}
                        className={inp + " min-h-[80px]"} />
                    </div>
                  ); })()}

                  {/* صورة + تجميد */}
                  <div className="md:col-span-3">
                    <label className={lbl}>صورة المنتج</label>
                    <div className="flex items-center gap-4 flex-wrap">
                      {form.image_url ? (
                        <div className="relative">
                          <img src={form.image_url} alt="معاينة" className="w-24 h-24 rounded-lg object-cover border border-border" />
                          <button type="button" onClick={() => setForm({ ...form, image_url: "" })}
                            className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90"
                            aria-label="حذف الصورة">
                            <X size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => startRecrop(form.image_url, async (cropped) => {
                              setUploadingImage(true);
                              try {
                                const { uploadProductImage } = await import("@/utils/productImageUpload");
                                const url = await uploadProductImage(cropped);
                                setForm(f => ({ ...f, image_url: url }));
                                toast.success("تم تحديث الصورة بعد إعادة القص");
                              } catch (err: any) {
                                toast.error(err.message || "فشل رفع الصورة");
                              } finally {
                                setUploadingImage(false);
                              }
                            })}
                            className="absolute -bottom-2 -left-2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90"
                            aria-label="إعادة قص الصورة"
                            title="إعادة قص"
                          >
                            <Scissors size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="w-24 h-24 rounded-lg bg-muted border border-dashed border-border flex items-center justify-center">
                          <PackageIcon size={28} className="text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex flex-col gap-2">
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}
                          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
                          <Upload size={16} />
                          {uploadingImage ? "جاري الرفع..." : form.image_url ? "تغيير الصورة" : "اختر صورة"}
                        </button>
                        <span className="text-xs text-muted-foreground">من المعرض أو الكاميرا أو الملفات (حد أقصى 5 ميجابايت)</span>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={form.is_frozen}
                        onChange={e => setForm({ ...form, is_frozen: e.target.checked })} className="w-4 h-4" />
                      <span className="text-sm text-foreground">تجميد الصنف (إخفاء من الفواتير وعروض الأسعار)</span>
                    </label>
                  </div>
                </div>

                <DialogFooter className="gap-2 flex-row-reverse items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setShowForm(false); setEditId(null); }}
                      className="px-5 py-2 rounded-lg text-sm bg-muted text-foreground">إلغاء</button>
                    <button ref={saveBtnRef} onClick={handleSubmit}
                      className="px-5 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:opacity-90">
                      {editId ? "تحديث" : "حفظ"}
                    </button>
                  </div>
                  {!editId && (
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={keepFields}
                        onChange={e => setKeepFields(e.target.checked)} className="w-4 h-4" />
                      <span className="text-xs text-muted-foreground font-semibold">تثبيت الفئة والمستودع والمورد للإضافة التالية</span>
                    </label>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>


      {/* شريط الفلترة العلوي — للتقارير فقط (في إدارة المنتجات الفلترة من رؤوس الأعمدة) */}
      {showFilters && !isAllProducts && (
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <div className="responsive-filters">
            <div className="filter-item">
              <label className="text-sm text-muted-foreground">اسم الصنف:</label>
              <div className="input-wrap flex items-center bg-muted rounded-lg px-3 py-2 min-w-0">
                <Search size={14} className="text-muted-foreground ml-2 shrink-0" />
                <input type="text" placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-transparent border-none outline-none text-sm flex-1 min-w-0 text-foreground" />
              </div>
            </div>
            <div className="filter-item">
              <label className="text-sm text-muted-foreground">الفئة:</label>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className={selectClass}>
                <option value="">الكل</option>
                {(categories || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="filter-item">
              <label className="text-sm text-muted-foreground">الماركة:</label>
              <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className={selectClass}>
                <option value="">الكل</option>
                {(companies || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="filter-item">
              <label className="text-sm text-muted-foreground">حالة التوفر:</label>
              <select value={stockFilter} onChange={e => setStockFilter(e.target.value as any)} className={selectClass}>
                <option value="all">الكل</option>
                <option value="in">المتوفرة</option>
                <option value="out">المنتهية</option>
              </select>
            </div>
            <div className="filter-item">
              <label className="text-sm text-muted-foreground">المستودع:</label>
              <select value={filterWarehouse} onChange={e => setFilterWarehouse(e.target.value)} className={selectClass}>
                <option value="">الكل</option>
                {(warehouses || []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="filter-item">
              <label className="text-sm text-muted-foreground">المورد:</label>
              <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} className={selectClass}>
                <option value="">الكل</option>
                {(suppliers || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="filter-item">
              <label className="text-sm text-muted-foreground">التجميد:</label>
              <select value={frozenMode} onChange={e => setFrozenMode(e.target.value as any)} className={selectClass}>
                <option value="hide">إخفاء المجمّدة</option>
                <option value="all">إظهار الكل</option>
                <option value="only">المجمّدة فقط</option>
              </select>
            </div>
            {isAllProducts && (
              <div className="flex items-center gap-2 md:ml-auto col-span-full sm:col-span-2 md:col-span-1">
                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={openPdfPreview}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
                  title="فتح معاينة PDF مع فلاتر وترتيب قبل الطباعة"
                >
                  <FileDown size={16} /> {isExportingPdf ? "جارٍ الإنشاء..." : "معاينة / طباعة PDF"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Products table */}
      <div className="legacy-card card-block">
        {!showFilters && !isAllProducts && (
          <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center bg-muted rounded-lg px-3 py-2 max-w-sm w-full min-w-0">
              <Search size={16} className="text-muted-foreground ml-2" />
              <input type="text" placeholder="بحث عن منتج..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-transparent border-none outline-none text-sm flex-1 text-foreground placeholder:text-muted-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">{filtered.length} منتج</span>
          </div>
        )}
        {isAllProducts && (
          <div className="p-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-muted-foreground">{sortedFiltered.length} منتج</span>
              <button
                type="button"
                onClick={() => setNameSortDir(nameSortDir === "none" ? "asc" : nameSortDir === "asc" ? "desc" : "none")}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border ${nameSortDir === "none" ? "bg-muted border-border text-foreground" : "bg-primary/10 border-primary text-primary"}`}
                title="ترتيب أبجدي حسب اسم المنتج"
              >
                {nameSortDir === "asc" ? "أ↓ ي" : nameSortDir === "desc" ? "ي↓ أ" : "ترتيب أبجدي"}
              </button>
            </div>
            <button
              type="button"
              disabled={isExportingPdf}
              onClick={openPdfPreview}
              className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
              title="فتح معاينة PDF مع فلاتر وترتيب قبل الطباعة"
            >
              <FileDown size={16} /> {isExportingPdf ? "جارٍ الإنشاء..." : "معاينة / طباعة PDF"}
            </button>
          </div>
        )}


        <style>{mobileDocListCSS}</style>
        <style>{`
          .products-grid td:focus-within,
          .products-grid th:focus-within {
            outline: 2px solid hsl(var(--primary));
            outline-offset: -2px;
            background: hsl(var(--primary) / 0.10) !important;
            box-shadow: inset 0 0 0 9999px hsl(var(--primary) / 0.06);
          }
          .products-grid tr:focus-within > td { background: hsl(var(--primary) / 0.04); }
          .products-grid input:focus,
          .products-grid select:focus,
          .products-grid textarea:focus {
            outline: none;
            box-shadow: 0 0 0 2px hsl(var(--primary) / 0.45);
            border-color: hsl(var(--primary)) !important;
          }
          .products-grid tr.odd > td { background: hsl(var(--card)); }
          .products-grid tr.even > td { background: hsl(var(--muted) / 0.35); }
          .products-grid tr:hover > td { background: hsl(var(--primary) / 0.06) !important; }
        `}</style>

        {isAllProducts && (selectedIds.size > 0 || onlyFrozen) && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            padding: "6px 10px", marginBottom: 6, borderRadius: 6,
            background: "hsl(var(--primary) / 0.10)", border: "1px solid hsl(var(--primary) / 0.35)",
            fontSize: 12, flexWrap: "wrap",
          }}>
            <span style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>
              {selectedIds.size > 0 ? (
                <>تم تحديد {selectedIds.size} منتج {!onlyFrozen && <>— اضغط <kbd style={{ padding: "1px 6px", background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 4 }}>Shift</kbd>+<kbd style={{ padding: "1px 6px", background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 4 }}>Enter</kbd> للتجميد</>}</>
              ) : (
                <>وضع المجمّدة فقط — يمكنك تحديد منتجات لفكّ تجميدها</>
              )}
            </span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" className="btn-xs" onClick={selectAllVisible} title="تحديد كل المنتجات المعروضة في الصفحة">
                تحديد كل المعروض
              </button>
              {selectedIds.size > 0 && onlyFrozen && (
                <button type="button" className="btn-xs btn-primary" onClick={unfreezeSelected}>
                  <Snowflake size={12} /> فكّ تجميد المحدد
                </button>
              )}
              {selectedIds.size > 0 && !onlyFrozen && (
                <button type="button" className="btn-xs btn-primary" onClick={freezeSelected}>
                  <Snowflake size={12} /> تجميد المحدد
                </button>
              )}
              {selectedIds.size > 0 && (
                <button type="button" className="btn-xs" onClick={() => setSelectedIds(new Set())}>إلغاء التحديد</button>
              )}
            </div>
          </div>
        )}

        <div
          className={`items-scroll products-grid products-desktop-table`}
          style={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto", overflowX: "auto", border: "1px solid hsl(var(--border))", borderRadius: 4 }}
          onKeyDown={(e) => {
            if (!isAllProducts) return;
            // Shift+Enter لتجميد المنتجات المحددة دفعة واحدة
            if (e.key === "Enter" && e.shiftKey && selectedIds.size > 0) {
              e.preventDefault();
              freezeSelected();
              return;
            }
            const target = e.target as HTMLElement;
            if (!target) return;
            const isFocusable = ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName) || target.hasAttribute("tabindex");
            if (!isFocusable) return;
            const isArrow = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key);
            const isEnter = e.key === "Enter";
            if (!isArrow && !isEnter) return;
            if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && target.tagName === "INPUT") {
              const inp = target as HTMLInputElement;
              if (inp.type !== "checkbox" && inp.selectionStart !== inp.selectionEnd) return;
              if (inp.type !== "checkbox" && inp.selectionStart !== 0 && e.key === "ArrowLeft") return;
              if (inp.type !== "checkbox" && inp.selectionStart !== inp.value.length && e.key === "ArrowRight") return;
            }
            // For native <select>: arrows must not open the menu nor change the value.
            // Enter opens it; Backspace/Escape closes (handled by browser) and we keep nav.
            if (isArrow && target.tagName === "SELECT") {
              e.preventDefault();
              // fall through so arrow nav between cells still runs
            }
            if (isEnter && target.tagName === "SELECT") return; // let browser open the dropdown
            if (isEnter && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
            const cell = target.closest("td,th") as HTMLElement | null;
            const row = target.closest("tr") as HTMLTableRowElement | null;
            const tbody = row?.parentElement as HTMLElement | null;
            if (!cell || !row || !tbody) return;
            const cellIdx = Array.from(row.children).indexOf(cell);
            const rows = Array.from(tbody.querySelectorAll(":scope > tr")) as HTMLTableRowElement[];
            const rowIdx = rows.indexOf(row);
            const focusIn = (r: HTMLTableRowElement | undefined, ci: number) => {
              if (!r) return false;
              const c = r.children[ci] as HTMLElement | undefined;
              if (!c) return false;
              const f = c.querySelector("input,select,textarea,button,[tabindex]") as HTMLElement | null;
              if (!f) return false;
              e.preventDefault();
              f.focus();
              if (f.tagName === "INPUT" && (f as HTMLInputElement).type !== "checkbox") {
                try { (f as HTMLInputElement).select(); } catch {}
              }
              return true;
            };
            if (e.key === "ArrowDown" || (isEnter && !e.shiftKey)) {
              for (let r = rowIdx + 1; r < rows.length; r++) if (focusIn(rows[r], cellIdx)) return;
            } else if (e.key === "ArrowUp" || (isEnter && e.shiftKey)) {
              for (let r = rowIdx - 1; r >= 0; r--) if (focusIn(rows[r], cellIdx)) return;
            } else if (e.key === "ArrowRight") {
              for (let ci = cellIdx - 1; ci >= 0; ci--) if (focusIn(row, ci)) return;
            } else if (e.key === "ArrowLeft") {
              for (let ci = cellIdx + 1; ci < row.children.length; ci++) if (focusIn(row, ci)) return;
            }
          }}
        >
          <table
            className="legacy-table"
            cellSpacing={0}
            style={{ width: "100%", tableLayout: isAllProducts ? "fixed" : "auto" }}
            {...(isAllProducts ? tableProps : {})}
          >
            {isAllProducts && (
              <colgroup>
                {(() => {
                  return colWidths.map((w, i) => {
                    const defW = colMinWidths[i] ?? undefined;
                    const px = w != null ? w : (defW ?? 100);
                    return <col key={i} style={{ width: `${px}px`, minWidth: 24 }} />;
                  });
                })()}
              </colgroup>
            )}
            <thead style={{ position: "sticky", top: 0, zIndex: 5, background: "hsl(var(--card))" }}>
              <tr>
                <th className="text-right px-2 py-3 font-semibold text-muted-foreground" style={isAllProducts ? { position: "relative" } : undefined}>
                  {isAllProducts ? (
                    <div className="flex items-center gap-1.5 justify-center" title="تحديد كل المعروض (Shift+Enter لتجميد المحدد)">
                      <input
                        type="checkbox"
                        checked={paginated.length > 0 && paginated.every((p: any) => selectedIds.has(p.id))}
                        ref={el => { if (el) el.indeterminate = paginated.some((p: any) => selectedIds.has(p.id)) && !paginated.every((p: any) => selectedIds.has(p.id)); }}
                        onChange={(e) => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) paginated.forEach((p: any) => next.add(p.id));
                            else paginated.forEach((p: any) => next.delete(p.id));
                            return next;
                          });
                        }}
                        className="w-3.5 h-3.5"
                      />
                      <span className="text-[11px]">#</span>
                    </div>
                  ) : "#"}
                  {isAllProducts && <ColumnResizeHandle onMouseDown={(e) => startColDrag(0, e)} hidden={colsLocked} />}
                </th>
                <th
                  className="text-right px-5 py-3 font-semibold text-muted-foreground"
                  style={isAllProducts ? { position: "relative", cursor: "pointer", background: filterName ? "hsl(var(--primary) / 0.15)" : undefined, userSelect: "none" } : undefined}
                  onClick={isAllProducts ? headerClickFor("name", "text") : undefined}
                  title={isAllProducts ? "ضغطة للفلترة" : undefined}
                >
                  اسم المنتج{isAllProducts && filterIndicator(!!filterName)}
                  {isAllProducts && renderFilterPopover({ key: "name", kind: "text", value: filterName, setValue: setFilterName, placeholder: "بحث بالاسم..." })}
                  {isAllProducts && <ColumnResizeHandle onMouseDown={(e) => { e.stopPropagation(); startColDrag(1, e); }} hidden={colsLocked} />}
                </th>
                {isPriceReport ? (
                  <th className="text-right px-5 py-3 font-semibold text-muted-foreground">السعر المحلي</th>
                ) : (isInStockPage || isOutOfStockPage) ? (
                  <>
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الكود</th>
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الكمية</th>
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">السعر المحلي</th>
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">المستودع</th>
                  </>
                ) : isReportPage ? (
                  <>
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الصورة</th>
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الفئة</th>
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الماركة</th>
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">المستودع</th>
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الكمية</th>
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">إجراءات</th>
                  </>
                ) : (
                  <>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground" style={{ position: "relative", cursor: "pointer", background: filterCategory ? "hsl(var(--primary) / 0.15)" : undefined, userSelect: "none" }} onClick={headerClickFor("category", "select")} title="ضغطة للفلترة">
                      الفئة{filterIndicator(!!filterCategory)}
                      {renderFilterPopover({ key: "category", kind: "select", value: filterCategory, setValue: setFilterCategory, options: (categories || []).map((c: any) => ({ value: c.id, label: c.name })) })}
                      <ColumnResizeHandle onMouseDown={(e) => { e.stopPropagation(); startColDrag(2, e); }} hidden={colsLocked} />
                    </th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground" style={{ position: "relative", cursor: "pointer", background: filterCompany ? "hsl(var(--primary) / 0.15)" : undefined, userSelect: "none" }} onClick={headerClickFor("company", "select")} title="ضغطة للفلترة">
                      الماركة{filterIndicator(!!filterCompany)}
                      {renderFilterPopover({ key: "company", kind: "select", value: filterCompany, setValue: setFilterCompany, options: (companies || []).map((c: any) => ({ value: c.id, label: c.name })) })}
                      <ColumnResizeHandle onMouseDown={(e) => { e.stopPropagation(); startColDrag(3, e); }} hidden={colsLocked} />
                    </th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground" style={{ position: "relative", cursor: "pointer", background: filterWarehouse ? "hsl(var(--primary) / 0.15)" : undefined, userSelect: "none" }} onClick={headerClickFor("warehouse", "select")} title="ضغطة للفلترة">
                      المستودع{filterIndicator(!!filterWarehouse)}
                      {renderFilterPopover({ key: "warehouse", kind: "select", value: filterWarehouse, setValue: setFilterWarehouse, options: (warehouses || []).map((w: any) => ({ value: w.id, label: w.name })) })}
                      <ColumnResizeHandle onMouseDown={(e) => { e.stopPropagation(); startColDrag(4, e); }} hidden={colsLocked} />
                    </th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground" style={{ position: "relative" }}>السعر<ColumnResizeHandle onMouseDown={(e) => { e.stopPropagation(); startColDrag(5, e); }} hidden={colsLocked} /></th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground" style={{ position: "relative" }}>السعر الأجنبي<ColumnResizeHandle onMouseDown={(e) => { e.stopPropagation(); startColDrag(6, e); }} hidden={colsLocked} /></th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground" style={{ position: "relative" }}>الصورة<ColumnResizeHandle onMouseDown={(e) => { e.stopPropagation(); startColDrag(7, e); }} hidden={colsLocked} /></th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground" style={{ position: "relative", cursor: "pointer", background: filterSupplier ? "hsl(var(--primary) / 0.15)" : undefined, userSelect: "none" }} onClick={headerClickFor("supplier", "select")} title="ضغطة للفلترة">
                      المورد{filterIndicator(!!filterSupplier)}
                      {renderFilterPopover({ key: "supplier", kind: "select", value: filterSupplier, setValue: setFilterSupplier, options: (suppliers || []).map((s: any) => ({ value: s.id, label: s.name })) })}
                      <ColumnResizeHandle onMouseDown={(e) => { e.stopPropagation(); startColDrag(8, e); }} hidden={colsLocked} />
                    </th>
                    <th className="text-center px-3 py-3 font-semibold text-muted-foreground" style={{ position: "relative" }}>
                      <div className="flex flex-col items-center gap-1">
                        <span className="inline-flex items-center gap-1"><Snowflake size={12} /> تجميد</span>
                        <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={filtered.length > 0 && filtered.every((p: any) => p.is_frozen)}
                            onChange={(e) => toggleAllFrozen(e.target.checked)}
                          />
                          تحديد الكل
                        </label>
                      </div>
                      <ColumnResizeHandle onMouseDown={(e) => { e.stopPropagation(); startColDrag(9, e); }} hidden={colsLocked} />
                    </th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground" style={{ position: "relative" }}>إعدادات<ColumnResizeHandle onMouseDown={(e) => { e.stopPropagation(); startColDrag(10, e); }} hidden={colsLocked} /></th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {isAllProducts && (
                <tr style={{ background: "hsl(var(--primary) / 0.06)", borderBottom: "2px solid hsl(var(--primary) / 0.3)" }}>
                  <td style={{ textAlign: "center", fontWeight: 700, color: "hsl(var(--primary))" }}>+</td>
                  <td>
                    <input type="text" value={quickAdd.name}
                      onChange={e => setQuickAdd({ ...quickAdd, name: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") handleQuickAdd(); }}
                      placeholder="اسم منتج جديد..." disabled={quickSaving}
                      className="bg-background border border-border rounded px-1 py-0.5 text-[12px] w-full min-w-0 font-medium" />
                  </td>
                  <td>
                    <InlineSearchSelect value={quickAdd.category_id}
                      options={(categories || []).map((c: any) => ({ value: c.id, label: c.name }))}
                      onChange={v => setQuickAdd({ ...quickAdd, category_id: v })}
                      onAdd={createCategoryInline} placeholder="— الفئة —" addLabel="إضافة فئة" disabled={quickSaving} />
                  </td>
                  <td>
                    <InlineSearchSelect value={quickAdd.company_id}
                      options={(companies || []).map((c: any) => ({ value: c.id, label: c.name }))}
                      onChange={v => setQuickAdd({ ...quickAdd, company_id: v })}
                      onAdd={createCompanyInline} placeholder="— الماركة —" addLabel="إضافة ماركة" disabled={quickSaving} />
                  </td>
                  <td>
                    <InlineSearchSelect value={quickAdd.warehouse_id}
                      options={(warehouses || []).map((w: any) => ({ value: w.id, label: w.name }))}
                      onChange={v => setQuickAdd({ ...quickAdd, warehouse_id: v })}
                      onAdd={createWarehouseInline} placeholder="— المستودع —" addLabel="إضافة مستودع" disabled={quickSaving} />
                  </td>
                  <td>
                    <input type="number" value={quickAdd.sale_price}
                      onChange={e => setQuickAdd({ ...quickAdd, sale_price: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") handleQuickAdd(); }}
                      placeholder="0" disabled={quickSaving}
                      className="bg-background border border-border rounded px-1 py-0.5 text-[11px] w-full min-w-0 tabular-nums" />
                  </td>
                  <td>
                    <input type="number" value={quickAdd.foreign_price}
                      onChange={e => setQuickAdd({ ...quickAdd, foreign_price: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") handleQuickAdd(); }}
                      placeholder="—" disabled={quickSaving}
                      className="bg-background border border-border rounded px-1 py-0.5 text-[11px] w-full min-w-0 tabular-nums" />
                  </td>
                  <td style={{ textAlign: "center", color: "hsl(var(--muted-foreground))" }}>—</td>
                  <td>
                    <InlineSearchSelect value={quickAdd.supplier_id}
                      options={(suppliers || []).map((s: any) => ({ value: s.id, label: s.name }))}
                      onChange={v => setQuickAdd({ ...quickAdd, supplier_id: v })}
                      onAdd={createSupplierInline} placeholder="— المورد —" addLabel="إضافة مورد" disabled={quickSaving} />
                  </td>
                  <td style={{ textAlign: "center", color: "hsl(var(--muted-foreground))" }}>—</td>
                  <td style={{ textAlign: "center" }}>
                    <button type="button" onClick={handleQuickAdd}
                      disabled={quickSaving || !quickAdd.name.trim()}
                      className="btn-xs btn-success" title="إضافة (Enter)">
                      {quickSaving ? "..." : "➕"}
                    </button>
                  </td>
                </tr>
              )}
              {(() => {
                const totalCols = isPriceReport ? 3 : (isInStockPage || isOutOfStockPage) ? 6 : isReportPage ? 8 : 11;
                if (isLoading) return <tr><td colSpan={totalCols} className="text-center py-8 text-muted-foreground">جاري تحميل المنتجات...</td></tr>;
                if (error) return <tr><td colSpan={totalCols} className="text-center py-8 text-destructive">تعذر تحميل المنتجات</td></tr>;
                if (paginated.length === 0) return <tr><td colSpan={totalCols} className="text-center py-8 text-muted-foreground">{emptyMessage}</td></tr>;
                return null;
              })()}
              {!isLoading && !error && paginated.length > 0 && paginated.map((p: any, idx: number) => {
                const rowH = getRowH(p.id);
                return (
                <tr
                  key={p.id}
                  tabIndex={0}
                  data-row-uid={p.id}
                  data-nav-table="products"
                  data-nav-row={idx}
                  data-nav-col="row"
                  data-nospace-delete
                  className={`${(isAllProducts ? ((page - 1) * perPage + idx) : idx) % 2 === 0 ? "odd" : "even"} ${isRowPendingDelete(p.id) ? "row-pending-delete-products" : ""}`}

                  style={{
                    position: "relative",
                    outline: "none",
                    ...(rowH ? { height: rowH } : {}),
                    ...(isRowPendingDelete(p.id)
                      ? { background: "hsl(0 84% 60% / 0.18)", boxShadow: "inset 0 0 0 2px hsl(0 84% 60% / 0.55)" }
                      : {}),
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      const dir = e.key === "ArrowDown" ? 1 : -1;
                      const nextIdx = idx + dir;
                      const next = document.querySelector<HTMLElement>(
                        `[data-nav-table="products"][data-nav-row="${nextIdx}"][data-nav-col="row"]`
                      );
                      if (next) {
                        e.preventDefault();
                        next.focus();
                        // Shift+Arrow extends selection from the anchor
                        if (e.shiftKey) {
                          selectWithModifiers(nextIdx, { shift: true, ctrl: e.ctrlKey || e.metaKey });
                        }
                      }
                    } else if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
                      e.preventDefault();
                      selectAllVisible();
                    }
                  }}
                  onClick={(e) => {
                    // Row click with Ctrl/Shift enables multi-select; ignore clicks originating from
                    // form controls so cell editing still works normally.
                    const tgt = e.target as HTMLElement;
                    if (tgt.closest('input,select,textarea,button,a,label')) return;
                    if (e.shiftKey || e.ctrlKey || e.metaKey) {
                      e.preventDefault();
                      selectWithModifiers(idx, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
                    }
                  }}
                  onMouseMove={(e) => {
                    if (rowsLocked) return;
                    const tr = e.currentTarget as HTMLTableRowElement;
                    const rect = tr.getBoundingClientRect();
                    tr.style.cursor = rect.bottom - e.clientY <= 6 ? "row-resize" : "";
                  }}
                  onMouseDown={(e) => {
                    if (rowsLocked) return;
                    const tr = e.currentTarget as HTMLTableRowElement;
                    const rect = tr.getBoundingClientRect();
                    if (rect.bottom - e.clientY > 6) return;
                    startRowDrag(p.id, e);
                  }}
                  onDoubleClick={(e) => {
                    if (rowsLocked) return;
                    const tr = e.currentTarget as HTMLTableRowElement;
                    const rect = tr.getBoundingClientRect();
                    if (rect.bottom - e.clientY > 6) return;
                    resetRowH(p.id);
                  }}
                >

                  <td
                    data-nospace-delete
                    className="px-2 py-3 text-muted-foreground"
                    style={{ background: selectedIds.has(p.id) ? "hsl(var(--primary) / 0.18)" : undefined }}
                  >
                    {isAllProducts ? (
                      <div className="flex items-center gap-1.5 justify-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => {}}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                              selectWithModifiers(idx, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
                            } else {
                              toggleSelected(p.id);
                              lastSelectedIdxRef.current = idx;
                            }
                          }}
                          onKeyDown={(e) => {
                            // مسطرة داخل خانة الشيك = تبديل التحديد
                            // مسطرة مضاعفة سريعة = حذف كل المحدَّدين
                            if (e.key === " " || e.code === "Space") {
                              e.preventDefault();
                              e.stopPropagation();
                              const now = Date.now();
                              const isDouble = now - lastSpaceTapRef.current <= 350;
                              lastSpaceTapRef.current = now;
                              if (isDouble && selectedIdsRef.current.size > 0) {
                                lastSpaceTapRef.current = 0;
                                void deleteSelected();
                                return;
                              }
                              toggleSelected(p.id);
                              lastSelectedIdxRef.current = idx;
                            }
                          }}

                          className="w-3.5 h-3.5"
                          title="تحديد (Shift للنطاق • Ctrl للتحديد المتعدد • Shift+Enter لتجميد المحدد)"
                        />
                        <span className="text-[11px]">{(page - 1) * perPage + idx + 1}</span>
                      </div>
                    ) : (idx + 1)}
                  </td>
                  <td className={isAllProducts ? "" : "px-5 py-3"} style={isAllProducts ? { padding: 0 } : undefined}>
                    {isAllProducts ? (
                      <div className="flex items-center gap-2 px-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isMobileUI) setImgActionProduct(p);
                            else if (p.image_url) setImgLightbox({ url: p.image_url, name: p.name || "" });
                          }}
                          title={isMobileUI ? "خيارات الصورة" : (p.image_url ? "عرض الصورة" : "لا توجد صورة")}
                          className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0 focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          {p.image_url ? <img src={p.image_url} className="w-7 h-7 rounded object-cover" /> : <PackageIcon size={12} className="text-muted-foreground" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <EditableCell
                            value={p.name || ""}
                            onSave={async (v) => { const t = v.trim(); if (t && t !== p.name) await updateField(p.id, "name", t); }}
                            inputClassName="text-[12px] font-medium"
                            displayClassName="text-primary hover:underline font-medium cursor-text truncate"
                            placeholder="اسم المنتج"
                          />
                          {(() => {
                            const brs: any[] = (p.brands && p.brands.length > 0) ? p.brands : (p.product_companies ? [p.product_companies] : []);
                            if (brs.length <= 1) return null;
                            const brandNames = brs.map((b: any) => b?.name).filter(Boolean).join("، ");
                            return <div className="text-[10px] text-muted-foreground truncate" title={brandNames}>{brandNames}</div>;
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isMobileUI) setImgActionProduct(p);
                            else if (p.image_url) setImgLightbox({ url: p.image_url, name: p.name || "" });
                          }}
                          title={isMobileUI ? "خيارات الصورة" : (p.image_url ? "عرض الصورة" : "لا توجد صورة")}
                          className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0 focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          {p.image_url ? <img src={p.image_url} className="w-8 h-8 rounded object-cover" /> : <PackageIcon size={14} className="text-muted-foreground" />}
                        </button>
                        {(() => {
                          const brs: any[] = (p.brands && p.brands.length > 0) ? p.brands : (p.product_companies ? [p.product_companies] : []);
                          const brandNames = brs.map((b: any) => b?.name).filter(Boolean).join("، ");
                          const showBrands = brs.length > 1;
                          return (
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium text-foreground truncate" title={p.name}>{p.name}</span>
                              {showBrands && (
                                <span className="text-[11px] text-muted-foreground truncate" title={brandNames}>{brandNames}</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </td>
                  {isPriceReport ? (
                    <td className="px-5 py-3 font-semibold text-foreground">{Number(p.sale_price || 0).toLocaleString()}</td>
                  ) : (isInStockPage || isOutOfStockPage) ? (
                    <>
                      <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{p.sku || "-"}</td>
                      <td className="px-5 py-3">
                        <span className={`font-semibold ${Number(p.stock_quantity || 0) <= 0 ? "text-destructive" : "text-green-500"}`}>{p.stock_quantity}</span>
                      </td>
                      <td className="px-5 py-3 font-semibold text-foreground">{Number(p.sale_price || 0).toLocaleString()}</td>
                      <td className="px-5 py-3 text-muted-foreground">{p.warehouses?.name || "-"}</td>
                    </>
                  ) : isReportPage ? (
                    <>
                      <td className="px-5 py-3">
                        {p.image_url ? <img src={p.image_url} className="w-10 h-10 rounded object-cover" /> : <div className="w-10 h-10 rounded bg-muted" />}
                      </td>
                      <td className="px-5 py-3"><span className="px-2 py-0.5 rounded bg-muted text-xs text-muted-foreground">{p.product_categories?.name || "-"}</span></td>
                      <td className="px-5 py-3 text-muted-foreground">{p.product_companies?.name || "-"}</td>
                      <td className="px-5 py-3 text-muted-foreground">{p.warehouses?.name || "-"}</td>
                      <td className="px-5 py-3">
                        <span className={`font-semibold ${Number(p.stock_quantity || 0) <= 0 ? "text-destructive" : "text-green-500"}`}>{p.stock_quantity}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleEdit(p)} className="p-1.5 text-yellow-500 hover:bg-yellow-500/10 rounded"><Edit size={15} /></button>
                          <button onClick={() => handleDeleteProduct(p.id)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      {/* الفئات (كل الفئات معروضة، التحرير على الفئة الأساسية) */}
                      <td style={{ padding: 0 }}>
                        {(() => {
                          const cats: any[] = (p.categories && p.categories.length > 0)
                            ? p.categories
                            : (p.product_categories ? [p.product_categories] : []);
                          const currentCatId = (p.categories?.[0]?.id) || p.category_id || "";
                          const allNames = cats.map((c: any) => c.name).filter(Boolean).join("، ");
                          return (
                            <div className="flex flex-col" style={{ padding: "2px 4px" }}>
                              <InlineSearchSelect
                                value={currentCatId}
                                options={(categories || []).map((c: any) => ({ value: c.id, label: c.name }))}
                                onChange={(v) => {
                                  // Optimistic: استبدل الفئة الأساسية محلياً واحتفظ بالباقي
                                  const existing = cats.map((c: any) => c.id).filter(Boolean);
                                  const replaced = existing.map((id: string) => id === currentCatId ? v : id);
                                  const next = Array.from(new Set(replaced.filter(Boolean)));
                                  if (v && !next.includes(v)) next.unshift(v);
                                  if (!v) {
                                    const idx = next.indexOf(currentCatId);
                                    if (idx >= 0) next.splice(idx, 1);
                                  }
                                  // ابني قائمة كائنات الفئات الجديدة من الـ options
                                  const catMap = new Map<string, any>((categories || []).map((c: any) => [c.id, c]));
                                  const newCats = next.map(id => catMap.get(id) || { id, name: "" }).filter(Boolean);
                                  const rollback = patchProductCaches(p.id, {
                                    category_id: v || null,
                                    categories: newCats,
                                    product_categories: newCats[0] || null,
                                  });
                                  // حفظ بالخلفية — لا await، ولا invalidate يدوي
                                  // (ProductsCacheSync يستمع لـ products:changed ويُبطل الكاش بفارق 150ms)
                                  (async () => {
                                    try {
                                      await Promise.all([
                                        update.mutateAsync({ id: p.id, category_id: v || null }),
                                        syncProductCategoryLinks(p.id, next),
                                      ]);
                                      window.dispatchEvent(new Event("products:changed"));
                                    } catch (err: any) {
                                      rollback();
                                      toast.error(err.message || "فشل — تم التراجع");
                                    }
                                  })();
                                }}
                                onAdd={createCategoryInline}
                                onDelete={(opt) => deleteCategoryFromSystem(opt.value)}
                                deleteConfirm={(opt) => `هل تريد حذف الفئة "${opt.label}" من النظام نهائيًا؟`}
                                showDeleteButton
                                placeholder={allNames ? "تغيير الفئة الأساسية" : "—"} addLabel="إضافة فئة"
                              />
                            </div>
                          );
                        })()}
                      </td>
                      <td style={{ padding: 0 }}>
                        {(() => {
                          const brs: any[] = (p.brands && p.brands.length > 0)
                            ? p.brands
                            : (p.product_companies ? [p.product_companies] : []);
                          const currentBrandId = (p.brands?.[0]?.id) || p.company_id || "";
                          return (
                            <div className="flex flex-row items-center gap-2" style={{ padding: "2px 4px" }}>
                              <InlineSearchSelect
                                value={currentBrandId}
                                options={(companies || []).map((c: any) => ({ value: c.id, label: c.name }))}
                                onChange={(v) => {
                                  const existing = brs.map((b: any) => b.id).filter(Boolean);
                                  const replaced = existing.map((id: string) => id === currentBrandId ? v : id);
                                  const next = Array.from(new Set(replaced.filter(Boolean)));
                                  if (v && !next.includes(v)) next.unshift(v);
                                  if (!v) {
                                    const idx = next.indexOf(currentBrandId);
                                    if (idx >= 0) next.splice(idx, 1);
                                  }
                                  const brandMap = new Map<string, any>((companies || []).map((c: any) => [c.id, c]));
                                  const newBrands = next.map(id => brandMap.get(id) || { id, name: "" }).filter(Boolean);
                                  const rollback = patchProductCaches(p.id, {
                                    company_id: v || null,
                                    brands: newBrands,
                                    product_companies: newBrands[0] || null,
                                  });
                                  (async () => {
                                    try {
                                      await Promise.all([
                                        update.mutateAsync({ id: p.id, company_id: v || null }),
                                        syncProductBrandLinks(p.id, next),
                                      ]);
                                      window.dispatchEvent(new Event("products:changed"));
                                    } catch (err: any) {
                                      rollback();
                                      toast.error(err.message || "فشل — تم التراجع");
                                    }
                                  })();
                                }}
                                onAdd={async (name) => {
                                  const id = await createCompanyInline(name);
                                  return id;
                                }}
                                onDelete={(opt) => deleteBrandFromSystem(opt.value)}
                                deleteConfirm={(opt) => `هل تريد حذف الماركة "${opt.label}" من النظام نهائيًا؟`}
                                showDeleteButton
                                placeholder="—" addLabel="إضافة ماركة"
                              />
                            </div>
                          );
                        })()}
                      </td>
                      <td style={{ padding: 0 }}>
                        <InlineSearchSelect
                          value={p.warehouse_id || ""}
                          options={(warehouses || []).map((w: any) => ({ value: w.id, label: w.name }))}
                          onChange={(v) => updateField(p.id, "warehouse_id", v || null)}
                          onAdd={createWarehouseInline}
                          onDelete={(opt) => deleteWarehouseFromSystem(opt.value)}
                          deleteConfirm={(opt) => `هل تريد حذف المستودع "${opt.label}" من النظام نهائيًا؟`}
                          showDeleteButton
                          placeholder="—" addLabel="إضافة مستودع"
                        />

                      </td>
                      <td className="tabular-nums" style={{ padding: 0 }}>
                        <EditableCell
                          value={String(p.sale_price ?? "")}
                          inputMode="decimal"
                          validate={(v) => {
                            const t = normalizeNumStr(v);
                            if (t === "") return null;
                            return /^\d*([.,]\d*)?$/.test(t) ? null : "أرقام فقط";
                          }}
                          onSave={(v) => {
                            const t = normalizeNumStr(v).replace(",", ".");
                            const n = t === "" ? 0 : (parseFloat(t) || 0);
                            if (n !== Number(p.sale_price || 0)) return updateField(p.id, "sale_price", n);
                          }}
                          inputClassName="text-[12px] tabular-nums"
                          placeholder="0"
                        />
                      </td>
                      <td className="tabular-nums" style={{ padding: 0 }}>
                        <EditableCell
                          value={p.foreign_price == null ? "" : String(p.foreign_price)}
                          inputMode="decimal"
                          validate={(v) => {
                            const t = normalizeNumStr(v);
                            if (t === "") return null;
                            return /^\d*([.,]\d*)?$/.test(t) ? null : "أرقام فقط";
                          }}
                          onSave={(v) => {
                            const t = normalizeNumStr(v).replace(",", ".");
                            const n = t === "" ? null : (parseFloat(t) || 0);
                            if (n !== (p.foreign_price ?? null)) return updateField(p.id, "foreign_price", n);
                          }}
                          inputClassName="text-[12px] tabular-nums"
                          placeholder="—"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {p.image_url ? (
                            <img src={p.image_url} className="w-10 h-10 rounded object-cover border border-border" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center"><PackageIcon size={14} className="text-muted-foreground" /></div>
                          )}
                          <label
                            className="text-xs text-primary cursor-pointer hover:underline"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                (e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement | null)?.click();
                              }
                            }}
                            tabIndex={0}
                          >
                            {p.image_url ? "تغيير" : "ارفع"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (!file) return;
                                openCropForFile(file, async (cropped) => {
                                  const localUrl = URL.createObjectURL(cropped);
                                  const rollback = patchProductCaches(p.id, { image_url: localUrl });
                                  try {
                                    const { uploadProductImage } = await import("@/utils/productImageUpload");
                                    const url = await uploadProductImage(cropped);
                                    patchProductCaches(p.id, { image_url: url });
                                    await update.mutateAsync({ id: p.id, image_url: url });
                                    window.dispatchEvent(new Event("products:changed"));
                                    setTimeout(() => URL.revokeObjectURL(localUrl), 1000);
                                  } catch (err: any) {
                                    rollback();
                                    URL.revokeObjectURL(localUrl);
                                    toast.error(err.message || "فشل الرفع");
                                  }
                                });
                              }}
                            />
                          </label>
                          {p.image_url && (
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-muted text-primary"
                              title="إعادة قص"
                              aria-label="إعادة قص الصورة"
                              onClick={() => startRecrop(p.image_url, async (cropped) => {
                                const localUrl = URL.createObjectURL(cropped);
                                const rollback = patchProductCaches(p.id, { image_url: localUrl });
                                try {
                                  const { uploadProductImage } = await import("@/utils/productImageUpload");
                                  const url = await uploadProductImage(cropped);
                                  patchProductCaches(p.id, { image_url: url });
                                  await update.mutateAsync({ id: p.id, image_url: url });
                                  window.dispatchEvent(new Event("products:changed"));
                                  setTimeout(() => URL.revokeObjectURL(localUrl), 1000);
                                } catch (err: any) {
                                  rollback();
                                  URL.revokeObjectURL(localUrl);
                                  toast.error(err.message || "فشل حفظ الصورة الجديدة");
                                }
                              })}
                            >
                              <Scissors size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: 0 }}>
                        <InlineSearchSelect
                          value={p.supplier_id || ""}
                          options={(suppliers || []).map((s: any) => ({ value: s.id, label: s.name }))}
                          onChange={(v) => updateField(p.id, "supplier_id", v || null)}
                          onAdd={createSupplierInline}
                          onDelete={(opt) => deleteSupplierFromSystem(opt.value)}
                          deleteConfirm={(opt) => `هل تريد حذف المورد "${opt.label}" من النظام نهائيًا؟`}
                          showDeleteButton
                          placeholder="—" addLabel="إضافة مورد"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!p.is_frozen}
                          onChange={(e) => setFrozenOptimistic([p.id], e.target.checked)}
                          className="w-4 h-4"
                          title="تجميد الصنف"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleEdit(p)} className="p-1.5 text-yellow-500 hover:bg-yellow-500/10 rounded"><Edit size={15} /></button>
                          <button onClick={() => handleDeleteProduct(p.id)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards list removed — desktop table is shown on mobile too (desktop-on-mobile). */}

        {isAllProducts && !isLoading && sortedFiltered.length > 0 && (
          <>
            <div className="legacy-dt-info">
              إظهار {(page - 1) * perPage + 1} إلى {Math.min(page * perPage, sortedFiltered.length)} من إجمالي {sortedFiltered.length} منتج
            </div>
            <ul className="legacy-pagination">
              <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
                <button className="page-link" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>السابق</button>
              </li>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let pn: number;
                if (totalPages <= 7) pn = i + 1;
                else if (page <= 4) pn = i + 1;
                else if (page >= totalPages - 3) pn = totalPages - 6 + i;
                else pn = page - 3 + i;
                return (
                  <li key={pn} className={`page-item ${page === pn ? "active" : ""}`}>
                    <button className="page-link" onClick={() => setPage(pn)}>{pn}</button>
                  </li>
                );
              })}
              <li className={`page-item ${page === totalPages ? "disabled" : ""}`}>
                <button className="page-link" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>التالي</button>
              </li>
            </ul>
          </>
        )}
        {showFilters && !isAllProducts && (
          <div className="p-4 border-t border-border text-sm text-muted-foreground">
            إجمالي النتائج: {filtered.length} منتج
          </div>
        )}
      </div>
          </div>
        </div>
      </article>

      <ImageCropDialog
        open={cropOpen}
        file={cropFile}
        onCancel={() => { setCropOpen(false); setCropFile(null); cropTargetRef.current = null; }}
        onConfirm={async (cropped) => {
          setCropOpen(false);
          const cb = cropTargetRef.current;
          cropTargetRef.current = null;
          setCropFile(null);
          if (cb) await cb(cropped);
        }}
        title="قص صورة المنتج"
      />

      {unlinkDialog && (
        <ConfirmUnlinkDeleteDialog
          open={!!unlinkDialog}
          onOpenChange={(v) => { if (!v) setUnlinkDialog(null); }}
          entityLabel={unlinkDialog.entityLabel}
          entityName={unlinkDialog.entityName}
          usageLabel={unlinkDialog.usageLabel}
          usageNames={unlinkDialog.usageNames}
          usageCount={unlinkDialog.usageCount}
          warning={unlinkDialog.warning}
          onConfirm={unlinkDialog.onConfirm}
          onDone={() => setUnlinkDialog(null)}
        />
      )}

      {/* ================ ورقة إجراءات صورة المنتج (موبايل) ================ */}
      {imgActionProduct && (
        <div
          className="fixed inset-0 z-[10000] bg-black/70 flex items-end sm:items-center justify-center"
          onClick={() => setImgActionProduct(null)}
        >
          <div
            dir="rtl"
            className="w-full sm:max-w-md bg-[#1f1f24] text-white rounded-t-2xl sm:rounded-2xl p-4 shadow-2xl border-t border-white/10 sm:border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-lg bg-white/10 overflow-hidden flex items-center justify-center shrink-0">
                {imgActionProduct.image_url
                  ? <img src={imgActionProduct.image_url} className="w-full h-full object-cover" />
                  : <PackageIcon size={20} className="text-white/60" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{imgActionProduct.name || "منتج"}</div>
                {imgActionProduct.sku && (
                  <div className="text-xs text-white/60 truncate">SKU: {imgActionProduct.sku}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setImgActionProduct(null)}
                className="text-white/70 hover:text-white text-xl px-2"
              >✕</button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {/* حذف */}
              <button
                type="button"
                onClick={async () => {
                  const p = imgActionProduct;
                  setImgActionProduct(null);
                  await handleDeleteProduct(p.id);
                }}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/15 py-5 px-2 min-h-[92px]"
              >
                <Trash2 size={30} className="text-rose-400" />
                <span className="text-sm font-bold text-rose-300">حذف</span>
              </button>
              {/* مشاركة الصورة نفسها */}
              <button
                type="button"
                onClick={async () => {
                  const p = imgActionProduct;
                  setImgActionProduct(null);
                  if (!p.image_url) { toast.error("لا توجد صورة للمشاركة"); return; }
                  const tid = toast.loading("جارٍ تحضير الصورة...");
                  try {
                    const { fetchImageAsFile } = await import("@/utils/fetchImageAsFile");
                    const file = await fetchImageAsFile(p.image_url, `${(p.name || "product").replace(/[\\/:*?"<>|]+/g, "_")}.jpg`);
                    toast.dismiss(tid);
                    const nav: any = navigator;
                    const canShareFiles = typeof nav.canShare === "function" && nav.canShare({ files: [file] });
                    if (canShareFiles && typeof nav.share === "function") {
                      try {
                        await nav.share({ files: [file], title: p.name || "منتج", text: p.name || "" });
                        return;
                      } catch (err: any) {
                        if (err?.name === "AbortError") return;
                      }
                    }
                    // Fallback: تنزيل الصورة على الجهاز حتى يمكن مشاركتها من المعرض
                    const url = URL.createObjectURL(file);
                    const a = document.createElement("a");
                    a.href = url; a.download = file.name;
                    document.body.appendChild(a); a.click(); a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1500);
                    toast.success("تم تنزيل الصورة — شاركها من معرض الصور");
                  } catch (e: any) {
                    toast.dismiss(tid);
                    toast.error(e?.message || "تعذر تحضير الصورة للمشاركة");
                  }
                }}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/15 py-5 px-2 min-h-[92px]"
              >
                <svg viewBox="0 0 24 24" width="30" height="30" className="text-sky-300" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                <span className="text-sm font-bold text-sky-200">مشاركة</span>
              </button>
              {/* عرض الصورة */}
              <button
                type="button"
                onClick={() => {
                  const p = imgActionProduct;
                  setImgActionProduct(null);
                  if (p.image_url) setImgLightbox({ url: p.image_url, name: p.name || "" });
                  else toast.error("لا توجد صورة");
                }}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/15 py-5 px-2 min-h-[92px]"
              >
                <svg viewBox="0 0 24 24" width="30" height="30" className="text-slate-200" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                <span className="text-sm font-bold text-slate-200">عرض الصورة</span>
              </button>
              {/* تعديل = إعادة قص الصورة */}
              <button
                type="button"
                onClick={() => {
                  const p = imgActionProduct;
                  setImgActionProduct(null);
                  if (!p.image_url) { toast.error("لا توجد صورة لقصّها"); return; }
                  startRecrop(p.image_url, async (cropped) => {
                    const localUrl = URL.createObjectURL(cropped);
                    const rollback = patchProductCaches(p.id, { image_url: localUrl });
                    try {
                      const { uploadProductImage } = await import("@/utils/productImageUpload");
                      const url = await uploadProductImage(cropped);
                      patchProductCaches(p.id, { image_url: url });
                      await update.mutateAsync({ id: p.id, image_url: url });
                      window.dispatchEvent(new Event("products:changed"));
                      setTimeout(() => URL.revokeObjectURL(localUrl), 1000);
                      toast.success("تم قصّ الصورة");
                    } catch (err: any) {
                      rollback();
                      URL.revokeObjectURL(localUrl);
                      toast.error(err?.message || "فشل حفظ الصورة الجديدة");
                    }
                  });
                }}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/15 py-5 px-2 min-h-[92px]"
              >
                <Scissors size={30} className="text-sky-300" />
                <span className="text-sm font-bold text-sky-200">قص الصورة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================ عارض الصورة (Lightbox) ================ */}
      {imgLightbox && (
        <div
          className="fixed inset-0 z-[10001] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setImgLightbox(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setImgLightbox(null); }}
            className="absolute top-4 left-4 text-white/90 hover:text-white text-2xl w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
          >✕</button>
          <div className="max-w-[95vw] max-h-[90vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img
              src={imgLightbox.url}
              alt={imgLightbox.name}
              className="max-w-[95vw] max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
            {imgLightbox.name && (
              <div className="text-white/90 text-sm font-semibold text-center max-w-full truncate" dir="rtl">
                {imgLightbox.name}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================ نافذة معاينة PDF مع فلاتر وترتيب ================ */}
      {pdfPreviewOpen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-3"
          onClick={() => setPdfPreviewOpen(false)}
        >
          <div
            dir="rtl"
            className="bg-card text-foreground rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
              <div className="font-bold text-base flex items-center gap-2">
                <FileDown size={18} /> معاينة كتالوج PDF
              </div>
              <button
                type="button"
                onClick={() => setPdfPreviewOpen(false)}
                className="text-muted-foreground hover:text-foreground text-lg leading-none px-2"
              >✕</button>
            </div>

            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 border-b border-border">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">بحث بالاسم / SKU</label>
                <input
                  value={pv.search}
                  onChange={(e) => setPv({ ...pv, search: e.target.value })}
                  placeholder="اكتب للبحث..."
                  className="bg-muted rounded-lg px-3 py-2 text-sm border border-border w-full outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">الفئة</label>
                <select
                  value={pv.category}
                  onChange={(e) => setPv({ ...pv, category: e.target.value })}
                  className="bg-muted rounded-lg px-3 py-2 text-sm border border-border w-full outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">الكل</option>
                  {(categories || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">الماركة</label>
                <select
                  value={pv.brand}
                  onChange={(e) => setPv({ ...pv, brand: e.target.value })}
                  className="bg-muted rounded-lg px-3 py-2 text-sm border border-border w-full outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">الكل</option>
                  {(companies || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">المستودع</label>
                <select
                  value={pv.warehouse}
                  onChange={(e) => setPv({ ...pv, warehouse: e.target.value })}
                  className="bg-muted rounded-lg px-3 py-2 text-sm border border-border w-full outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">الكل</option>
                  {(warehouses || []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">ترتيب حسب</label>
                <select
                  value={pv.sortBy}
                  onChange={(e) => setPv({ ...pv, sortBy: e.target.value as any })}
                  className="bg-muted rounded-lg px-3 py-2 text-sm border border-border w-full outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="name">الاسم</option>
                  <option value="category">الفئة</option>
                  <option value="brand">الماركة</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">اتجاه الترتيب</label>
                <select
                  value={pv.sortDir}
                  onChange={(e) => setPv({ ...pv, sortDir: e.target.value as any })}
                  className="bg-muted rounded-lg px-3 py-2 text-sm border border-border w-full outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="asc">تصاعدي</option>
                  <option value="desc">تنازلي</option>
                </select>
              </div>
              <div className="sm:col-span-2 md:col-span-3 flex items-center gap-2 pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-lg border border-border bg-muted/40 hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={pv.showPrice}
                    onChange={(e) => setPv({ ...pv, showPrice: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">
                    {pv.showPrice ? "إظهار السعر في PDF والمشاركة" : "إخفاء السعر في PDF والمشاركة"}
                  </span>
                </label>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-3 text-sm">
              <div className="mb-2 text-muted-foreground text-xs">
                {pdfList.length} منتج مطابق — يُطبع الجدول بشعار وترويسة الشركة أعلى كل صفحة.
              </div>
              <table className="w-full border-collapse text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="border border-border p-1 w-8">#</th>
                    <th className="border border-border p-1 w-12">صورة</th>
                    <th className="border border-border p-1 text-right">الاسم</th>
                    <th className="border border-border p-1 text-right w-24">الفئة</th>
                    <th className="border border-border p-1 text-right w-24">الماركة</th>
                    {pv.showPrice && <th className="border border-border p-1 text-center w-20">السعر</th>}
                  </tr>
                </thead>
                <tbody>
                  {pdfList.slice(0, 60).map((p: any, i: number) => (
                    <tr key={p.id} className="odd:bg-background even:bg-muted/30">
                      <td className="border border-border p-1 text-center text-muted-foreground">{i + 1}</td>
                      <td className="border border-border p-1">
                        <div className="w-8 h-8 mx-auto rounded bg-muted overflow-hidden flex items-center justify-center">
                          {p.image_url
                            ? <img src={p.image_url} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            : <PackageIcon size={12} className="text-muted-foreground" />}
                        </div>
                      </td>
                      <td className="border border-border p-1 font-medium">{p.name}</td>
                      <td className="border border-border p-1 text-muted-foreground">{p.categories?.[0]?.name || p.product_categories?.name || ""}</td>
                      <td className="border border-border p-1 text-muted-foreground">{p.brands?.[0]?.name || p.product_companies?.name || ""}</td>
                      {pv.showPrice && <td className="border border-border p-1 text-center font-semibold text-emerald-600">{Number(p.sale_price || 0).toLocaleString("ar-EG")}</td>}
                    </tr>
                  ))}
                  {pdfList.length === 0 && (
                    <tr><td colSpan={pv.showPrice ? 6 : 5} className="text-center text-muted-foreground py-6">لا توجد منتجات مطابقة</td></tr>
                  )}
                </tbody>
              </table>
              {pdfList.length > 60 && (
                <div className="text-xs text-muted-foreground text-center mt-2">
                  عُرِضت أول 60 نتيجة فقط للمعاينة — الطباعة تشمل جميع {pdfList.length} منتج.
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 p-3 border-t border-border bg-muted/40">
              <button
                type="button"
                onClick={() => setPdfPreviewOpen(false)}
                className="px-4 py-2 rounded-lg text-sm bg-muted border border-border hover:bg-muted/70"
              >إلغاء</button>
              <button
                type="button"
                disabled={isExportingPdf || pdfList.length === 0}
                onClick={() => exportFilteredPdf("preview", pdfList)}
                className="px-4 py-2 rounded-lg text-sm border border-primary text-primary hover:bg-primary/10 disabled:opacity-60"
              >فتح معاينة فقط</button>
              <button
                type="button"
                disabled={isExportingPdf || pdfList.length === 0}
                onClick={() => { exportFilteredPdf("print", pdfList); }}
                className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
              >
                <FileDown size={16} /> {isExportingPdf ? "جارٍ الإنشاء..." : "طباعة الآن"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
