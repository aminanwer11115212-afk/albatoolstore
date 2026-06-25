/**
 * ReadyToShipPanel — اللوحة اليمنى لصفحة الترحيلات
 * تطابق الشكل المرجعي: تبويبات + جدول مدمج بـ checkbox للفواتير
 * ذات الحالة "جاهز للرفع" (workflow_status = ready_to_ship).
 * بعد الطباعة → تحويل الحالة إلى in_transit.
 */
import { useMemo, useState, useCallback, Fragment, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidateWorkflowAutoCache } from "@/components/invoice/WorkflowStatusBadge";
import { filterSelectColumns } from "@/lib/tableColumns";
import { toast } from "sonner";
import { Truck, Train, User, X, Printer, RefreshCw, ChevronDown, ChevronLeft, Send, CheckCircle2, Search, Plus, MapPin } from "lucide-react";
import QuickAddTransporterDialog from "./QuickAddTransporterDialog";
import QuickAddDestinationDialog from "./QuickAddDestinationDialog";
import {
  useTransporters, useDestinations,
  useCustomerTransporters, useCustomerDestinations, useCustomerPreferredTransporter,
} from "@/hooks/useData";
import SearchableSelect from "@/components/transport/SearchableSelect";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";



type RowChoice = { transporterId?: string; destinationId?: string };

type Props = {
  buildPrintHTML: (invoices: any[], company: any, mode: "all" | "collected") => string | Promise<string>;
  company: any;
  /** Optional controlled selection (lifted by parent for preview pane). */
  checked?: Set<string>;
  onCheckedChange?: (next: Set<string>) => void;
  /** Optional controlled per-row choice (lifted by parent for live preview). */
  rowChoice?: Record<string, RowChoice>;
  onRowChoiceChange?: (next: Record<string, RowChoice>) => void;
  /** When true, hide the bottom "طباعة وتحويل" footer (parent shows its own actions). */
  hideFooter?: boolean;
};

const fmtDateAr = (d?: string) => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

type Tab = "all" | "by_transport" | "by_customer";

export default function ReadyToShipPanel({
  buildPrintHTML, company,
  checked: checkedProp, onCheckedChange,
  rowChoice: rowChoiceProp, onRowChoiceChange,
  hideFooter,
}: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [internalChecked, setInternalChecked] = useState<Set<string>>(new Set());
  const checked = checkedProp ?? internalChecked;
  // مرجع يحمل أحدث Set من المحدَّد — يصلح مشكلة الاستدعاءات المتسلسلة
  // في نفس الـtick (Set من الـclosure يصبح قديماً فيكتب فوق بعضها).
  const latestCheckedRef = useRef<Set<string>>(checked);
  useEffect(() => { latestCheckedRef.current = checked; }, [checked]);
  const setChecked = (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    const cur = latestCheckedRef.current;
    const next = typeof updater === "function" ? (updater as any)(cur) : updater;
    latestCheckedRef.current = next;
    if (onCheckedChange) onCheckedChange(next);
    else setInternalChecked(next);
  };
  const [busy, setBusy] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [addTrOpen, setAddTrOpen] = useState(false);
  const [addDsOpen, setAddDsOpen] = useState(false);

  // قوائم الناقلين والوجهات + روابط العميل
  const { data: allTransporters } = useTransporters();
  const { data: allDestinations } = useDestinations();
  const { data: custTransporters } = useCustomerTransporters();
  const { data: custDestinations } = useCustomerDestinations();
  const { data: prefTransporters } = useCustomerPreferredTransporter();

  // اختيار المستخدم لكل فاتورة (قبل التثبيت) — controlled أو داخلي
  const [internalRowChoice, setInternalRowChoice] = useState<Record<string, RowChoice>>({});
  const rowChoice = rowChoiceProp ?? internalRowChoice;
  // نُمرّر updater للمسار الداخلي حتى لا نقرأ rowChoice stale من الإغلاق.
  const setRowChoice = (updater: Record<string, RowChoice> | ((prev: Record<string, RowChoice>) => Record<string, RowChoice>)) => {
    if (onRowChoiceChange) {
      const next = typeof updater === "function" ? (updater as any)(rowChoice) : updater;
      onRowChoiceChange(next);
    } else {
      setInternalRowChoice((prev) => (typeof updater === "function" ? (updater as any)(prev) : updater));
    }
  };
  const [savingRow, setSavingRow] = useState<string | null>(null);
  // Dialog تأكيد التثبيت كافتراضي للعميل
  const [pendingPinInv, setPendingPinInv] = useState<any | null>(null);
  // التنقّل بلوحة المفاتيح: مؤشّر مُركّز على صف
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // إعادة ضبط التحديد والتركيز تلقائياً عند تغيير التاب أو الفلتر
  // لتجنّب بقاء فواتير محدَّدة لم تعد ظاهرة فتُسرَّب إلى المعاينة/الطباعة.
  useEffect(() => {
    setChecked(new Set());
    setFocusedRowId(null);
    setCollapsedGroups(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dispatch-ready-to-ship"],
    queryFn: async () => {
      // الأعمدة المُحتملة في جدول invoices — نُصفّيها حسب ما هو موجود فعلاً
      // لتفادي فشل الاستعلام بصمت عند إضافة/حذف عمود في القاعدة.
      const wanted = "id, invoice_number, date, total, currency_code, workflow_status, paid_amount, customer_id, packaging_total_pieces, source";
      const safeCols = await filterSelectColumns("invoices", wanted);
      // ملاحظة: لا نستخدم embed لـ invoice_transports لأنه لا توجد FK مُعرّفة بينه
      // وبين invoices في القاعدة (PostgREST PGRST200). نجلبه بطلب منفصل ونُدمجه يدوياً.
      const selectExpr = `${safeCols},
           customers(id, name, phone),
           invoice_items(id, product_name, quantity, products(name))`;
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select(selectExpr)
        .eq("workflow_status", "ready_to_ship")
        .order("date", { ascending: false });
      if (error) throw error;
      const rows = (data || []) as any[];
      const ids = rows.map((r) => r.id);
      if (ids.length > 0) {
        const { data: trs, error: trsErr } = await (supabase as any)
          .from("invoice_transports")
          .select("id, invoice_id, transporter_id, transporters(id, name)")
          .in("invoice_id", ids);
        if (trsErr) {
          // فشل صامت هنا = الفواتير تظهر بدون ناقل والـauto-select يقفز إلى خيارات خاطئة.
          console.error("[ReadyToShipPanel] invoice_transports query failed:", trsErr);
        }
        const byInv = new Map<string, any[]>();
        for (const t of (trs || [])) {
          const arr = byInv.get(t.invoice_id) || [];
          arr.push(t);
          byInv.set(t.invoice_id, arr);
        }
        for (const r of rows) r.invoice_transports = byInv.get(r.id) || [];
      } else {
        for (const r of rows) r.invoice_transports = [];
      }
      return rows;
    },
  });

  // Auto-refresh whenever an invoice changes anywhere in the app
  // (status edits, packaging save, transport save, etc.)
  useEffect(() => {
    const onChange = () => {
      qc.invalidateQueries({ queryKey: ["dispatch-ready-to-ship"] });
    };
    window.addEventListener("invoices:changed", onChange);
    return () => window.removeEventListener("invoices:changed", onChange);
  }, [qc]);

  // Realtime: any change to workflow_status (or any invoices row) → refetch
  // وأيضاً مزامنة لوجيستيات العميل (روابط الناقلين/الوجهات) لتظهر فوراً في القوائم.
  useEffect(() => {
    const invalidateLogistics = () => {
      qc.invalidateQueries({ queryKey: ["customer_transporters"] });
      qc.invalidateQueries({ queryKey: ["customer_destinations"] });
      qc.invalidateQueries({ queryKey: ["customer_preferred_transporter"] });
      qc.invalidateQueries({ queryKey: ["transporters"] });
      qc.invalidateQueries({ queryKey: ["destinations"] });
    };
    const channel = (supabase as any)
      .channel("dispatch-ready-to-ship-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" },
        () => qc.invalidateQueries({ queryKey: ["dispatch-ready-to-ship"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_transporters" }, invalidateLogistics)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_destinations" }, invalidateLogistics)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_preferred_transporter" }, invalidateLogistics)
      .on("postgres_changes", { event: "*", schema: "public", table: "transporters" }, invalidateLogistics)
      .on("postgres_changes", { event: "*", schema: "public", table: "destinations" }, invalidateLogistics)
      .subscribe();
    const onLogisticsEvent = () => invalidateLogistics();
    window.addEventListener("customer-logistics:changed", onLogisticsEvent);
    return () => {
      try { (supabase as any).removeChannel(channel); } catch {}
      window.removeEventListener("customer-logistics:changed", onLogisticsEvent);
    };
  }, [qc]);

  const invoicesAll = (data || []) as any[];
  const invoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return invoicesAll;
    return invoicesAll.filter((inv) => {
      const fields = [
        inv.invoice_number,
        inv.customers?.name,
        inv.customers?.phone,
        ...(inv.invoice_transports || []).map((t: any) => t.transporters?.name),
      ];
      return fields.some((f) => String(f || "").toLowerCase().includes(q));
    });
  }, [invoicesAll, search]);

  const toggle = useCallback((id: string) => {
    setChecked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  // مرجع آخر صف تمّ التفاعل معه — يستخدمه Shift+Click / Shift+Arrow لتحديد المدى.
  const lastAnchorIdRef = useRef<string | null>(null);

  const allChecked = invoices.length > 0 && invoices.every((i) => checked.has(i.id));
  const toggleAll = () => {
    if (allChecked) setChecked(new Set());
    else setChecked(new Set(invoices.map((i) => i.id)));
  };

  // grouping
  const groups = useMemo(() => {
    if (tab === "all") return null;
    const map = new Map<string, { key: string; label: string; items: any[] }>();
    for (const inv of invoices) {
      let key = "—";
      let label = "بدون تصنيف";
      if (tab === "by_customer") {
        key = inv.customer_id || "cash";
        label = inv.customers?.name || "كاش";
      } else {
        const t = inv.invoice_transports?.[0];
        key = t?.transporter_id || "no_transporter";
        label = t?.transporters?.name || "بدون ناقل";
      }
      if (!map.has(key)) map.set(key, { key, label, items: [] });
      map.get(key)!.items.push(inv);
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [invoices, tab]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((p) => {
      const n = new Set(p);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };
  const toggleGroupCheck = (items: any[]) => {
    const ids = items.map((i) => i.id);
    const allIn = ids.every((id) => checked.has(id));
    setChecked((p) => {
      const n = new Set(p);
      if (allIn) ids.forEach((id) => n.delete(id));
      else ids.forEach((id) => n.add(id));
      return n;
    });
  };

  // قائمة الصفوف المرئية في الترتيب الفعلي على الشاشة — تستخدمها Shift+Click / Shift+Arrow / Ctrl+A.
  const flatVisible = useMemo<any[]>(() => {
    if (tab === "all") return invoices;
    return (groups || []).flatMap((g) => collapsedGroups.has(g.key) ? [] : g.items);
  }, [tab, invoices, groups, collapsedGroups]);

  // تحديد مدى من lastAnchorId إلى toId (يُضاف إلى التحديد القائم).
  const selectRange = useCallback((toId: string) => {
    const anchorId = lastAnchorIdRef.current;
    if (!anchorId || anchorId === toId) {
      setChecked((p) => { const n = new Set(p); n.add(toId); return n; });
      return;
    }
    const a = flatVisible.findIndex((x) => x.id === anchorId);
    const b = flatVisible.findIndex((x) => x.id === toId);
    if (a < 0 || b < 0) {
      setChecked((p) => { const n = new Set(p); n.add(toId); return n; });
      return;
    }
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    setChecked((p) => {
      const n = new Set(p);
      for (let i = lo; i <= hi; i++) n.add(flatVisible[i].id);
      return n;
    });
  }, [flatVisible]);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const requestPrintAndDispatch = () => {
    if (checked.size === 0) {
      toast.error("اختر فاتورة واحدة على الأقل");
      return;
    }
    setConfirmOpen(true);
  };

  const doPrintAndDispatch = async () => {
    const selected = invoices.filter((i) => checked.has(i.id));
    if (selected.length === 0) {
      toast.error("اختر فاتورة واحدة على الأقل");
      return;
    }
    setBusy(true);
    setConfirmOpen(false);
    try {
      const html = await buildPrintHTML(selected, company, "all");
      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) {
        toast.error("تعذّر فتح نافذة الطباعة");
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      setTimeout(() => {
        try { win.focus(); win.print(); } catch (e) { console.error(e); }
      }, 500);

      const ids = selected.map((i) => i.id);
      const results = await Promise.all(
        ids.map(async (id) => {
          const res = await supabase.rpc("advance_invoice_workflow" as any, {
            _invoice_id: id,
            _target: "in_transit",
            _reason: "ترحيل الفواتير الجاهزة من شاشة الترحيلات",
          });
          return { id, error: (res as any).error };
        })
      );
      const failed = results.filter((r) => r.error);
      const okIds = results.filter((r) => !r.error).map((r) => r.id);

      if (failed.length > 0) {
        const sample = failed.slice(0, 3).map((f) => f.id.slice(0, 8)).join("، ");
        const more = failed.length > 3 ? ` و ${failed.length - 3} أخرى` : "";
        toast.error(`فشل ترحيل ${failed.length} من ${ids.length} فاتورة (${sample}${more}): ${(failed[0].error as any)?.message || ""}`);
      }
      if (okIds.length > 0) {
        toast.success(`تم تحويل ${okIds.length} فاتورة إلى "في الطريق للترحيلات"`);
      }
      if (okIds.length === 0) {
        // كل المحاولات فشلت — نتوقف قبل تنظيف الاختيار.
        return;
      }
      // Clear selection فقط للفواتير التي نجحت.
      setChecked((prev) => {
        const next = new Set(prev);
        for (const id of okIds) next.delete(id);
        return next;
      });
      setRowChoice((prev) => {
        const next = { ...prev };
        for (const id of okIds) delete next[id];
        return next;
      });

      // Refresh everywhere that depends on workflow_status
      qc.invalidateQueries({ queryKey: ["dispatch-ready-to-ship"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-with-customers"] });
      for (const id of ids) qc.invalidateQueries({ queryKey: ["invoice", id] });
      ids.forEach((id) => invalidateWorkflowAutoCache(id));
      try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
    } catch (e: any) {
      toast.error(e.message || "تعذّر إتمام العملية");
    } finally {
      setTimeout(() => setBusy(false), 1500);
    }
  };


  const TabBtn = ({ id, icon: Icon, label }: { id: Tab; icon: any; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rts-tab ${tab === id ? "active" : ""}`}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );

  // القوائم تعرض كل الناقلين/الوجهات في النظام (متزامنة مع صفحة إدارة العملاء)
  // الافتراضي يبقى من ربط العميل (preferred / is_default) إن وُجد.
  const optionsForInvoice = useCallback((inv: any) => {
    const cid = inv.customer_id;
    const allT = (allTransporters as any[]) || [];
    const allD = (allDestinations as any[]) || [];
    const linkedD = ((custDestinations as any[]) || []).filter((x) => x.customer_id === cid);
    const preferred = ((prefTransporters as any[]) || []).find((p) => p.customer_id === cid)?.transporter_id;
    const defaultDest = linkedD.find((ld) => ld.is_default)?.destination_id;
    return { transporters: allT, destinations: allD, preferred, defaultDest };
  }, [allTransporters, allDestinations, custDestinations, prefTransporters]);

  // Sync resolved defaults (preferred / first available) into rowChoice so the
  // parent (DispatchPage) can render them in the preview/print overlay even
  // when the user hasn't manually changed the dropdowns.
  useEffect(() => {
    if (!invoices.length) return;
    const next: Record<string, RowChoice> = { ...rowChoice };
    let changed = false;
    for (const inv of invoices) {
      const { preferred, defaultDest, transporters, destinations } = optionsForInvoice(inv);
      const existing = inv.invoice_transports?.[0];
      const tId = existing?.transporter_id ?? preferred ?? transporters[0]?.id ?? "";
      const dId = existing?.destination_id ?? defaultDest ?? destinations[0]?.id ?? "";
      const cur = next[inv.id] || {};
      const newT = cur.transporterId ?? tId;
      const newD = cur.destinationId ?? dId;
      if (cur.transporterId !== newT || cur.destinationId !== newD) {
        next[inv.id] = { transporterId: newT, destinationId: newD };
        changed = true;
      }
    }
    if (changed) setRowChoice(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, allTransporters, allDestinations, custTransporters, custDestinations, prefTransporters]);


  const getChoice = (inv: any) => {
    const c = rowChoice[inv.id] || {};
    const { preferred, defaultDest, transporters, destinations } = optionsForInvoice(inv);
    const existing = inv.invoice_transports?.[0];
    return {
      transporterId: c.transporterId ?? existing?.transporter_id ?? preferred ?? transporters[0]?.id ?? "",
      destinationId: c.destinationId ?? existing?.destination_id ?? defaultDest ?? destinations[0]?.id ?? "",
    };
  };

  const dispatchRow = async (inv: any, pinDefault: boolean) => {
    const choice = getChoice(inv);
    if (!choice.transporterId) { toast.error("اختر ناقلاً"); return; }
    setSavingRow(inv.id);
    try {
      const { error } = await (supabase as any).from("invoice_transports").insert({
        invoice_id: inv.id,
        transporter_id: choice.transporterId,
        destination_id: choice.destinationId || null,
        transport_date: new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;

      // ثبّت الناقل/الوجهة كمعتاد لهذا العميل (إن كان العميل حقيقيًا والمستخدم وافق).
      const customerId = inv.customer_id || null;
      if (customerId && pinDefault) {
        try {
          await (supabase as any)
            .from("customer_preferred_transporter")
            .upsert(
              { customer_id: customerId, transporter_id: choice.transporterId },
              { onConflict: "customer_id" }
            );
          await (supabase as any)
            .from("customer_transporters")
            .upsert(
              { customer_id: customerId, transporter_id: choice.transporterId },
              { onConflict: "customer_id,transporter_id", ignoreDuplicates: true }
            );
          if (choice.destinationId) {
            const { data: existing } = await (supabase as any)
              .from("customer_destinations")
              .select("id")
              .eq("customer_id", customerId)
              .eq("destination_id", choice.destinationId)
              .maybeSingle();
            if (!existing) {
              await (supabase as any)
                .from("customer_destinations")
                .insert({ customer_id: customerId, destination_id: choice.destinationId, is_default: true });
            }
            await (supabase as any)
              .from("customer_destinations")
              .update({ is_default: false })
              .eq("customer_id", customerId)
              .neq("destination_id", choice.destinationId);
            await (supabase as any)
              .from("customer_destinations")
              .update({ is_default: true })
              .eq("customer_id", customerId)
              .eq("destination_id", choice.destinationId);
          }
          toast.success("تم التثبيت وحُدّثت افتراضيات العميل");
        } catch (pinErr: any) {
          console.error("pin-as-default error:", pinErr);
          toast.success("تم التثبيت (تعذّر تحديث افتراضيات العميل)");
        }
      } else {
        toast.success("تم تثبيت الترحيل لهذه الفاتورة");
      }

      qc.invalidateQueries({ queryKey: ["dispatch-ready-to-ship"] });
      qc.invalidateQueries({ queryKey: ["invoices-with-customers"] });
      qc.invalidateQueries({ queryKey: ["customer_preferred_transporter"] });
      qc.invalidateQueries({ queryKey: ["customer_destinations"] });
      qc.invalidateQueries({ queryKey: ["customer_transporters"] });
      try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
      try { window.dispatchEvent(new Event("customer-logistics:changed")); } catch {}
    } catch (e: any) {
      toast.error(e.message || "تعذّر تثبيت الترحيل");
    } finally {
      setSavingRow(null);
    }
  };

  // قرار: نفتح Dialog سؤال «حدّث الافتراضي؟» فقط إذا اختلف الاختيار عن المعتاد للعميل.
  const requestDispatchRow = (inv: any) => {
    const customerId = inv.customer_id;
    if (!customerId) {
      dispatchRow(inv, false);
      return;
    }
    const choice = getChoice(inv);
    const { preferred, destinations: _d } = optionsForInvoice(inv);
    const linkedD = ((custDestinations as any[]) || []).filter((x) => x.customer_id === customerId);
    const currentDefaultDest = linkedD.find((ld) => ld.is_default)?.destination_id ?? null;
    const sameTransporter = (preferred ?? null) === (choice.transporterId || null);
    const sameDestination = (currentDefaultDest ?? null) === (choice.destinationId || null);
    if (sameTransporter && sameDestination) {
      dispatchRow(inv, false);
    } else {
      setPendingPinInv(inv);
    }
  };

  const renderRow = (inv: any, idx: number) => {
    const isChecked = checked.has(inv.id);
    const { transporters, destinations } = optionsForInvoice(inv);
    const choice = getChoice(inv);
    const hasTransport = (inv.invoice_transports?.length ?? 0) > 0;
    const isSaving = savingRow === inv.id;
    return (
      <tr
        key={inv.id}
        className={isChecked ? "checked" : ""}
        tabIndex={0}
        data-row-id={inv.id}
        onFocus={() => setFocusedRowId(inv.id)}
        onClick={(e) => {
          setFocusedRowId(inv.id);
          if (e.shiftKey) {
            selectRange(inv.id);
          } else {
            toggle(inv.id);
          }
          lastAnchorIdRef.current = inv.id;
        }}
        style={{
          ...(focusedRowId === inv.id ? { outline: "2px solid hsl(var(--primary))", outlineOffset: -2 } : {}),
          ...(inv.source === "pos" ? { background: "hsl(38 92% 50% / 0.08)", borderRight: "3px solid hsl(38 92% 50%)" } : {}),
        }}
      >
        <td className="cell-idx">{idx + 1}</td>
        <td className="cell-check">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => {}}
            onClick={(e) => {
              e.stopPropagation();
              setFocusedRowId(inv.id);
              if ((e as any).shiftKey) {
                selectRange(inv.id);
              } else {
                toggle(inv.id);
              }
              lastAnchorIdRef.current = inv.id;
            }}
          />
        </td>
        <td className="cell-name">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {inv.source === "pos" && (
              <span
                style={{
                  background: "hsl(38 92% 50%)",
                  color: "hsl(0 0% 100%)",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "1px 5px",
                  borderRadius: 4,
                  letterSpacing: 0.3,
                }}
                title="فاتورة كاش (نقطة بيع)"
              >
                POS
              </span>
            )}
            {tab === "by_customer"
              ? (inv.invoice_number || "—")
              : (inv.customers?.name || "كاش")}
          </span>
        </td>
        <td className="cell-sel" onClick={(e) => e.stopPropagation()}>
          <SearchableSelect
            options={transporters as any}
            value={choice.transporterId}
            onChange={(val) => setRowChoice((p) => ({ ...p, [inv.id]: { ...p[inv.id], transporterId: val } }))}
            placeholder="— اختر ناقل —"
            className="rts-select"
          />
        </td>
        <td className="cell-sel" onClick={(e) => e.stopPropagation()}>
          <SearchableSelect
            options={destinations as any}
            value={choice.destinationId}
            onChange={(val) => setRowChoice((p) => ({ ...p, [inv.id]: { ...p[inv.id], destinationId: val } }))}
            placeholder="— بدون وجهة —"
            className="rts-select"
          />
        </td>
        <td className="cell-act" onClick={(e) => e.stopPropagation()}>
          {hasTransport ? (
            <span className="rts-pill"><CheckCircle2 size={12} /> مُرحَّلة</span>
          ) : (
            <button
              type="button"
              className="rts-btn rts-btn-primary rts-btn-sm"
              onClick={() => requestDispatchRow(inv)}
              disabled={isSaving || !choice.transporterId}
            >
              <Send size={12} />
              {isSaving ? "…" : "تثبيت"}
            </button>
          )}
        </td>
      </tr>
    );
  };




  return (
    <div className="rts-panel" dir="rtl">
      <style>{`
        .rts-panel {
          display: flex; flex-direction: column;
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 10px; overflow: hidden;
          box-shadow: 0 2px 10px rgba(0,0,0,0.04);
          height: 100%;
        }
        .rts-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 12px;
          background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.85));
          color: hsl(var(--primary-foreground));
        }
        .rts-header h3 { font-size: 13px; font-weight: 800; margin: 0; display: flex; align-items: center; gap: 6px; }
        .rts-refresh {
          background: rgba(255,255,255,0.18); color: inherit;
          border: none; border-radius: 6px; padding: 4px 6px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 700;
        }
        .rts-refresh:hover { background: rgba(255,255,255,0.28); }

        .rts-tabs {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 0; border-bottom: 1px solid hsl(var(--border));
          background: hsl(var(--muted) / 0.4);
        }
        .rts-tab {
          background: transparent; border: none;
          padding: 8px 4px; font-size: 11px; font-weight: 700; cursor: pointer;
          color: hsl(var(--muted-foreground));
          display: inline-flex; align-items: center; justify-content: center; gap: 4px;
          border-bottom: 2px solid transparent;
          transition: all 0.15s;
        }
        .rts-tab:hover { background: hsl(var(--muted) / 0.7); color: hsl(var(--foreground)); }
        .rts-tab.active {
          background: hsl(var(--card));
          color: hsl(var(--primary));
          border-bottom-color: hsl(var(--primary));
        }

        .rts-search {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 10px;
          background: hsl(var(--background));
          border-bottom: 1px solid hsl(var(--border));
          position: relative;
        }
        .rts-search-icon { color: hsl(var(--muted-foreground)); flex-shrink: 0; }
        .rts-search-input {
          flex: 1; min-width: 0;
          background: hsl(var(--muted) / 0.4);
          border: 1px solid hsl(var(--border));
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 12px; font-weight: 600;
          color: hsl(var(--foreground));
          min-height: 32px;
        }
        .rts-search-input:focus { outline: 2px solid hsl(var(--primary) / 0.35); border-color: hsl(var(--primary)); }
        .rts-search-clear {
          background: hsl(var(--muted)); color: hsl(var(--muted-foreground));
          border: none; border-radius: 999px; padding: 4px; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .rts-search-clear:hover { background: hsl(var(--destructive) / 0.15); color: hsl(var(--destructive)); }
        @media (max-width: 640px) { .rts-search-input { font-size: 16px; min-height: 40px; } }

        .rts-hint {
          padding: 6px 12px; font-size: 10.5px;
          color: hsl(var(--muted-foreground));
          background: hsl(var(--muted) / 0.25);
          border-bottom: 1px solid hsl(var(--border));
          text-align: center;
        }
        .rts-dragbar {
          padding: 4px 12px; font-size: 10px;
          color: hsl(var(--muted-foreground));
          border-bottom: 1px dashed hsl(var(--border));
          background: hsl(var(--background));
          text-align: center; letter-spacing: 0;
        }

        .rts-body { flex: 1; overflow: auto; }

        /* Excel-like grid */
        .rts-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .rts-table thead th {
          position: sticky; top: 0; z-index: 2;
          background: hsl(var(--muted));
          color: hsl(var(--foreground));
          font-weight: 800; font-size: 10.5px;
          padding: 6px 6px; text-align: center;
          border: 1px solid hsl(var(--border));
          border-bottom: 2px solid hsl(var(--border));
          white-space: nowrap;
        }
        .rts-table tbody td {
          padding: 4px 6px;
          border: 1px solid hsl(var(--border));
          vertical-align: middle;
        }
        .rts-table thead th.cell-idx,
        .rts-table td.cell-idx {
          width: 32px; text-align: center;
          font-weight: 800; color: hsl(var(--muted-foreground));
          background: hsl(var(--muted) / 0.6);
          font-variant-numeric: tabular-nums;
        }
        .rts-table thead th.cell-check,
        .rts-table td.cell-check { width: 32px; text-align: center; }
        .rts-table .cell-name { font-weight: 700; text-align: right; }
        .rts-table tbody tr { cursor: pointer; }
        /* Zebra */
        .rts-table tbody tr:nth-child(even) td { background: hsl(var(--muted) / 0.18); }
        .rts-table tbody tr:hover td { background: hsl(var(--muted) / 0.55); }
        .rts-table tbody tr.checked td { background: hsl(var(--primary) / 0.12) !important; }

        .rts-group-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 6px 10px; cursor: pointer;
          background: hsl(var(--muted) / 0.7);
          border-top: 1px solid hsl(var(--border));
          border-bottom: 1px solid hsl(var(--border));
          font-size: 11px; font-weight: 800;
        }
        .rts-group-head:hover { background: hsl(var(--muted)); }
        .rts-group-meta { display: inline-flex; align-items: center; gap: 6px; color: hsl(var(--muted-foreground)); font-weight: 700; font-size: 10px; }

        .rts-empty {
          text-align: center; padding: 36px 14px;
          color: hsl(var(--muted-foreground));
        }

        .rts-footer {
          border-top: 1px solid hsl(var(--border));
          padding: 8px 10px;
          background: hsl(var(--muted) / 0.3);
          display: flex; flex-direction: column; gap: 6px;
        }
        .rts-footer-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
        .rts-counter { font-size: 11px; font-weight: 800; color: hsl(var(--foreground)); }
        .rts-counter b { color: hsl(var(--primary)); }
        .rts-btn {
          height: 30px; padding: 0 10px; border-radius: 6px; border: none;
          font-size: 11px; font-weight: 800; cursor: pointer;
          display: inline-flex; align-items: center; gap: 5px;
          transition: opacity 0.15s, transform 0.05s;
        }
        .rts-btn:hover { opacity: 0.9; }
        .rts-btn:active { transform: translateY(1px); }
        .rts-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .rts-btn-primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); width: 100%; justify-content: center; height: 36px; font-size: 12px; }
        .rts-btn-ghost { background: transparent; color: hsl(var(--foreground)); border: 1px solid hsl(var(--border)); }
        .rts-btn-sm { height: 26px; width: auto; padding: 0 8px; font-size: 10.5px; }

        .rts-table thead th.cell-sel { min-width: 130px; }
        .rts-table thead th.cell-act { width: 92px; text-align: center; }
        .rts-table td.cell-sel { padding: 2px 3px; }
        .rts-table td.cell-act { text-align: center; padding: 3px 4px; }
        .rts-select {
          width: 100%; min-height: 28px;
          background: transparent;
          color: hsl(var(--foreground));
          border: 1px solid transparent;
          border-radius: 4px; font-size: 11px; font-weight: 600;
        }
        .rts-select:hover { border-color: hsl(var(--border)); background: hsl(var(--background)); }
        .rts-select:focus-within { outline: 2px solid hsl(var(--primary) / 0.45); outline-offset: -1px; border-color: hsl(var(--primary)); background: hsl(var(--background)); }
        .rts-pill {
          display: inline-flex; align-items: center; gap: 3px;
          padding: 3px 8px; border-radius: 999px;
          background: hsl(var(--primary) / 0.12);
          color: hsl(var(--primary));
          font-size: 10px; font-weight: 800;
        }
        .rts-act-stack { display: inline-flex; align-items: center; gap: 4px; justify-content: center; }
        .rts-pin-toggle {
          display: inline-flex; align-items: center; gap: 2px;
          font-size: 11px; font-weight: 700;
          color: hsl(var(--muted-foreground));
          cursor: pointer; user-select: none;
        }
        .rts-pin-toggle input { accent-color: hsl(var(--primary)); }
        .rts-pin-toggle:hover { color: hsl(var(--primary)); }
        @media (max-width: 640px) {
          .rts-table thead th.cell-sel { min-width: 110px; }
          .rts-select { font-size: 16px; min-height: 36px; }
          .rts-btn-sm { height: 36px; padding: 0 10px; font-size: 12px; }
        }


      `}</style>

      {/* Header */}
      <div className="rts-header">
        <h3><Truck size={15} /> تقرير الترحيلات</h3>
        <button className="rts-refresh" onClick={() => refetch()} title="تحديث">
          <RefreshCw size={12} style={{ animation: isFetching ? "spin 1s linear infinite" : undefined }} />
          تحديث
        </button>
      </div>

      {/* Tabs */}
      <div className="rts-tabs">
        <TabBtn id="all" icon={Truck} label="كل الترحيلات" />
        <TabBtn id="by_transport" icon={Train} label="حسب الترحيلات" />
        <TabBtn id="by_customer" icon={User} label="حسب اسم الزبون" />
      </div>

      {/* Hint */}
      {/* Search */}
      <div className="rts-search">
        <Search size={13} className="rts-search-icon" />
        <input
          type="text"
          className="rts-search-input"
          placeholder="ابحث برقم الفاتورة، اسم الزبون، أو الناقل…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" className="rts-search-clear" onClick={() => setSearch("")} title="مسح">
            <X size={12} />
          </button>
        )}
      </div>
      

      {/* Body */}
      <div
        className="rts-body"
        ref={bodyRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          const flat = flatVisible;
          if (flat.length === 0) return;
          const curIdx = focusedRowId ? flat.findIndex((x) => x.id === focusedRowId) : -1;
          const focusRow = (id: string) => {
            setFocusedRowId(id);
            bodyRef.current?.querySelector<HTMLTableRowElement>(`tr[data-row-id="${id}"]`)?.focus();
          };
          // Ctrl/Cmd+A: تحديد كل الفواتير الظاهرة
          if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
            e.preventDefault();
            setChecked(new Set(flat.map((x) => x.id)));
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            const nextIdx = Math.min((curIdx < 0 ? -1 : curIdx) + 1, flat.length - 1);
            const next = flat[nextIdx];
            if (e.shiftKey) {
              if (!lastAnchorIdRef.current) lastAnchorIdRef.current = flat[Math.max(curIdx, 0)].id;
              selectRange(next.id);
            } else {
              lastAnchorIdRef.current = next.id;
            }
            focusRow(next.id);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const prevIdx = Math.max((curIdx < 0 ? 1 : curIdx) - 1, 0);
            const prev = flat[prevIdx];
            if (e.shiftKey) {
              if (!lastAnchorIdRef.current) lastAnchorIdRef.current = flat[Math.max(curIdx, 0)].id;
              selectRange(prev.id);
            } else {
              lastAnchorIdRef.current = prev.id;
            }
            focusRow(prev.id);
          } else if (e.key === " " || e.code === "Space") {
            if (curIdx >= 0) {
              e.preventDefault();
              if (e.shiftKey) {
                selectRange(flat[curIdx].id);
              } else {
                toggle(flat[curIdx].id);
                lastAnchorIdRef.current = flat[curIdx].id;
              }
            }
          } else if (e.key === "Enter") {
            if (curIdx >= 0) {
              const inv = flat[curIdx];
              const hasTransport = (inv.invoice_transports?.length ?? 0) > 0;
              if (!hasTransport) {
                e.preventDefault();
                requestDispatchRow(inv);
              }
            }
          }
        }}
      >
        {isLoading ? (
          <div className="rts-empty">جارٍ التحميل…</div>
        ) : invoices.length === 0 ? (
          <div className="rts-empty">
            <Truck size={32} style={{ opacity: 0.2, margin: "0 auto 8px", display: "block" }} />
            <div style={{ fontWeight: 700 }}>لا توجد فواتير جاهزة للرفع</div>
            <div style={{ fontSize: 10, marginTop: 4 }}>الفواتير التي تنتهي تغليفها تظهر هنا</div>
          </div>
        ) : tab === "all" ? (
          <table className="rts-table">
            <thead>
              <tr>
                <th className="cell-idx">#</th>
                <th className="cell-check">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                  />
                </th>
                <th>اسم الزبون</th>
                <th className="cell-sel">الناقل</th>
                <th className="cell-sel">الوجهة</th>
                <th className="cell-act">إجراء</th>
              </tr>
            </thead>
            <tbody>{invoices.map(renderRow)}</tbody>
          </table>
        ) : (
          <table className="rts-table">
            <thead>
              <tr>
                <th className="cell-idx">#</th>
                <th className="cell-check">✓</th>
                <th>{tab === "by_customer" ? "رقم الفاتورة" : "اسم الزبون"}</th>
                <th className="cell-sel">الناقل</th>
                <th className="cell-sel">الوجهة</th>
                <th className="cell-act">إجراء</th>
              </tr>
            </thead>


            <tbody>
              {groups!.map((g) => {
                const collapsed = collapsedGroups.has(g.key);
                const allInGroup = g.items.every((i) => checked.has(i.id));
                return (
                  <Fragment key={`g-${g.key}`}>
                    <tr>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <div
                          className="rts-group-head"
                          onClick={() => toggleGroup(g.key)}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {collapsed ? <ChevronLeft size={13} /> : <ChevronDown size={13} />}
                            {g.label}
                            <span className="rts-group-meta">({g.items.length})</span>
                          </span>
                          <button
                            className="rts-btn rts-btn-ghost"
                            style={{ height: 22, padding: "0 6px", fontSize: 10 }}
                            onClick={(e) => { e.stopPropagation(); toggleGroupCheck(g.items); }}
                          >
                            {allInGroup ? "إلغاء" : "تحديد الكل"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {!collapsed && g.items.map((inv, i) => renderRow(inv, i))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      {!hideFooter && (
        <div className="rts-footer">
          <div className="rts-footer-row">
            <div className="rts-counter">
              <b>{checked.size}</b> محدد من <b>{invoices.length}</b>
            </div>
            <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <button
                type="button"
                className="rts-btn rts-btn-ghost"
                style={{ height: 28, padding: "0 8px", fontSize: 11, gap: 4 }}
                onClick={() => setAddTrOpen(true)}
                title="إضافة ناقل جديد"
              >
                <Plus size={12} /> <Truck size={12} /> ناقل
              </button>
              <button
                type="button"
                className="rts-btn rts-btn-ghost"
                style={{ height: 28, padding: "0 8px", fontSize: 11, gap: 4 }}
                onClick={() => setAddDsOpen(true)}
                title="إضافة وجهة جديدة"
              >
                <Plus size={12} /> <MapPin size={12} /> وجهة
              </button>
              <button
                className="rts-btn rts-btn-ghost"
                onClick={toggleAll}
                disabled={invoices.length === 0}
              >
                {allChecked ? <X size={11} /> : null}
                {allChecked ? "إلغاء التحديد" : "تحديد الكل"}
              </button>
            </div>
          </div>
          <button
            className="rts-btn rts-btn-primary"
            onClick={requestPrintAndDispatch}
            disabled={busy || checked.size === 0}
          >
            <Printer size={14} />
            {busy ? "جارٍ المعالجة…" : "طباعة وتحويل إلى ترحيلات"}
          </button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد ترحيل الفواتير</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم طباعة كشف الترحيلات لـ <b>{checked.size}</b> فاتورة، ثم تحويل حالتها إلى
              «في الطريق للترحيلات» واختفائها من هذه الشاشة. هل تريد المتابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={doPrintAndDispatch}>
              نعم، تأكيد وطباعة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: تثبيت الناقل/الوجهة كافتراضي للعميل */}
      <AlertDialog open={!!pendingPinInv} onOpenChange={(o) => !o && setPendingPinInv(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تحديث افتراضيات العميل؟</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingPinInv ? (() => {
                const choice = getChoice(pendingPinInv);
                const tName = ((allTransporters as any[]) || []).find((t) => t.id === choice.transporterId)?.name || "—";
                const dName = ((allDestinations as any[]) || []).find((d) => d.id === choice.destinationId)?.name || "—";
                const cName = pendingPinInv.customers?.name || "هذا الزبون";
                return (
                  <>
                    هل تريد جعل <b>{tName}</b> الناقل المعتاد و<b>{dName}</b> الوجهة الافتراضية لـ <b>{cName}</b> في كل النظام؟
                    <br />
                    التغيير سيظهر في صفحة إدارة العملاء وفي كل فاتورة جديدة لهذا الزبون.
                  </>
                );
              })() : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                const inv = pendingPinInv;
                setPendingPinInv(null);
                if (inv) dispatchRow(inv, false);
              }}
            >
              لا، فقط لهذه الفاتورة
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const inv = pendingPinInv;
                setPendingPinInv(null);
                if (inv) dispatchRow(inv, true);
              }}
            >
              نعم، حدّث افتراضيات العميل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <QuickAddTransporterDialog open={addTrOpen} onOpenChange={setAddTrOpen} />
      <QuickAddDestinationDialog open={addDsOpen} onOpenChange={setAddDsOpen} />
    </div>

  );
}
