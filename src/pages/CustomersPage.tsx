import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Plus, Edit, Trash2, Eye, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, X, Maximize2, Minimize2 } from "lucide-react";
import { useCustomers } from "@/hooks/useData";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import CustomerDetailView from "@/components/CustomerDetailView";
import LocationPicker, { LocationValue, validateLocation } from "@/components/LocationPicker";
import CustomerFormDialog from "@/components/CustomerFormDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MobileDocCard, mobileDocListCSS } from "@/components/mobile/MobileDocList";
import { useIsMobile } from "@/hooks/use-mobile";
import { useColumnWidths, ColumnResizeHandle, useSharedColsLocked, COLS_BTN_SAVE_LABEL, COLS_BTN_EDIT_LABEL, COLS_BTN_SAVE_TITLE, COLS_BTN_EDIT_TITLE, COLS_TOAST_SAVED, COLS_TOAST_EDIT_MODE, COLS_TOAST_SAVE_FAILED } from "@/hooks/useColumnWidths";
import { userScopedLegacyKey } from "@/lib/userScopedKey";
import { useRowHeights } from "@/hooks/useRowHeights";
import EditableCell from "@/components/EditableCell";
import InlineSearchSelect from "@/components/InlineSearchSelect";
import GeoStructurePanel from "@/components/customers/GeoStructurePanel";

const emptyForm = { name: "", phone: "", address: "", notes: "", city: "", region_id: "" as string | null | "", state_id: "" as string | null | "", locality_id: "" as string | null | "", city_id: "" as string | null | "" };

type ActivityFilter = "all" | "active_30" | "active_90" | "inactive_90" | "no_activity" | "with_balance" | "with_credit";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const isMobile = useIsMobile();
  const [editId, setEditId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInitial, setDialogInitial] = useState<any>(null);
  const [viewCustomer, setViewCustomer] = useState<any>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [showGeo, setShowGeo] = useState(false);
  const { data: customers, isLoading, insert, update, remove } = useCustomers();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // مزامنة باراميتر ?view=<id> مع حالة عرض العميل (يدعم زرّ رجوع/تقدّم المتصفح)
  useEffect(() => {
    const viewId = searchParams.get("view");
    if (!viewId) {
      if (viewCustomer) setViewCustomer(null);
      if (viewError) setViewError(null);
      if (viewLoading) setViewLoading(false);
      return;
    }
    if (viewCustomer && viewCustomer.id === viewId) return;
    const local = (customers || []).find((c: any) => c.id === viewId);
    if (local) {
      setViewCustomer(local);
      setViewError(null);
      setViewLoading(false);
      return;
    }
    let cancelled = false;
    setViewLoading(true);
    setViewError(null);
    (async () => {
      try {
        const { data, error } = await supabase.from("customers").select("*").eq("id", viewId).maybeSingle();
        if (cancelled) return;
        if (error) {
          setViewError(error.message || "تعذّر تحميل بيانات العميل");
        } else if (!data) {
          setViewError("العميل غير موجود");
        } else {
          setViewCustomer(data);
        }
      } catch (e: any) {
        if (!cancelled) setViewError(e?.message || "تعذّر تحميل بيانات العميل");
      } finally {
        if (!cancelled) setViewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams, customers, viewCustomer, viewError, viewLoading]);

  // فلاتر
  const [showFilters, setShowFilters] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [balanceSheetOpen, setBalanceSheetOpen] = useState(false);
  const [balanceSheetView, setBalanceSheetView] = useState<"debt" | "credit">("debt");
  const [filterCity, setFilterCity] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterLocality, setFilterLocality] = useState("");
  // فلاتر هيدر (Excel-style)
  const [filterName, setFilterName] = useState("");
  const [filterPhone, setFilterPhone] = useState("");
  const [filterAddress, setFilterAddress] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [filterTransporter, setFilterTransporter] = useState("");
  const [filterDestination, setFilterDestination] = useState("");

  const [filterActivity, setFilterActivity] = useState<ActivityFilter>("all");
  const [sortBy, setSortBy] = useState<"name" | "recent" | "balance">("name");
  const [openFilter, setOpenFilter] = useState<{ key: string; mode: "list" | "search" } | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterHighlight, setFilterHighlight] = useState(0);

  const [regions, setRegions] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [localities, setLocalities] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [transporters, setTransporters] = useState<any[]>([]);
  const [destinations, setDestinations] = useState<any[]>([]);
  const [customerTransporter, setCustomerTransporter] = useState<Record<string, string>>({});
  const [customerDestination, setCustomerDestination] = useState<Record<string, string>>({});
  const [lastActivity, setLastActivity] = useState<Record<string, string>>({});
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ name: string; address: string; phone: string; region_id: string; state_id: string; city: string; city_id: string; locality_id: string; group_id: string; transporter_id: string; destination_id: string }>({ name: "", address: "", phone: "", region_id: "", state_id: "", city: "", city_id: "", locality_id: "", group_id: "", transporter_id: "", destination_id: "" });
  const [quickSaving, setQuickSaving] = useState(false);

  // F9 → فتح نافذة إضافة عميل جديد / Esc → خروج من ملء الشاشة
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F9") {
        e.preventDefault();
        setDialogInitial(null);
        setDialogOpen(true);
      } else if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  useEffect(() => {
    (async () => {
      const [r, s, ci, l, g, t, d, cpt, cd] = await Promise.all([
        (supabase as any).from("regions").select("id,name").order("name"),
        (supabase as any).from("states").select("id,name,region_id").order("name"),
        (supabase as any).from("cities").select("id,name,state_id").order("name"),
        (supabase as any).from("localities").select("id,name,city_id").order("name"),
        (supabase as any).from("customer_groups").select("id,name").order("name"),
        (supabase as any).from("transporters").select("id,name").order("name"),
        (supabase as any).from("destinations").select("id,name").order("name"),
        (supabase as any).from("customer_preferred_transporter").select("customer_id,transporter_id"),
        (supabase as any).from("customer_destinations").select("customer_id,destination_id,is_default"),
      ]);
      setRegions(r.data || []);
      setStates(s.data || []);
      setCities(ci.data || []);
      setLocalities(l.data || []);
      setGroups(g.data || []);
      setTransporters(t.data || []);
      setDestinations(d.data || []);
      const tMap: Record<string, string> = {};
      (cpt.data || []).forEach((row: any) => { if (row.customer_id) tMap[row.customer_id] = row.transporter_id; });
      setCustomerTransporter(tMap);
      const dMap: Record<string, string> = {};
      (cd.data || []).forEach((row: any) => {
        if (!row.customer_id) return;
        if (row.is_default || !dMap[row.customer_id]) dMap[row.customer_id] = row.destination_id;
      });
      setCustomerDestination(dMap);

      const { data: invs } = await (supabase as any)
        .from("invoices").select("customer_id, date").not("customer_id", "is", null);
      const map: Record<string, string> = {};
      (invs || []).forEach((inv: any) => {
        if (!inv.customer_id || !inv.date) return;
        if (!map[inv.customer_id] || inv.date > map[inv.customer_id]) map[inv.customer_id] = inv.date;
      });
      setLastActivity(map);
    })();
  }, []);

  const normalizePhone = (p: string) => (p || "").replace(/\D/g, "");
  const findDuplicatesByPhone = (phone: string, excludeId?: string | null) => {
    const norm = normalizePhone(phone);
    if (!norm) return [];
    return (customers || []).filter((c: any) =>
      c.id !== excludeId && normalizePhone(c.phone || "") === norm
    );
  };

  const availableCities = useMemo(() => {
    const set = new Set<string>();
    (customers || []).forEach((c: any) => { if (c.city) set.add(c.city); });
    return Array.from(set).sort();
  }, [customers]);

  const filteredStates = filterRegion ? states.filter(s => s.region_id === filterRegion) : states;
  const filteredCities = filterState ? cities.filter(ci => ci.state_id === filterState) : cities;
  const filteredLocalities = filterState
    ? (() => {
        const cityIds = new Set(filteredCities.map(ci => ci.id));
        return localities.filter(l => cityIds.has(l.city_id));
      })()
    : localities;

  const daysSince = (dateStr?: string) => {
    if (!dateStr) return Infinity;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  };

  const filtered = useMemo(() => (customers || []).filter((c: any) => {
    if (search) {
      const s = search.toLowerCase();
      const hay = [c.name, c.phone, c.city, c.address].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(s)) return false;
    }
    if (filterCity && c.city_id !== filterCity) return false;
    if (filterRegion && c.region_id !== filterRegion) return false;
    if (filterState && c.state_id !== filterState) return false;
    if (filterLocality && c.locality_id !== filterLocality) return false;
    if (filterName && !(c.name || "").toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterPhone && !normalizePhone(c.phone || "").includes(normalizePhone(filterPhone))) return false;
    if (filterAddress && !(c.address || "").toLowerCase().includes(filterAddress.toLowerCase())) return false;
    if (filterGroup && c.group_id !== filterGroup) return false;
    if (filterTransporter && customerTransporter[c.id] !== filterTransporter) return false;
    if (filterDestination && customerDestination[c.id] !== filterDestination) return false;
    
    if (filterActivity !== "all") {
      const last = lastActivity[c.id];
      const days = daysSince(last);
      if (filterActivity === "active_30" && days > 30) return false;
      if (filterActivity === "active_90" && days > 90) return false;
      if (filterActivity === "inactive_90" && (days <= 90 || days === Infinity)) return false;
      if (filterActivity === "no_activity" && last) return false;
      if (filterActivity === "with_balance" && !(Number(c.balance || 0) > 0)) return false;
      if (filterActivity === "with_credit" && !(Number(c.credit_balance || 0) > 0)) return false;
    }
    return true;
  }), [customers, search, filterCity, filterRegion, filterState, filterLocality, filterName, filterPhone, filterAddress, filterGroup, filterTransporter, filterDestination, filterActivity, customerTransporter, customerDestination, lastActivity]);

  const sortedFiltered = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === "recent") arr.sort((a, b) => (lastActivity[b.id] || "").localeCompare(lastActivity[a.id] || ""));
    else if (sortBy === "balance") arr.sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));
    else arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return arr;
  }, [filtered, sortBy, lastActivity]);

  const activeFiltersCount = [filterCity, filterRegion, filterState, filterLocality, filterName, filterPhone, filterAddress, filterGroup, filterTransporter, filterDestination, filterActivity !== "all" ? filterActivity : ""].filter(Boolean).length;

  // إحصاءات الديون من السيرفر (RPC) — أخفّ بكثير من حسابها على المتصفح
  const { data: serverStats } = useQuery({
    queryKey: ["customer_balance_stats"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_customer_balance_stats");
      if (error) throw error;
      return data as {
        total_debt: number; total_credit: number; debtors: number; creditors: number;
        count: number; net: number;
        top_debtors: { id: string; name: string; debt: number; credit: number; net: number }[];
      };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // هل توجد فلترة/بحث فعّال؟
  const hasActiveFilter = Boolean(search) || activeFiltersCount > 0;

  // إحصاءات حسب نتائج البحث/الفلترة الحالية
  const filteredStats = useMemo(() => {
    let totalDebt = 0, totalCredit = 0, debtors = 0, creditors = 0;
    for (const c of sortedFiltered as any[]) {
      const d = Number(c.balance || 0);
      const cr = Number(c.credit_balance || 0);
      if (d > 0) { totalDebt += d; debtors++; }
      if (cr > 0) { totalCredit += cr; creditors++; }
    }
    return { totalDebt, totalCredit, debtors, creditors, net: totalDebt - totalCredit, count: sortedFiltered.length };
  }, [sortedFiltered]);

  const stats = useMemo(() => {
    if (hasActiveFilter) return filteredStats;
    if (serverStats) {
      return {
        totalDebt: Number(serverStats.total_debt || 0),
        totalCredit: Number(serverStats.total_credit || 0),
        debtors: Number(serverStats.debtors || 0),
        creditors: Number(serverStats.creditors || 0),
        net: Number(serverStats.net || 0),
        count: Number(serverStats.count || (customers?.length || 0)),
      };
    }
    return { totalDebt: 0, totalCredit: 0, debtors: 0, creditors: 0, net: 0, count: customers?.length || 0 };
  }, [hasActiveFilter, filteredStats, serverStats, customers]);

  const top10Debtors = useMemo(() => {
    if (serverStats?.top_debtors) {
      return serverStats.top_debtors.map(c => ({ ...c, _debt: Number(c.debt || 0), _net: Number(c.net || 0) }));
    }
    return [];
  }, [serverStats]);

  const [highlightId, setHighlightId] = useState<string | null>(null);

  const goToCustomer = (id: string) => {
    const idx = sortedFiltered.findIndex((c: any) => c.id === id);
    if (idx < 0) {
      // clear filters/search to make sure it's visible
      setSearch(""); setFilterCity(""); setFilterRegion(""); setFilterState(""); setFilterLocality(""); setFilterActivity("all");
      setTimeout(() => goToCustomer(id), 50);
      return;
    }
    const targetPage = Math.floor(idx / perPage) + 1;
    setPage(targetPage);
    setHighlightId(id);
    setTimeout(() => {
      const el = document.getElementById(`customer-row-${id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    setTimeout(() => setHighlightId(null), 2500);
  };

  const clearFilters = () => {
    setFilterCity(""); setFilterRegion(""); setFilterState(""); setFilterLocality(""); setFilterActivity("all");
    setFilterName(""); setFilterPhone(""); setFilterAddress(""); setFilterGroup(""); setFilterTransporter(""); setFilterDestination("");
    setPage(1);
  };

  const totalPages = Math.ceil(sortedFiltered.length / perPage);
  const paginated = sortedFiltered.slice((page - 1) * perPage, page * perPage);

  const handleSubmit = async () => {
    if (!form.name) { toast.error("الاسم مطلوب"); return; }
    const locErr = validateLocation({ region_id: form.region_id || null, state_id: form.state_id || null, city_id: form.city_id || null });
    if (locErr) { toast.error(locErr); return; }
    // Duplicate phone check
    if (form.phone) {
      const dups = findDuplicatesByPhone(form.phone, editId);
      if (dups.length > 0) {
        setDuplicates(dups);
        toast.error(`رقم الهاتف مكرر — يوجد ${dups.length} عميل آخر بنفس الرقم`);
        return;
      }
    }
    try {
      const payload = {
        ...form,
        
        region_id: form.region_id || null,
        state_id: form.state_id || null,
        locality_id: form.locality_id || null,
        city_id: form.city_id || null,
      };
      if (editId) {
        await update.mutateAsync({ id: editId, ...payload });
        toast.success("تم تحديث العميل");
      } else {
        await insert.mutateAsync(payload);
        toast.success("تم إضافة العميل");
      }
      setShowForm(false); setEditId(null); setForm(emptyForm); setDuplicates([]);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleEdit = (c: any) => {
    setDialogInitial({
      id: c.id,
      name: c.name || "",
      phone: c.phone || "",
      whatsapp: c.whatsapp || "",
      city: c.city || "",
      region_id: c.region_id || null,
      state_id: c.state_id || null,
      locality_id: c.locality_id || null,
      city_id: c.city_id || null,
      address: c.address || "",
      group_id: c.group_id || null,
      notes: c.notes || "",
    });
    setDialogOpen(true);
    setViewCustomer(null);
  };

  const handleDelete = async (id: string) => {
    // Count linked records first
    const [invRes, qRes, retRes, poRes] = await Promise.all([
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("customer_id", id),
      supabase.from("quotes").select("id", { count: "exact", head: true }).eq("customer_id", id),
      supabase.from("stock_returns").select("id", { count: "exact", head: true }).eq("customer_id", id),
      supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("supplier_id", id),
    ]);
    const invCount = invRes.count || 0;
    const qCount = qRes.count || 0;
    const retCount = retRes.count || 0;
    const poCount = poRes.count || 0;
    const total = invCount + qCount + retCount + poCount;

    if (total > 0) {
      const parts: string[] = [];
      if (invCount) parts.push(`${invCount} فاتورة`);
      if (qCount) parts.push(`${qCount} عرض سعر`);
      if (retCount) parts.push(`${retCount} مرتجع`);
      if (poCount) parts.push(`${poCount} أمر شراء`);
      toast.error(
        `لا يمكن حذف هذا العميل — مرتبط بـ ${parts.join("، ")}.`,
        { description: "احذف أو أعد تعيين هذه السجلات أولاً للحفاظ على سلامة البيانات.", duration: 8000 },
      );
      return;
    }

    if (!confirm("هل أنت متأكد من حذف هذا العميل؟")) return;
    try { await remove.mutateAsync(id); toast.success("تم حذف العميل"); }
    catch (e: any) { toast.error(e.message); }
  };

  const inputCls = "bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary w-full min-w-0";


  const [recentDebtorsOpen, setRecentDebtorsOpen] = useState(false);
  const [recentDebtorsSearch, setRecentDebtorsSearch] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsBtnRef = useRef<HTMLButtonElement>(null);
  const shortcutsPopRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shortcutsOpen) shortcutsPopRef.current?.focus();
  }, [shortcutsOpen]);
  const CP_SHOW_DASHBOARD = userScopedLegacyKey("customers-page:showDashboard");
  const [showDashboard, setShowDashboard] = useState<boolean>(() => {
    try { return localStorage.getItem(CP_SHOW_DASHBOARD) !== "0"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(CP_SHOW_DASHBOARD, showDashboard ? "1" : "0"); } catch {}
  }, [showDashboard]);

  const recentDebtors = useMemo(() => {
    const all = (customers || [])
      .filter((c: any) => Number(c.balance || 0) > 0)
      .map((c: any) => ({ ...c, _last: lastActivity[c.id] || "" }))
      .sort((a: any, b: any) => (b._last || "").localeCompare(a._last || ""));
    const q = recentDebtorsSearch.trim().toLowerCase();
    if (!q) return all.slice(0, 10);
    const norm = (s: string) => (s || "").replace(/\D/g, "");
    return all.filter((c: any) => {
      const name = (c.name || "").toLowerCase();
      const phone = norm(c.phone || "");
      return name.includes(q) || (norm(q) && phone.includes(norm(q)));
    }).slice(0, 50);
  }, [customers, lastActivity, recentDebtorsSearch]);

  const updateRowField = async (id: string, patch: Record<string, any>) => {
    // تطبيق التعديل فوراً على الواجهة
    const prev = queryClient.getQueryData<any[]>(["customers"]);
    queryClient.setQueryData<any[]>(["customers"], (old) =>
      (old || []).map((c: any) => c.id === id ? { ...c, ...patch } : c)
    );
    try {
      const { error } = await (supabase as any).from("customers").update(patch).eq("id", id);
      if (error) throw error;
      // تحديث نهائي من DB (اختياري — يضمن التطابق الكامل)
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    } catch (e: any) {
      // Rollback فوري عند الفشل
      if (prev) queryClient.setQueryData(["customers"], prev);
      toast.error(e.message || "فشل التحديث — تم التراجع");
    } finally {
      setSavingRow(null);
    }
  };

  // إضافة سريعة لكيانات مرتبطة (تُستخدم من القائمة المنسدلة بضغطة +)
  const createRegion = async (name: string): Promise<string | null> => {
    const { data, error } = await (supabase as any).from("regions").insert({ name }).select("id,name").single();
    if (error) { toast.error(error.message); return null; }
    setRegions(prev => [...prev, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    toast.success(`تمت إضافة الاتجاه: ${name}`);
    return data.id;
  };
  const createState = async (name: string, regionId: string): Promise<string | null> => {
    if (!regionId) { toast.error("اختر الاتجاه أولاً"); return null; }
    const { data, error } = await (supabase as any).from("states").insert({ name, region_id: regionId }).select("id,name,region_id").single();
    if (error) { toast.error(error.message); return null; }
    setStates(prev => [...prev, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    toast.success(`تمت إضافة الولاية: ${name}`);
    return data.id;
  };
  const createCity = async (name: string, stateId: string | null | undefined): Promise<string | null> => {
    if (!stateId) { toast.error("اختر الولاية أولاً"); return null; }
    const { data, error } = await (supabase as any).from("cities").insert({ name, state_id: stateId }).select("id,name,state_id").single();
    if (error) { toast.error(error.message); return null; }
    setCities(prev => [...prev, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    toast.success(`تمت إضافة المدينة: ${name}`);
    return data.id;
  };
  const createLocality = async (name: string, cityId: string | null | undefined): Promise<string | null> => {
    if (!cityId) { toast.error("اختر المدينة أولاً"); return null; }
    const { data, error } = await (supabase as any).from("localities").insert({ name, city_id: cityId }).select("id,name,city_id").single();
    if (error) { toast.error(error.message); return null; }
    setLocalities(prev => [...prev, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    toast.success(`تمت إضافة المحلية: ${name}`);
    return data.id;
  };
  const deleteCity = async (cityId: string): Promise<boolean> => {
    const used = (customers || []).some((c: any) => c.city_id === cityId);
    if (used) { toast.error("لا يمكن حذف المدينة — مستخدمة من قبل عملاء"); return false; }
    const hasLoc = localities.some(l => l.city_id === cityId);
    if (hasLoc) { toast.error("لا يمكن حذف المدينة — تحتوي محليات"); return false; }
    const { error } = await (supabase as any).from("cities").delete().eq("id", cityId);
    if (error) { toast.error(error.message); return false; }
    setCities(prev => prev.filter(c => c.id !== cityId));
    toast.success("تم حذف المدينة");
    return true;
  };
  const deleteLocality = async (locId: string): Promise<boolean> => {
    const used = (customers || []).some((c: any) => c.locality_id === locId);
    if (used) { toast.error("لا يمكن حذف المحلية — مستخدمة من قبل عملاء"); return false; }
    const { error } = await (supabase as any).from("localities").delete().eq("id", locId);
    if (error) { toast.error(error.message); return false; }
    setLocalities(prev => prev.filter(l => l.id !== locId));
    toast.success("تم حذف المحلية");
    return true;
  };
  const createGroup = async (name: string): Promise<string | null> => {
    const { data, error } = await (supabase as any).from("customer_groups").insert({ name }).select("id,name").single();
    if (error) { toast.error(error.message); return null; }
    setGroups(prev => [...prev, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    toast.success(`تمت إضافة المجموعة: ${name}`);
    return data.id;
  };
  const createTransporter = async (name: string): Promise<string | null> => {
    const { data, error } = await (supabase as any).from("transporters").insert({ name }).select("id,name").single();
    if (error) { toast.error(error.message); return null; }
    setTransporters(prev => [...prev, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    toast.success(`تمت إضافة ترحيلات: ${name}`);
    return data.id;
  };
  const createDestination = async (name: string): Promise<string | null> => {
    const { data, error } = await (supabase as any).from("destinations").insert({ name }).select("id,name").single();
    if (error) { toast.error(error.message); return null; }
    setDestinations(prev => [...prev, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    toast.success(`تمت إضافة الوجهة: ${name}`);
    return data.id;
  };

  const updateCustomerTransporter = async (customerId: string, transporterId: string) => {
    setSavingRow(customerId);
    try {
      await (supabase as any).from("customer_preferred_transporter").delete().eq("customer_id", customerId);
      if (transporterId) {
        const { error } = await (supabase as any).from("customer_preferred_transporter")
          .insert({ customer_id: customerId, transporter_id: transporterId });
        if (error) throw error;
      }
      setCustomerTransporter(prev => ({ ...prev, [customerId]: transporterId }));
    } catch (e: any) {
      toast.error(e.message || "فشل تحديث الترحيلات");
    } finally { setSavingRow(null); }
  };

  const updateCustomerDestination = async (customerId: string, destinationId: string) => {
    setSavingRow(customerId);
    try {
      await (supabase as any).from("customer_destinations").delete().eq("customer_id", customerId);
      if (destinationId) {
        const { error } = await (supabase as any).from("customer_destinations")
          .insert({ customer_id: customerId, destination_id: destinationId, is_default: true });
        if (error) throw error;
      }
      setCustomerDestination(prev => ({ ...prev, [customerId]: destinationId }));
    } catch (e: any) {
      toast.error(e.message || "فشل تحديث الوجهة");
    } finally { setSavingRow(null); }
  };

  // أعمدة جدول العملاء قابلة للسحب — مفاتيح وافتراضات مستقلة لهذه الصفحة
  const CUSTOMERS_COLS_KEY = userScopedLegacyKey("customers-page:colWidths:v2");
  const CUSTOMERS_LOCK_KEY = userScopedLegacyKey("customers-page:colsLocked:v1");
  const CUSTOMERS_DEFAULTS: (number | null)[] = [40, null, null, 110, 130, 130, 110, 130, 130, 130, 140, 160];
  const [colsLocked, setColsLocked] = useSharedColsLocked(() => {
    try { return localStorage.getItem(CUSTOMERS_LOCK_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(CUSTOMERS_LOCK_KEY, colsLocked ? "1" : "0"); } catch {}
  }, [colsLocked]);
  const { widths: colWidths, minWidths: colMinWidths, startDrag: startColDrag, reset: resetColWidths, saveAsUserDefault: saveColDefault, tableProps } = useColumnWidths(
    CUSTOMERS_COLS_KEY,
    CUSTOMERS_DEFAULTS,
    colsLocked,
  );
  const { getHeight: getRowH, startDrag: startRowDrag, resetHeight: resetRowH, locked: rowsLocked, setLocked: setRowsLocked } = useRowHeights("customers:rowH");

  const handleQuickAdd = async () => {
    const name = quickAdd.name.trim();
    if (!name) { toast.error("الاسم مطلوب"); return; }
    const phone = quickAdd.phone.trim();
    if (phone) {
      const dups = findDuplicatesByPhone(phone, null);
      if (dups.length > 0) { toast.error(`رقم الهاتف مكرر — يوجد ${dups.length} عميل آخر`); return; }
    }
    const locErr = validateLocation({ region_id: quickAdd.region_id || null, state_id: quickAdd.state_id || null, city_id: quickAdd.city_id || null });
    if (locErr) { toast.error(locErr); return; }
    setQuickSaving(true);
    try {
      const inserted: any = await insert.mutateAsync({
        name,
        phone: phone || null,
        address: quickAdd.address.trim() || null,
        region_id: quickAdd.region_id || null,
        state_id: quickAdd.state_id || null,
        city_id: quickAdd.city_id || null,
        city: quickAdd.city.trim() || null,
        locality_id: quickAdd.locality_id || null,
        group_id: quickAdd.group_id || null,
      } as any);
      const newId = inserted?.id || inserted?.[0]?.id;
      if (newId) {
        if (quickAdd.transporter_id) await updateCustomerTransporter(newId, quickAdd.transporter_id);
        if (quickAdd.destination_id) await updateCustomerDestination(newId, quickAdd.destination_id);
      }
      toast.success("تم إضافة العميل");
      setQuickAdd({ name: "", address: "", phone: "", region_id: "", state_id: "", city: "", city_id: "", locality_id: "", group_id: "", transporter_id: "", destination_id: "" });
    } catch (e: any) {
      toast.error(e.message || "فشل الإضافة");
    } finally { setQuickSaving(false); }
  };

  const viewIdParam = searchParams.get("view");
  const openView = (c: any) => {
    setViewCustomer(c);
    const next = new URLSearchParams(searchParams);
    next.set("view", c.id);
    setSearchParams(next, { replace: false });
  };
  const closeView = () => {
    if (searchParams.get("view")) {
      const next = new URLSearchParams(searchParams);
      next.delete("view");
      setSearchParams(next, { replace: false });
    } else {
      setViewCustomer(null);
      setViewError(null);
    }
  };

  if (viewIdParam && (viewLoading || viewError) && !viewCustomer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        {viewLoading ? (
          <>
            <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">جاري تحميل بيانات العميل...</p>
          </>
        ) : (
          <>
            <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center text-2xl">!</div>
            <p className="text-base font-semibold text-foreground">{viewError}</p>
            <button
              onClick={closeView}
              className="mt-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"
            >
              العودة لقائمة العملاء
            </button>
          </>
        )}
      </div>
    );
  }

  if (viewCustomer) {
    return (
      <CustomerDetailView
        customer={viewCustomer}
        onBack={closeView}
        onEdit={handleEdit}
        onDelete={(id) => { handleDelete(id); closeView(); }}
      />
    );
  }

  return (
    <div className={(isFullscreen ? "fixed inset-0 z-[100] bg-background overflow-auto p-4 " : "") + (showDashboard ? "space-y-6" : "space-y-3 flex flex-col min-h-[calc(100vh-5rem)]")}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-foreground">عملاء</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setIsFullscreen(s => !s)}
            className="flex items-center gap-2 bg-muted text-foreground border border-border px-3 py-2 rounded-lg text-xs font-medium hover:bg-muted/70 transition-colors"
            title={isFullscreen ? "خروج من ملء الشاشة" : "ملء الشاشة"}>
            {isFullscreen ? <><Minimize2 size={14} /> تصغير</> : <><Maximize2 size={14} /> ملء الشاشة</>}
          </button>
          <button onClick={() => setShowDashboard(s => !s)}
            className="flex items-center gap-2 bg-muted text-foreground border border-border px-3 py-2 rounded-lg text-xs font-medium hover:bg-muted/70 transition-colors"
            title={showDashboard ? "إخفاء لوحة التحكم" : "إظهار لوحة التحكم"}>
            {showDashboard ? "🙈 إخفاء اللوحة" : "👁 إظهار اللوحة"}
          </button>
          <div className="relative">
            <button
              ref={shortcutsBtnRef}
              onClick={() => setShortcutsOpen(o => !o)}
              className="flex items-center gap-2 bg-muted text-foreground border border-border px-3 py-2 rounded-lg text-xs font-medium hover:bg-muted/70 transition-colors"
              title="عرض اختصارات لوحة المفاتيح"
            >
              💡 الاختصارات
            </button>
            {shortcutsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShortcutsOpen(false)} />
                <div
                  ref={shortcutsPopRef}
                  tabIndex={-1}
                  role="dialog"
                  aria-label="اختصارات لوحة المفاتيح"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setShortcutsOpen(false);
                      shortcutsBtnRef.current?.focus();
                    }
                  }}
                  dir="rtl"
                  className="absolute z-50 mt-1 left-0 bg-card border border-border rounded-lg shadow-lg p-3 min-w-[280px] text-[12px] space-y-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <div className="font-semibold text-foreground border-b border-border pb-1.5 mb-1">اختصارات لوحة المفاتيح</div>
                  <div className="flex items-center gap-2"><kbd className="px-1.5 py-0.5 rounded border border-border bg-background font-mono text-[10px] min-w-[20px] text-center">F9</kbd><span className="text-muted-foreground">إضافة عميل</span></div>
                  <div className="flex items-center gap-2"><kbd className="px-1.5 py-0.5 rounded border border-border bg-background font-mono text-[10px]">Enter</kbd><span className="text-muted-foreground">الانتقال للخلية أسفل</span></div>
                  <div className="flex items-center gap-2"><kbd className="px-1.5 py-0.5 rounded border border-border bg-background font-mono text-[10px]">Shift</kbd>+<kbd className="px-1.5 py-0.5 rounded border border-border bg-background font-mono text-[10px]">Enter</kbd><span className="text-muted-foreground">الانتقال للخلية أعلى</span></div>
                  <div className="flex items-center gap-2"><kbd className="px-1.5 py-0.5 rounded border border-border bg-background font-mono text-[10px]">↑ ↓ ← →</kbd><span className="text-muted-foreground">التنقل بين الخلايا</span></div>
                  <div className="flex items-center gap-2"><kbd className="px-1.5 py-0.5 rounded border border-border bg-background font-mono text-[10px]">Esc</kbd><span className="text-muted-foreground">إلغاء التعديل / إغلاق هذه النافذة</span></div>
                </div>
              </>
            )}
          </div>
          <button onClick={() => setRecentDebtorsOpen(true)}
            className="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/30 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-destructive/20 transition-colors">
            🔻 آخر المديونين
          </button>
          <button onClick={() => setShowGeo(true)}
            className="flex items-center gap-2 bg-muted text-foreground border border-border px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors">
            🗺️ الهيكل الجغرافي
          </button>
          <button onClick={() => { setDialogInitial(null); setDialogOpen(true); }}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
            <Plus size={16} /> عميل جديد
          </button>
        </div>
      </div>

      {/* أزرار تصفية النشاط/الديون — أعلى الصفحة */}
      <div className="flex flex-wrap gap-2" dir="rtl">
        {([
          { v: "all", label: "الكل" },
          { v: "with_balance", label: "عليه دين" },
          { v: "with_credit", label: "له سلفة" },
          { v: "active_30", label: "نشط اليوم" },
          { v: "active_90", label: "نشط 90 يوم" },
          { v: "inactive_90", label: "خامل +90 يوم" },
          { v: "no_activity", label: "بدون نشاط" },
        ] as { v: ActivityFilter; label: string }[]).map(s => (
          <button
            key={s.v}
            type="button"
            onClick={() => { setFilterActivity(s.v); setPage(1); }}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition ${filterActivity === s.v ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <Sheet open={recentDebtorsOpen} onOpenChange={(o) => { setRecentDebtorsOpen(o); if (!o) setRecentDebtorsSearch(""); }}>
        <SheetContent side="left" className="w-full min-w-0 sm:max-w-lg overflow-y-auto" dir="rtl">
          <SheetHeader>
            <SheetTitle>{recentDebtorsSearch ? "نتائج البحث في المديونين" : "آخر 10 عملاء مديونين"}</SheetTitle>
          </SheetHeader>
          <div className="mt-3 relative">
            <Search size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={recentDebtorsSearch}
              onChange={(e) => setRecentDebtorsSearch(e.target.value)}
              placeholder="ابحث بالاسم أو رقم الهاتف..."
              className="w-full min-w-0 bg-background border border-border rounded-md text-sm pr-7 pl-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="mt-3 space-y-2">
            {recentDebtors.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">{recentDebtorsSearch ? "لا توجد نتائج مطابقة" : "لا يوجد عملاء مديونون"}</div>
            ) : recentDebtors.map((c: any, i: number) => {
              const fmtD = c._last ? c._last.split("-").reverse().join("-") : "—";
              const debt = Number(c.balance || 0);
              const credit = Number(c.credit_balance || 0);
              const net = debt - credit;
              const reason = (c.notes || c.debt_reason || "").toString().trim();
              return (
                <button
                  key={c.id}
                  onClick={() => { setRecentDebtorsOpen(false); setTimeout(() => goToCustomer(c.id), 100); }}
                  className="w-full min-w-0 text-right bg-card border border-border rounded-lg p-3 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground font-bold w-5">{i + 1}</span>
                      <span className="font-medium text-foreground truncate">{c.name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{fmtD}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
                    <div className="bg-destructive/10 rounded px-2 py-1 text-center">
                      <div className="text-muted-foreground">المديونية</div>
                      <div className="font-bold tabular-nums text-destructive">{debt.toLocaleString()}</div>
                    </div>
                    <div className="bg-emerald-500/10 rounded px-2 py-1 text-center">
                      <div className="text-muted-foreground">الدائن</div>
                      <div className="font-bold tabular-nums text-emerald-600">{credit.toLocaleString()}</div>
                    </div>
                    <div className={`rounded px-2 py-1 text-center ${net > 0 ? "bg-destructive/15" : net < 0 ? "bg-emerald-500/15" : "bg-muted"}`}>
                      <div className="text-muted-foreground">الصافي</div>
                      <div className={`font-bold tabular-nums ${net > 0 ? "text-destructive" : net < 0 ? "text-emerald-600" : "text-foreground"}`}>
                        {Math.abs(net).toLocaleString()} <span className="text-[9px] font-normal">{net > 0 ? "عليه" : net < 0 ? "له" : ""}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start justify-between mt-2 gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">
                      {reason ? <><span className="text-foreground/70">السبب:</span> {reason}</> : <span className="opacity-60">— لا يوجد سبب —</span>}
                    </span>
                    {c.phone && <span className="tabular-nums whitespace-nowrap">{c.phone}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>


      <CustomerFormDialog
        open={dialogOpen}
        initial={dialogInitial}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["customers"] });
          queryClient.invalidateQueries({ queryKey: ["customer_balance_stats"] });
        }}
      />

      <Sheet open={balanceSheetOpen} onOpenChange={setBalanceSheetOpen}>
        <SheetContent side="left" className="w-full min-w-0 sm:max-w-lg overflow-y-auto" dir="rtl">
          <SheetHeader>
            <SheetTitle>ملخص حركة الديون</SheetTitle>
          </SheetHeader>

          {/* Toggle */}
          <div className="mt-4 grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
            <button
              onClick={() => setBalanceSheetView("debt")}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${balanceSheetView === "debt" ? "bg-card text-destructive shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              مدينون ({stats.debtors})
            </button>
            <button
              onClick={() => setBalanceSheetView("credit")}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${balanceSheetView === "credit" ? "bg-card text-emerald-600 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              دائنون ({stats.creditors})
            </button>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-[10px] text-muted-foreground mb-1">مجموع الديون</div>
              <div className="font-bold text-destructive text-sm tabular-nums">{stats.totalDebt.toLocaleString()}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-[10px] text-muted-foreground mb-1">مجموع السلف</div>
              <div className="font-bold text-emerald-600 text-sm tabular-nums">{stats.totalCredit.toLocaleString()}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-[10px] text-muted-foreground mb-1">الصافي</div>
              <div className={`font-bold text-sm tabular-nums ${stats.net >= 0 ? "text-destructive" : "text-emerald-600"}`}>
                {Math.abs(stats.net).toLocaleString()}
              </div>
            </div>
          </div>

          {/* List */}
          <div className="mt-4 space-y-2">
            {(() => {
              const list = (customers || [])
                .map((c: any) => ({
                  ...c,
                  _debt: Number(c.balance || 0),
                  _credit: Number(c.credit_balance || 0),
                  _net: Number(c.balance || 0) - Number(c.credit_balance || 0),
                }))
                .filter((c: any) => balanceSheetView === "debt" ? c._debt > 0 : c._credit > 0)
                .sort((a: any, b: any) => balanceSheetView === "debt" ? b._debt - a._debt : b._credit - a._credit);

              if (list.length === 0) {
                return <div className="text-center text-sm text-muted-foreground py-8">لا يوجد عملاء في هذه القائمة</div>;
              }

              return list.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => { setBalanceSheetOpen(false); setTimeout(() => goToCustomer(c.id), 100); }}
                  className="w-full min-w-0 text-right bg-card border border-border rounded-lg p-3 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-foreground truncate">{c.name}</div>
                    <div className={`font-bold tabular-nums text-sm ${balanceSheetView === "debt" ? "text-destructive" : "text-emerald-600"}`}>
                      {(balanceSheetView === "debt" ? c._debt : c._credit).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                    <span>دين: {c._debt.toLocaleString()} • سلفة: {c._credit.toLocaleString()}</span>
                    <span className={c._net > 0 ? "text-destructive" : c._net < 0 ? "text-emerald-600" : ""}>
                      صافي: {Math.abs(c._net).toLocaleString()} {c._net > 0 ? "مدين" : c._net < 0 ? "دائن" : ""}
                    </span>
                  </div>
                </button>
              ));
            })()}
          </div>
        </SheetContent>
      </Sheet>


      {/* لوحة تحكم — ملخص مستحقات العملاء */}
      {showDashboard && (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-1 flex items-center justify-between gap-2">
            <span>{hasActiveFilter ? "العملاء (مفلتر)" : "إجمالي العملاء"}</span>
            {hasActiveFilter && <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded">فلتر</span>}
          </div>
          <div className="text-xl font-bold text-foreground">{stats.count.toLocaleString()}</div>
        </div>
        <button
          onClick={() => { setBalanceSheetView("debt"); setBalanceSheetOpen(true); }}
          className="bg-card border border-border rounded-xl p-4 text-right hover:border-destructive/50 transition-colors"
        >
          <div className="text-xs text-muted-foreground mb-1">إجمالي الديون (لي على العملاء)</div>
          <div className="text-xl font-bold text-destructive">{stats.totalDebt.toLocaleString()}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{stats.debtors} عميل مدين</div>
        </button>
        <button
          onClick={() => { setBalanceSheetView("credit"); setBalanceSheetOpen(true); }}
          className="bg-card border border-border rounded-xl p-4 text-right hover:border-emerald-500/50 transition-colors"
        >
          <div className="text-xs text-muted-foreground mb-1">سلف/دفعات مقدمة (لهم عليّ)</div>
          <div className="text-xl font-bold text-emerald-600">{stats.totalCredit.toLocaleString()}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{stats.creditors} عميل دائن</div>
        </button>
        <div className="bg-card border border-border rounded-xl p-4 col-span-2 lg:col-span-2">
          <div className="text-xs text-muted-foreground mb-1">صافي المستحقات</div>
          <div className={`text-xl font-bold ${stats.net >= 0 ? "text-destructive" : "text-emerald-600"}`}>
            {Math.abs(stats.net).toLocaleString()}
            <span className="text-xs font-normal text-muted-foreground mr-2">
              {stats.net >= 0 ? "مستحق لي" : "مستحق عليّ"}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">= الديون − السلف</div>
        </div>
      </div>
      )}


      {showForm && (
        <div className="customers-inline-form bg-card rounded-xl border border-border p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-foreground">{editId ? "تعديل العميل" : "إضافة عميل جديد"}</h3>
          <LocationPicker
            value={{ region_id: form.region_id || null, state_id: form.state_id || null, locality_id: form.locality_id || null, city_id: form.city_id || null }}
            onChange={loc => setForm({ ...form, region_id: (loc.region_id as any) || "", state_id: (loc.state_id as any) || "", locality_id: (loc.locality_id as any) || "", city_id: (loc.city_id as any) || "" })}
            required
            inputCls={inputCls}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <input placeholder="الاسم *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
            <div>
              <input placeholder="الهاتف" value={form.phone} onChange={e => { setForm({ ...form, phone: e.target.value }); setDuplicates([]); }} className={inputCls} />
              {form.phone && findDuplicatesByPhone(form.phone, editId).length > 0 && (
                <p className="text-xs text-destructive mt-1">⚠ هذا الرقم مستخدم بالفعل ({findDuplicatesByPhone(form.phone, editId).length})</p>
              )}
            </div>
            <input placeholder="المدينة" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className={inputCls} />
            <input placeholder="العنوان" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className={inputCls} />
            <input placeholder="ملاحظات" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={`${inputCls} md:col-span-2 lg:col-span-1`} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90">{editId ? "تحديث" : "إضافة"}</button>
            <button onClick={() => { setShowForm(false); setEditId(null); setDuplicates([]); }} className="bg-muted text-muted-foreground px-6 py-2 rounded-lg text-sm">إلغاء</button>
          </div>
          {duplicates.length > 0 && (
            <div className="mt-4 border border-destructive/40 bg-destructive/5 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-destructive text-sm">⚠ تم العثور على عملاء بنفس رقم الهاتف — راجع السجلات قبل المتابعة</h4>
              <div className="space-y-2">
                {duplicates.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between bg-card border border-border rounded-md px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-foreground">{c.name}</span>
                      <span className="text-muted-foreground"> — {c.phone}</span>
                      
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { openView(c); setShowForm(false); setDuplicates([]); }} className="text-primary hover:underline text-xs">عرض</button>
                      <button onClick={() => { handleEdit(c); setDuplicates([]); }} className="text-primary hover:underline text-xs">تعديل</button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">إذا كان هذا عميل مختلف فعلاً، عدّل الرقم. وإلا فاستخدم السجل الموجود بدلاً من إنشاء جديد.</p>
            </div>
          )}
        </div>
      )}

      {/* On mobile: open the same form full-screen as a Sheet so the user can navigate fields easily */}
      <Sheet open={showForm && isMobile} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditId(null); setDuplicates([]); } }}>
        <SheetContent side="bottom" className="customers-form-sheet h-[100dvh] w-screen max-w-none p-0 overflow-y-auto" dir="rtl">
          <SheetHeader className="sticky top-0 bg-card border-b border-border px-4 py-3 z-10">
            <SheetTitle className="text-base">{editId ? "تعديل العميل" : "إضافة عميل جديد"}</SheetTitle>
          </SheetHeader>
          <div className="p-4 space-y-4">
            <LocationPicker
              value={{ region_id: form.region_id || null, state_id: form.state_id || null, locality_id: form.locality_id || null, city_id: form.city_id || null }}
              onChange={loc => setForm({ ...form, region_id: (loc.region_id as any) || "", state_id: (loc.state_id as any) || "", locality_id: (loc.locality_id as any) || "", city_id: (loc.city_id as any) || "" })}
              required
              inputCls={inputCls}
            />
            <div className="grid grid-cols-1 gap-3">
              <input placeholder="الاسم *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
              <input placeholder="الهاتف" value={form.phone} onChange={e => { setForm({ ...form, phone: e.target.value }); setDuplicates([]); }} className={inputCls} />
              <input placeholder="المدينة" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className={inputCls} />
              <input placeholder="العنوان" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className={inputCls} />
              <textarea placeholder="ملاحظات" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} rows={3} />
            </div>
            <div className="flex gap-2 pt-2 sticky bottom-0 bg-card pb-2">
              <button onClick={handleSubmit} className="flex-1 bg-primary text-primary-foreground px-4 py-3 rounded-lg text-sm font-medium">{editId ? "تحديث" : "إضافة"}</button>
              <button onClick={() => { setShowForm(false); setEditId(null); setDuplicates([]); }} className="flex-1 bg-muted text-muted-foreground px-4 py-3 rounded-lg text-sm">إلغاء</button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <style>{`
        ${mobileDocListCSS}
        .mobile-customers-list { display: none; }
        @media (max-width: 767px) {
          /* hide the inline desktop form on mobile (Sheet replaces it) */
          .customers-inline-form { display: none !important; }
          /* hide the desktop table area, show cards instead */
          .customers-desktop-table { display: none !important; }
          .mobile-customers-list { display: block; padding: 6px 4px; }
        }
        @media (min-width: 768px) {
          /* hide the mobile sheet trigger version on desktop is automatic since Sheet is closed */
        }
      `}</style>


      <article className={`content invoices-compact ${!showDashboard ? "flex-1 flex flex-col" : ""}`}>
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
          .invoices-compact .legacy-table tbody tr.odd { background: hsl(var(--background)); }
          .invoices-compact .legacy-table tbody tr.even { background: hsl(var(--muted) / 0.35); }
          .invoices-compact .legacy-table tbody tr:hover { background: hsl(var(--primary) / 0.08); }
          .invoices-compact .btn-xs { padding: 3px 8px; font-size: 13px; height: 26px; line-height: 20px; font-weight: 700; }
          .invoices-compact .legacy-actions { gap: 3px; }
          .invoices-compact .legacy-pagination .page-link { padding: 3px 10px; font-size: 14px; font-weight: 600; }
          .invoices-compact .legacy-dt-info { font-size: 14px; padding: 4px 0; font-weight: 600; }
        `}</style>
        <div className="legacy-card">
          <div className="grid_3 grid_4 table-responsive">
            <h5>العملاء</h5>
            <hr />

            <div className="legacy-dt-toolbar">
              <label>
                عرض
                <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                سجل
              </label>
              <label>
                بحث:
                <input
                  type="search"
                  placeholder="اسم/هاتف/مدينة..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                />
              </label>
              {!colsLocked ? (
                <>
                  <button
                    type="button"
                    className="btn-xxs btn-success"
                    title={COLS_BTN_SAVE_TITLE}
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
                <button
                  type="button"
                  className="btn-xxs btn-warning"
                  title={COLS_BTN_EDIT_TITLE}
                  onClick={() => { setColsLocked(false); toast(COLS_TOAST_EDIT_MODE); }}
                >✎</button>
              )}
              <button
                type="button"
                className={rowsLocked ? "btn-xxs btn-warning" : "btn-xxs btn-success"}
                title={rowsLocked ? "تفعيل تغيير ارتفاع كل صف بسحب حافته السفلى" : "قفل ارتفاع الصفوف"}
                onClick={() => { setRowsLocked(v => !v); toast(rowsLocked ? "وضع تعديل ارتفاع الصفوف — اسحب الحافة السفلى لكل صف" : "تم قفل ارتفاع الصفوف"); }}
              >{rowsLocked ? "↕" : "🔒"}</button>
              <a href="/dev/fields-playground" target="_blank" rel="noopener" className="btn-xxs btn-info" title="فتح صفحة اختبار الحقول والقوائم">🧪</a>
              {activeFiltersCount > 0 && (
                <button type="button" className="btn-xxs btn-warning" onClick={clearFilters} title="مسح الفلاتر">
                  ✕ {activeFiltersCount}
                </button>
              )}
              <style>{`
                .btn-xxs { padding: 1px 6px !important; font-size: 10px !important; line-height: 1.2 !important; min-height: 0 !important; height: 22px !important; border-radius: 3px !important; display: inline-flex; align-items: center; }
                .btn-xxs.btn-success { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border: 1px solid hsl(var(--primary)); }
                .btn-xxs.btn-warning { background: hsl(45 95% 55%); color: #000; border: 1px solid hsl(45 95% 50%); }
                .btn-xxs.btn-info { background: hsl(200 80% 50%); color: #fff; border: 1px solid hsl(200 80% 45%); text-decoration: none; }
              `}</style>
            </div>
            <style>{`
              .customers-grid td:focus-within,
              .customers-grid th:focus-within {
                outline: 2px solid hsl(var(--primary));
                outline-offset: -2px;
                background: hsl(var(--primary) / 0.10) !important;
                box-shadow: inset 0 0 0 9999px hsl(var(--primary) / 0.06);
              }
              .customers-grid tr:focus-within > td {
                background: hsl(var(--primary) / 0.04);
              }
              .customers-grid input:focus,
              .customers-grid select:focus,
              .customers-grid textarea:focus {
                outline: none;
                box-shadow: 0 0 0 2px hsl(var(--primary) / 0.45);
                border-color: hsl(var(--primary)) !important;
              }
            `}</style>
            <div
              className="items-scroll customers-grid customers-desktop-table"
              style={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto", overflowX: "auto", border: "1px solid hsl(var(--border))", borderRadius: 4 }}
              onKeyDown={(e) => {
                const target = e.target as HTMLElement;
                if (!target) return;
                const isFocusable = ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName) || target.hasAttribute("tabindex");
                if (!isFocusable) return;
                const isArrow = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key);
                const isEnter = e.key === "Enter";
                if (!isArrow && !isEnter) return;
                // لا تتدخل في تحرير النص داخل input نصي عند الأسهم اليمين/يسار
                if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && target.tagName === "INPUT") {
                  const inp = target as HTMLInputElement;
                  if (inp.type !== "checkbox" && inp.selectionStart !== inp.selectionEnd) return;
                  if (inp.type !== "checkbox" && inp.selectionStart !== 0 && e.key === "ArrowLeft") return;
                  if (inp.type !== "checkbox" && inp.selectionStart !== inp.value.length && e.key === "ArrowRight") return;
                }
                // Enter داخل input يجب أن يحفظ أولًا (commit) قبل التنقل — لا نتدخل
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
              <table className="legacy-table" cellSpacing={0} style={{ width: "100%", tableLayout: "fixed" }} {...tableProps}>
                <colgroup>
                  {(() => {
                    // إن كان هناك أي عرض رقمي محفوظ ⇒ استخدم بكسلات صريحة (يضمن أن السحب يغيّر العمود فعلياً)
                    // وإلا (الحالة الافتراضية الأولى) ⇒ نِسب مئوية لتعبئة الحاوية بسلاسة
                    const anyExplicit = colWidths.some(w => typeof w === "number");
                    if (anyExplicit) {
                      return colWidths.map((w, i) => {
                        const px = typeof w === "number" ? w : (colMinWidths[i] ?? 100);
                        return <col key={i} style={{ width: `${px}px`, minWidth: colMinWidths[i] ?? undefined }} />;
                      });
                    }
                    const effective = colWidths.map((w, i) => (w != null ? w : (colMinWidths[i] ?? 100)));
                    const total = effective.reduce((s, v) => s + v, 0) || 1;
                    return colWidths.map((_, i) => {
                      const pct = (effective[i] / total) * 100;
                      const minW = colMinWidths[i] ?? undefined;
                      return <col key={i} style={{ width: `${pct}%`, minWidth: minW }} />;
                    });
                  })()}
                </colgroup>
                <thead style={{ position: "sticky", top: 0, zIndex: 5, background: "hsl(var(--card))" }}>
                  <tr>
                    <th style={{ position: "relative" }}>{filterActivity === "with_balance" ? "المديونية" : filterActivity === "with_credit" ? "الدائن" : "#"}<ColumnResizeHandle onMouseDown={(e) => startColDrag(0, e)} hidden={colsLocked} /></th>
                    {(() => {
                      const headers: { i: number; key: string; label: string; filter?: { kind: "text" | "select"; value: string; setValue: (v: string) => void; options?: { value: string; label: string }[]; placeholder?: string } }[] = [
                        { i: 1, key: "name", label: "اسم العميل", filter: { kind: "text", value: filterName, setValue: setFilterName, placeholder: "ابحث بالاسم..." } },
                        { i: 2, key: "address", label: "عنوان", filter: { kind: "text", value: filterAddress, setValue: setFilterAddress, placeholder: "ابحث بالعنوان..." } },
                        { i: 3, key: "phone", label: "هاتف", filter: { kind: "text", value: filterPhone, setValue: setFilterPhone, placeholder: "ابحث بالهاتف..." } },
                        { i: 4, key: "region", label: "الاتجاه", filter: { kind: "select", value: filterRegion, setValue: (v) => { setFilterRegion(v); setFilterState(""); setFilterCity(""); setFilterLocality(""); }, options: regions.map(r => ({ value: r.id, label: r.name })) } },
                        { i: 5, key: "state", label: "الولاية", filter: { kind: "select", value: filterState, setValue: (v) => { setFilterState(v); setFilterCity(""); setFilterLocality(""); }, options: filteredStates.map(s => ({ value: s.id, label: s.name })) } },
                        { i: 6, key: "city", label: "المدينة", filter: { kind: "select", value: filterCity, setValue: (v) => { setFilterCity(v); setFilterLocality(""); }, options: filteredCities.map(c => ({ value: c.id, label: c.name })) } },
                        { i: 7, key: "locality", label: "المحلية", filter: { kind: "select", value: filterLocality, setValue: setFilterLocality, options: (filterCity ? localities.filter(l => l.city_id === filterCity) : filteredLocalities).map(l => ({ value: l.id, label: l.name })) } },
                        { i: 8, key: "group", label: "المجموعة", filter: { kind: "select", value: filterGroup, setValue: setFilterGroup, options: groups.map(g => ({ value: g.id, label: g.name })) } },
                        { i: 9, key: "transporter", label: "ترحيلات", filter: { kind: "select", value: filterTransporter, setValue: setFilterTransporter, options: transporters.map(t => ({ value: t.id, label: t.name })) } },
                        { i: 10, key: "destination", label: "الوجهة", filter: { kind: "select", value: filterDestination, setValue: setFilterDestination, options: destinations.map(d => ({ value: d.id, label: d.name })) } },
                      ];
                      return headers.map(col => {
                        const filterActive = !!col.filter?.value;
                        const isOpen = openFilter?.key === col.key;
                        const mode = isOpen ? openFilter!.mode : null;
                        const onHeaderClick = () => {
                          if (!col.filter) return;
                          if (!isOpen) { setOpenFilter({ key: col.key, mode: col.filter.kind === "select" ? "search" : "list" }); setFilterQuery(""); setFilterHighlight(0); }
                          else { setOpenFilter(null); setFilterQuery(""); }
                        };
                        const filteredOptions = col.filter?.kind === "select" && filterQuery
                          ? col.filter.options!.filter(o => o.label.toLowerCase().includes(filterQuery.toLowerCase()))
                          : col.filter?.options || [];
                        return (
                          <th key={col.i} style={{ position: "relative", userSelect: "none", cursor: col.filter ? "pointer" : "default", background: filterActive ? "hsl(var(--primary) / 0.15)" : undefined }} onClick={onHeaderClick} title={col.filter ? "ضغطة: قائمة • ضغطتان: بحث" : undefined}>
                            {col.label}
                            {col.filter && <span style={{ marginInlineStart: 4, fontSize: 9, color: filterActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>{col.filter.kind === "select" ? "🔍" : "▾"}</span>}
                            {isOpen && col.filter && (
                              <>
                                <div onClick={(e) => { e.stopPropagation(); setOpenFilter(null); setFilterQuery(""); }} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
                                <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", insetInlineStart: 0, top: "100%", marginTop: 2, zIndex: 51, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: 6, minWidth: 200 }}>
                                  {col.filter.kind === "text" ? (
                                    <div style={{ position: "relative" }}>
                                      <input
                                        autoFocus
                                        type="text"
                                        value={col.filter.value}
                                        placeholder={col.filter.placeholder}
                                        onChange={(e) => { col.filter!.setValue(e.target.value); setPage(1); }}
                                        onKeyDown={(e) => { if (e.key === "Escape") { setOpenFilter(null); setFilterQuery(""); } else if (e.key === "Enter") { setOpenFilter(null); } }}
                                        style={{ width: "100%", padding: "4px 22px 4px 6px", fontSize: 11, border: "1px solid hsl(var(--border))", borderRadius: 3, background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}
                                      />
                                      {col.filter.value && (
                                        <button type="button" onClick={() => { col.filter!.setValue(""); setPage(1); }} title="مسح" style={{ position: "absolute", insetInlineEnd: 4, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "hsl(var(--muted-foreground))", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
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
                                            else if (e.key === "ArrowDown") { e.preventDefault(); setFilterHighlight(h => Math.min(h + 1, filteredOptions.length - 1)); }
                                            else if (e.key === "ArrowUp") { e.preventDefault(); setFilterHighlight(h => Math.max(h - 1, 0)); }
                                            else if (e.key === "Enter") {
                                              e.preventDefault();
                                              const o = filteredOptions[filterHighlight];
                                              if (o) { col.filter!.setValue(o.value); setPage(1); setOpenFilter(null); setFilterQuery(""); }
                                            }
                                          }}
                                          style={{ width: "100%", padding: "4px 22px 4px 6px", fontSize: 11, border: "1px solid hsl(var(--border))", borderRadius: 3, background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}
                                        />
                                        {filterQuery && (
                                          <button type="button" onClick={() => { setFilterQuery(""); setFilterHighlight(0); }} title="مسح البحث" style={{ position: "absolute", insetInlineEnd: 4, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "hsl(var(--muted-foreground))", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
                                        )}
                                      </div>
                                      <div style={{ maxHeight: 180, overflowY: "auto", marginTop: 4, border: "1px solid hsl(var(--border))", borderRadius: 3 }}>
                                        <button type="button" onClick={() => { col.filter!.setValue(""); setPage(1); setOpenFilter(null); setFilterQuery(""); }} style={{ display: "block", width: "100%", textAlign: "right", padding: "4px 6px", fontSize: 11, background: "transparent", border: "none", borderBottom: "1px solid hsl(var(--border))", cursor: "pointer", color: "hsl(var(--muted-foreground))" }}>— الكل —</button>
                                        {filteredOptions.length === 0 ? (
                                          <div style={{ padding: "10px 6px", fontSize: 11, color: "hsl(var(--muted-foreground))", textAlign: "center" }}>
                                            {filterQuery ? `لا نتائج لـ "${filterQuery}"` : "لا توجد عناصر"}
                                          </div>
                                        ) : filteredOptions.map((o, i) => (
                                          <button key={o.value} type="button"
                                            onMouseEnter={() => setFilterHighlight(i)}
                                            onClick={() => { col.filter!.setValue(o.value); setPage(1); setOpenFilter(null); setFilterQuery(""); }}
                                            style={{ display: "block", width: "100%", textAlign: "right", padding: "4px 6px", fontSize: 11, background: i === filterHighlight ? "hsl(var(--primary) / 0.2)" : (col.filter!.value === o.value ? "hsl(var(--primary) / 0.1)" : "transparent"), border: "none", cursor: "pointer", color: "hsl(var(--foreground))" }}>{o.label}</button>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                  {filterActive && (
                                    <button type="button" onClick={() => { col.filter!.setValue(""); setPage(1); setOpenFilter(null); setFilterQuery(""); }} style={{ marginTop: 4, width: "100%", padding: "3px 6px", fontSize: 10, border: "1px solid hsl(var(--border))", borderRadius: 3, background: "hsl(var(--muted))", cursor: "pointer" }}>✕ مسح الفلتر</button>
                                  )}
                                </div>
                              </>
                            )}
                            <ColumnResizeHandle onMouseDown={(e) => { e.stopPropagation(); startColDrag(col.i, e); }} hidden={colsLocked} />
                          </th>
                        );
                      });
                    })()}
                    <th style={{ position: "relative" }}>إعدادات<ColumnResizeHandle onMouseDown={(e) => startColDrag(11, e)} hidden={colsLocked} /></th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: "hsl(var(--primary) / 0.06)", borderBottom: "2px solid hsl(var(--primary) / 0.3)" }}>
                    <td style={{ textAlign: "center", fontWeight: 700, color: "hsl(var(--primary))" }}>+</td>
                    <td>
                      <input
                        type="text"
                        value={quickAdd.name}
                        onChange={(e) => setQuickAdd({ ...quickAdd, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(); }}
                        placeholder="اسم العميل الجديد..."
                        disabled={quickSaving}
                        className="bg-background border border-border rounded px-1 py-0.5 text-[12px] w-full min-w-0 font-medium"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={quickAdd.address}
                        onChange={(e) => setQuickAdd({ ...quickAdd, address: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(); }}
                        placeholder="العنوان"
                        disabled={quickSaving}
                        className="bg-background border border-border rounded px-1 py-0.5 text-[11px] w-full min-w-0"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={quickAdd.phone}
                        onChange={(e) => setQuickAdd({ ...quickAdd, phone: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(); }}
                        placeholder="الهاتف"
                        inputMode="tel"
                        dir="ltr"
                        disabled={quickSaving}
                        className="bg-background border border-border rounded px-1 py-0.5 text-[11px] w-full min-w-0 tabular-nums"
                        style={quickAdd.phone && findDuplicatesByPhone(quickAdd.phone).length > 0 ? { borderColor: "hsl(var(--destructive))" } : undefined}
                        title={quickAdd.phone && findDuplicatesByPhone(quickAdd.phone).length > 0 ? "رقم مكرر" : undefined}
                      />
                    </td>
                    <td>
                      <InlineSearchSelect
                        value={quickAdd.region_id}
                        options={regions.map(r => ({ value: r.id, label: r.name }))}
                        onChange={(v) => setQuickAdd({ ...quickAdd, region_id: v, state_id: "", city_id: "", locality_id: "" })}
                        onAdd={async (name) => await createRegion(name)}
                        placeholder="— الاتجاه —"
                        addLabel="إضافة منطقة"
                        disabled={quickSaving}
                      />
                    </td>
                    <td>
                      <InlineSearchSelect
                        value={quickAdd.state_id}
                        options={states.filter(s => !quickAdd.region_id || s.region_id === quickAdd.region_id).map(s => ({ value: s.id, label: s.name }))}
                        onChange={(v) => setQuickAdd({ ...quickAdd, state_id: v, city_id: "", locality_id: "" })}
                        onAdd={async (name) => await createState(name, quickAdd.region_id)}
                        placeholder="— الولاية —"
                        addLabel="إضافة ولاية"
                        disabled={quickSaving || !quickAdd.region_id}
                      />
                    </td>
                    <td>
                      <InlineSearchSelect
                        value={quickAdd.city_id}
                        options={cities.filter(ci => !quickAdd.state_id || ci.state_id === quickAdd.state_id).map(ci => ({ value: ci.id, label: ci.name }))}
                        onChange={(v) => setQuickAdd({ ...quickAdd, city_id: v, locality_id: "" })}
                        onAdd={async (name) => await createCity(name, quickAdd.state_id)}
                        onDelete={async (o) => await deleteCity(o.value)}
                        placeholder="— المدينة —"
                        addLabel="إضافة مدينة"
                        disabled={quickSaving || !quickAdd.state_id}
                      />
                    </td>
                    <td>
                      <InlineSearchSelect
                        value={(quickAdd as any).locality_id || ""}
                        options={localities.filter(l => !quickAdd.city_id || l.city_id === quickAdd.city_id).map(l => ({ value: l.id, label: l.name }))}
                        onChange={(v) => setQuickAdd({ ...quickAdd, locality_id: v } as any)}
                        onAdd={async (name) => await createLocality(name, quickAdd.city_id)}
                        onDelete={async (o) => await deleteLocality(o.value)}
                        placeholder="— المحلية —"
                        addLabel="إضافة محلية"
                        disabled={quickSaving || !quickAdd.city_id}
                      />
                    </td>
                    <td>
                      <InlineSearchSelect
                        value={quickAdd.group_id}
                        options={groups.map(g => ({ value: g.id, label: g.name }))}
                        onChange={(v) => setQuickAdd({ ...quickAdd, group_id: v })}
                        onAdd={async (name) => await createGroup(name)}
                        placeholder="— المجموعة —"
                        addLabel="إضافة مجموعة"
                        disabled={quickSaving}
                      />
                    </td>
                    <td>
                      <InlineSearchSelect
                        value={quickAdd.transporter_id}
                        options={transporters.map(t => ({ value: t.id, label: t.name }))}
                        onChange={(v) => setQuickAdd({ ...quickAdd, transporter_id: v })}
                        onAdd={async (name) => await createTransporter(name)}
                        placeholder="— ترحيلات —"
                        addLabel="إضافة ناقل"
                        disabled={quickSaving}
                      />
                    </td>
                    <td>
                      <InlineSearchSelect
                        value={quickAdd.destination_id}
                        options={destinations.map(d => ({ value: d.id, label: d.name }))}
                        onChange={(v) => setQuickAdd({ ...quickAdd, destination_id: v })}
                        onAdd={async (name) => await createDestination(name)}
                        placeholder="— الوجهة —"
                        addLabel="إضافة وجهة"
                        disabled={quickSaving}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={handleQuickAdd}
                        disabled={quickSaving || !quickAdd.name.trim()}
                        className="btn-xs btn-success"
                        title="إضافة عميل (Enter)"
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                      >
                        {quickSaving ? "..." : "➕"}
                      </button>
                    </td>
                  </tr>
                  {isLoading ? (
                    <tr><td colSpan={12} style={{ textAlign: "center", padding: 30 }}>Processing...</td></tr>
                  ) : paginated.length === 0 ? (
                    <tr><td colSpan={12} style={{ textAlign: "center", padding: 30 }}>لا يوجد عملاء</td></tr>
                  ) : paginated.map((c: any, i: number) => {
                    const rowCls = ((page - 1) * perPage + i) % 2 === 0 ? "odd" : "even";
                    const rowH = getRowH(c.id);
                    return (
                      <tr
                        key={c.id}
                        id={`customer-row-${c.id}`}
                        className={`${rowCls} ${highlightId === c.id ? "bg-primary/15" : ""}`}
                        style={{ position: "relative" as const, ...(rowH ? { height: rowH } : {}) }}
                        onMouseMove={(e) => {
                          if (rowsLocked) return;
                          const tr = e.currentTarget as HTMLTableRowElement;
                          const rect = tr.getBoundingClientRect();
                          const nearBottom = rect.bottom - e.clientY <= 6;
                          tr.style.cursor = nearBottom ? "row-resize" : "";
                        }}
                        onMouseDown={(e) => {
                          if (rowsLocked) return;
                          const tr = e.currentTarget as HTMLTableRowElement;
                          const rect = tr.getBoundingClientRect();
                          if (rect.bottom - e.clientY > 6) return;
                          startRowDrag(c.id, e);
                        }}
                        onDoubleClick={(e) => {
                          if (rowsLocked) return;
                          const tr = e.currentTarget as HTMLTableRowElement;
                          const rect = tr.getBoundingClientRect();
                          if (rect.bottom - e.clientY > 6) return;
                          resetRowH(c.id);
                        }}
                      >
                        <td className="tabular-nums" style={{ textAlign: "center" }}>
                          {filterActivity === "with_balance" ? (
                            <span className="font-bold text-destructive" title="المبلغ المستحق (مدين)">
                              {Number(c.balance || 0).toLocaleString()}
                            </span>
                          ) : filterActivity === "with_credit" ? (
                            <span className="font-bold text-emerald-600" title="رصيد دائن (سلفة)">
                              {Number(c.credit_balance || 0).toLocaleString()}
                            </span>
                          ) : (
                            (page - 1) * perPage + i + 1
                          )}
                        </td>
                        <td style={{ padding: 0 }}>
                          <EditableCell
                            value={c.name || ""}
                            disabled={savingRow === c.id}
                            onSave={(v) => updateRowField(c.id, { name: v.trim() })}
                            inputClassName="text-[12px] font-medium"
                            displayClassName="text-primary hover:underline font-medium cursor-text"
                            placeholder="اسم العميل"
                            onOpenView={() => setViewCustomer(c)}
                          />
                        </td>
                        <td style={{ padding: 0 }}>
                          <EditableCell
                            value={c.address || ""}
                            disabled={savingRow === c.id}
                            onSave={(v) => updateRowField(c.id, { address: v.trim() || null })}
                            inputClassName="text-[11px]"
                            placeholder="العنوان"
                          />
                        </td>
                        <td className="tabular-nums" style={{ padding: 0 }}>
                          <EditableCell
                            value={c.phone || ""}
                            disabled={savingRow === c.id}
                            onSave={(v) => updateRowField(c.id, { phone: v.trim() || null })}
                            inputClassName="text-[11px] tabular-nums"
                            placeholder="الهاتف"
                            inputMode="tel"
                            dir="ltr"
                            validate={(v) => {
                              const t = (v || "").trim();
                              if (!t) return null;
                              const dups = findDuplicatesByPhone(t, c.id);
                              return dups.length > 0 ? `رقم مكرر مع: ${dups.map((d: any) => d.name).slice(0, 2).join("، ")}` : null;
                            }}
                          />
                        </td>
                        <td>
                          <InlineSearchSelect
                            value={c.region_id || ""}
                            options={regions.map(r => ({ value: r.id, label: r.name }))}
                            onChange={(v) => updateRowField(c.id, { region_id: v || null, state_id: null, city_id: null, locality_id: null })}
                            onAdd={async (name) => await createRegion(name)}
                            placeholder="—"
                            addLabel="إضافة منطقة"
                            disabled={savingRow === c.id}
                            title="تغيير الاتجاه"
                          />
                        </td>
                        <td>
                          <InlineSearchSelect
                            value={c.state_id || ""}
                            options={states.filter(s => !c.region_id || s.region_id === c.region_id).map(s => ({ value: s.id, label: s.name }))}
                            onChange={(v) => updateRowField(c.id, { state_id: v || null, city_id: null, locality_id: null })}
                            onAdd={async (name) => await createState(name, c.region_id)}
                            placeholder="—"
                            addLabel="إضافة ولاية"
                            disabled={savingRow === c.id || !c.region_id}
                            title="تغيير الولاية"
                          />
                        </td>
                        <td style={{ padding: 0 }}>
                          <InlineSearchSelect
                            value={c.city_id || ""}
                            options={cities.filter(ci => !c.state_id || ci.state_id === c.state_id).map(ci => ({ value: ci.id, label: ci.name }))}
                            onChange={(v) => updateRowField(c.id, { city_id: v || null, locality_id: null })}
                            onAdd={async (name) => await createCity(name, c.state_id)}
                            onDelete={async (o) => await deleteCity(o.value)}
                            placeholder="—"
                            addLabel="إضافة مدينة"
                            disabled={savingRow === c.id || !c.state_id}
                            title="تغيير المدينة"
                          />
                        </td>
                        <td>
                          <InlineSearchSelect
                            value={c.locality_id || ""}
                            options={localities.filter(l => !c.city_id || l.city_id === c.city_id).map(l => ({ value: l.id, label: l.name }))}
                            onChange={(v) => updateRowField(c.id, { locality_id: v || null })}
                            onAdd={async (name) => await createLocality(name, c.city_id)}
                            onDelete={async (o) => await deleteLocality(o.value)}
                            placeholder="—"
                            addLabel="إضافة محلية"
                            disabled={savingRow === c.id || !c.city_id}
                            title="تغيير المحلية"
                          />
                        </td>
                        <td>
                          <InlineSearchSelect
                            value={c.group_id || ""}
                            options={groups.map(g => ({ value: g.id, label: g.name }))}
                            onChange={(v) => updateRowField(c.id, { group_id: v || null })}
                            onAdd={async (name) => await createGroup(name)}
                            placeholder="—"
                            addLabel="إضافة مجموعة"
                            disabled={savingRow === c.id}
                            title="تغيير المجموعة"
                          />
                        </td>
                        <td>
                          <InlineSearchSelect
                            value={customerTransporter[c.id] || ""}
                            options={transporters.map(t => ({ value: t.id, label: t.name }))}
                            onChange={(v) => updateCustomerTransporter(c.id, v)}
                            onAdd={async (name) => await createTransporter(name)}
                            placeholder="—"
                            addLabel="إضافة ناقل"
                            disabled={savingRow === c.id}
                            title="تغيير الترحيلات"
                          />
                        </td>
                        <td>
                          <InlineSearchSelect
                            value={customerDestination[c.id] || ""}
                            options={destinations.map(d => ({ value: d.id, label: d.name }))}
                            onChange={(v) => updateCustomerDestination(c.id, v)}
                            onAdd={async (name) => await createDestination(name)}
                            placeholder="—"
                            addLabel="إضافة وجهة"
                            disabled={savingRow === c.id}
                            title="تغيير الوجهة"
                          />
                        </td>
                        <td>
                          <span className="legacy-actions">
                            <button type="button" className="btn-xs btn-success" onClick={() => openView(c)} title="عرض">
                              عرض
                            </button>
                            <button type="button" className="btn-xs btn-warning" onClick={() => handleEdit(c)} title="تعديل" aria-label="تعديل">
                              <Edit size={12} />
                            </button>
                            <button type="button" className="btn-xs btn-danger" onClick={() => handleDelete(c.id)} title="حذف">
                              🗑
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards list */}
            <div className="mobile-customers-list">
              {isLoading ? (
                <div style={{ textAlign: "center", padding: 30 }}>Processing...</div>
              ) : paginated.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, color: "hsl(var(--muted-foreground))" }}>لا يوجد عملاء</div>
              ) : paginated.map((c: any, idx: number) => {
                const balance = Number(c.balance || 0);
                const credit = Number(c.credit_balance || 0);
                const regionName = regions.find((r: any) => r.id === c.region_id)?.name || "";
                const stateName = states.find((s: any) => s.id === c.state_id)?.name || "";
                return (
                  <MobileDocCard
                    key={c.id}
                    index={(page - 1) * perPage + idx + 1}
                    number={c.phone || "—"}
                    party={c.name}
                    date={[regionName, stateName].filter(Boolean).join(" • ")}
                    amount={
                      balance > 0
                        ? `مدين: ${balance.toLocaleString()}`
                        : credit > 0
                        ? `دائن: ${credit.toLocaleString()}`
                        : ""
                    }
                    onOpen={() => openView(c)}
                    actions={
                      <>
                        <button className="btn-xs btn-success" onClick={() => openView(c)}>عرض</button>
                        <button className="btn-xs btn-warning" onClick={() => handleEdit(c)}>✎ تعديل</button>
                        <button className="btn-xs btn-danger" onClick={() => handleDelete(c.id)}>🗑 حذف</button>
                      </>
                    }
                  />
                );
              })}

              {!isLoading && filtered.length > 0 && totalPages > 1 && (
                <div
                  className="mobile-customers-pager"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    marginTop: 10,
                    padding: "8px 6px",
                    borderTop: "1px solid hsl(var(--border))",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      background: page <= 1 ? "hsl(var(--muted))" : "hsl(var(--primary))",
                      color: page <= 1 ? "hsl(var(--muted-foreground))" : "hsl(var(--primary-foreground))",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: page <= 1 ? "not-allowed" : "pointer",
                      opacity: page <= 1 ? 0.6 : 1,
                    }}
                  >
                    ← السابق
                  </button>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "hsl(var(--foreground))", whiteSpace: "nowrap" }}>
                    {page} / {totalPages}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      background: page >= totalPages ? "hsl(var(--muted))" : "hsl(var(--primary))",
                      color: page >= totalPages ? "hsl(var(--muted-foreground))" : "hsl(var(--primary-foreground))",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: page >= totalPages ? "not-allowed" : "pointer",
                      opacity: page >= totalPages ? 0.6 : 1,
                    }}
                  >
                    التالي →
                  </button>
                </div>
              )}
            </div>

            {!isLoading && filtered.length > 0 && (
              <>
                <div className="legacy-dt-info">
                  إظهار {(page - 1) * perPage + 1} إلى {Math.min(page * perPage, filtered.length)} من إجمالي {filtered.length} مدخل
                </div>
                <ul className="legacy-pagination">
                  <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
                    <button className="page-link" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>السابق</button>
                  </li>
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    let p: number;
                    if (totalPages <= 7) p = i + 1;
                    else if (page <= 4) p = i + 1;
                    else if (page >= totalPages - 3) p = totalPages - 6 + i;
                    else p = page - 3 + i;
                    return (
                      <li key={p} className={`page-item ${page === p ? "active" : ""}`}>
                        <button className="page-link" onClick={() => setPage(p)}>{p}</button>
                      </li>
                    );
                  })}
                  <li className={`page-item ${page === totalPages ? "disabled" : ""}`}>
                    <button className="page-link" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>التالي</button>
                  </li>
                </ul>
              </>
            )}
          </div>
        </div>
      </article>
      <GeoStructurePanel
        open={showGeo}
        onOpenChange={setShowGeo}
        regions={regions}
        states={states}
        localities={localities}
        cities={cities}
        customers={customers || []}
      />
    </div>
  );
}
