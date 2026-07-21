import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { startsWithMatch } from "@/utils/searchMatch";
import {
  Search, TrendingDown, TrendingUp, RotateCcw, Package, ArrowLeftRight,
  Sliders, Printer, Download, Warehouse, FileText,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { printStockMovements, downloadStockMovementsPdf } from "@/utils/stockMovementsPrint";

const PREFS_KEY = "lov:stock-tracking:filters:v1";
type StoredPrefs = {
  from?: string; to?: string; types?: string[]; q?: string;
  productFilter?: string; warehouseFilter?: string;
};
const loadPrefs = (): StoredPrefs => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; }
  catch { return {}; }
};


type MoveType = "sale" | "return" | "purchase" | "transfer_in" | "transfer_out" | "manual_adjustment" | "invoice_delete_restore";

interface Move {
  id: string;
  date: string;
  created_at: string;
  type: MoveType;
  product_id: string | null;
  product_name: string;
  warehouse_id: string | null;
  warehouse_name: string;
  qty: number; // signed
  doc_number: string;
  doc_id: string | null;
  doc_href?: string | null;
  doc_ref?: string | null; // short reference/operation id
  party_name: string;
  is_pos?: boolean;
  reason?: string | null;
}


const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const arDate = (iso: string) =>
  new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "medium" }).format(new Date(iso));

function useStockMovements(from: string, to: string) {
  return useQuery({
    queryKey: ["stock-tracking", from, to],
    queryFn: async (): Promise<{ moves: Move[]; currentStock: Map<string, number> }> => {
      const [inv, ret, pur, trn, adj, prods, whs] = await Promise.all([
        supabase.from("invoice_items")
          .select("id, product_id, product_name, quantity, created_at, invoice_id, invoices!inner(id, invoice_number, date, customer_id, status, source, walk_in_customer_name, customers(name))")
          .gte("invoices.date", from).lte("invoices.date", to)
          .neq("invoices.status", "cancelled")
          .order("created_at", { ascending: false })
          .limit(3000),
        supabase.from("stock_return_items")
          .select("id, product_id, product_name, quantity, created_at, stock_return_id, stock_returns!inner(id, return_number, date, customer_id, customers(name))")
          .gte("stock_returns.date", from).lte("stock_returns.date", to)
          .order("created_at", { ascending: false })
          .limit(3000),
        supabase.from("purchase_order_items")
          .select("id, product_id, product_name, quantity, created_at, purchase_order_id, purchase_orders!inner(id, order_number, date, supplier_id, status, suppliers(name))")
          .gte("purchase_orders.date", from).lte("purchase_orders.date", to)
          .neq("purchase_orders.status", "cancelled")
          .order("created_at", { ascending: false })
          .limit(3000),
        supabase.from("stock_transfers")
          .select("id, product_id, from_warehouse_id, to_warehouse_id, quantity, notes, date, created_at")
          .gte("date", from).lte("date", to)
          .order("created_at", { ascending: false })
          .limit(3000),
        supabase.from("stock_adjustments_log")
          .select("id, product_id, delta, reason, source, reference_id, created_at, actor_uid")
          .gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59`)
          .order("created_at", { ascending: false })
          .limit(3000),
        supabase.from("products").select("id, name, stock_quantity, warehouse_id"),
        supabase.from("warehouses").select("id, name"),
      ]);

      if (inv.error) throw inv.error;
      if (ret.error) throw ret.error;
      if (pur.error) throw pur.error;
      if (trn.error) throw trn.error;
      if (adj.error) throw adj.error;
      if (prods.error) throw prods.error;
      if (whs.error) throw whs.error;

      const productMap = new Map<string, any>((prods.data || []).map((p: any) => [p.id, p]));
      const whMap = new Map<string, string>((whs.data || []).map((w: any) => [w.id, w.name]));
      const stockMap = new Map<string, number>(
        (prods.data || []).map((p: any) => [p.id, Number(p.stock_quantity || 0)])
      );

      const productWhName = (pid: string | null) => {
        if (!pid) return "—";
        const p = productMap.get(pid);
        return p?.warehouse_id ? (whMap.get(p.warehouse_id) || "—") : "—";
      };

      const moves: Move[] = [];

      (inv.data || []).forEach((r: any) => {
        const isPos = (r.invoices?.source || "") === "pos";
        moves.push({
          id: `sale-${r.id}`,
          date: r.invoices?.date,
          created_at: r.created_at,
          type: "sale",
          product_id: r.product_id,
          product_name: r.product_name || "—",
          warehouse_id: null,
          warehouse_name: productWhName(r.product_id),
          qty: -Number(r.quantity || 0),
          doc_number: r.invoices?.invoice_number || "—",
          doc_id: r.invoices?.id ?? null,
          doc_ref: r.invoices?.id ? String(r.invoices.id).slice(0, 8) : null,

          doc_href: r.invoices?.id
            ? (isPos ? `/invoices/cash/edit/${r.invoices.id}` : `/invoices/view/${r.invoices.id}`)
            : null,
          party_name: r.invoices?.customers?.name || r.invoices?.walk_in_customer_name || (isPos ? "عميل نقدي" : "—"),
          is_pos: isPos,
        });
      });

      (ret.data || []).forEach((r: any) => {
        moves.push({
          id: `ret-${r.id}`,
          date: r.stock_returns?.date,
          created_at: r.created_at,
          type: "return",
          product_id: r.product_id,
          product_name: r.product_name || "—",
          warehouse_id: null,
          warehouse_name: productWhName(r.product_id),
          qty: +Number(r.quantity || 0),
          doc_number: r.stock_returns?.return_number || "—",
          doc_id: r.stock_returns?.id ?? null,
          doc_ref: r.stock_returns?.id ? String(r.stock_returns.id).slice(0, 8) : null,
          doc_href: r.stock_returns?.id ? `/stock-return/view/${r.stock_returns.id}` : null,

          party_name: r.stock_returns?.customers?.name || "—",
        });
      });

      (pur.data || []).forEach((r: any) => {
        moves.push({
          id: `pur-${r.id}`,
          date: r.purchase_orders?.date,
          created_at: r.created_at,
          type: "purchase",
          product_id: r.product_id,
          product_name: r.product_name || "—",
          warehouse_id: null,
          warehouse_name: productWhName(r.product_id),
          qty: +Number(r.quantity || 0),
          doc_number: r.purchase_orders?.order_number || "—",
          doc_id: r.purchase_orders?.id ?? null,
          doc_ref: r.purchase_orders?.id ? String(r.purchase_orders.id).slice(0, 8) : null,
          doc_href: r.purchase_orders?.id ? `/purchase/edit/${r.purchase_orders.id}` : null,

          party_name: r.purchase_orders?.suppliers?.name || "—",
        });
      });

      // كل تحويل يُضاف كسطرَين: صادر من المصدر ووارد للهدف
      (trn.data || []).forEach((r: any) => {
        const productName = productMap.get(r.product_id)?.name || "—";
        moves.push({
          id: `trn-out-${r.id}`,
          date: r.date,
          created_at: r.created_at,
          type: "transfer_out",
          product_id: r.product_id,
          product_name: productName,
          warehouse_id: r.from_warehouse_id,
          warehouse_name: whMap.get(r.from_warehouse_id) || "—",
          qty: -Number(r.quantity || 0),
          doc_number: `TR-${String(r.id).slice(0, 6).toUpperCase()}`,
          doc_id: r.id,
          doc_ref: r.id ? String(r.id).slice(0, 8) : null,
          doc_href: null,

          party_name: `إلى: ${whMap.get(r.to_warehouse_id) || "—"}`,
          reason: r.notes,
        });
        moves.push({
          id: `trn-in-${r.id}`,
          date: r.date,
          created_at: r.created_at,
          type: "transfer_in",
          product_id: r.product_id,
          product_name: productName,
          warehouse_id: r.to_warehouse_id,
          warehouse_name: whMap.get(r.to_warehouse_id) || "—",
          qty: +Number(r.quantity || 0),
          doc_number: `TR-${String(r.id).slice(0, 6).toUpperCase()}`,
          doc_id: r.id,
          doc_ref: r.id ? String(r.id).slice(0, 8) : null,
          doc_href: null,

          party_name: `من: ${whMap.get(r.from_warehouse_id) || "—"}`,
          reason: r.notes,
        });
      });

      (adj.data || []).forEach((r: any) => {
        const productName = productMap.get(r.product_id)?.name || "—";
        const isInvoiceDelete = String(r.source || "") === "invoice_delete";
        // Try to extract invoice number from reason text: "...حذف الفاتورة INV-XXXX"
        const invMatch = isInvoiceDelete && r.reason
          ? String(r.reason).match(/الفاتورة\s+(\S+)/)
          : null;
        const invNo = invMatch?.[1] || null;
        moves.push({
          id: `adj-${r.id}`,
          date: (r.created_at || "").slice(0, 10),
          created_at: r.created_at,
          type: isInvoiceDelete ? "invoice_delete_restore" : "manual_adjustment",
          product_id: r.product_id,
          product_name: productName,
          warehouse_id: null,
          warehouse_name: productWhName(r.product_id),
          qty: Number(r.delta || 0),
          doc_number: isInvoiceDelete
            ? (invNo || `DEL-${String(r.reference_id || r.id).slice(0, 6).toUpperCase()}`)
            : `ADJ-${String(r.id).slice(0, 6).toUpperCase()}`,
          doc_id: r.id,
          doc_ref: String(r.reference_id || r.id).slice(0, 8),
          doc_href: null,

          party_name: isInvoiceDelete ? "فاتورة محذوفة" : (r.source || "manual"),
          reason: r.reason,
        });
      });


      // ترتيب زمني تنازلي (الأحدث أولاً)
      moves.sort((a, b) => {
        const A = a.created_at || a.date;
        const B = b.created_at || b.date;
        return A < B ? 1 : A > B ? -1 : 0;
      });

      return { moves, currentStock: stockMap };
    },
  });
}

const typeLabel: Record<MoveType, string> = {
  sale: "بيع",
  return: "إرجاع",
  purchase: "شراء",
  transfer_in: "تحويل وارد",
  transfer_out: "تحويل صادر",
  manual_adjustment: "تعديل يدوي",
  invoice_delete_restore: "استرجاع حذف فاتورة",
};

const typeBadgeCls: Record<MoveType, string> = {
  sale: "bg-destructive/15 text-destructive border-destructive/30",
  return: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  purchase: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  transfer_in: "bg-primary/15 text-primary border-primary/30",
  transfer_out: "bg-primary/10 text-primary border-primary/30",
  manual_adjustment: "bg-muted text-foreground border-border",
  invoice_delete_restore: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
};


export default function StockTrackingPage() {
  const prefs = loadPrefs();
  const [from, setFrom] = useState(prefs.from || daysAgoISO(6));
  const [to, setTo] = useState(prefs.to || todayISO());
  const [types, setTypes] = useState<MoveType[]>((prefs.types as MoveType[]) || []);
  const [q, setQ] = useState(prefs.q || "");
  const [productFilter, setProductFilter] = useState<string>(prefs.productFilter || "all");
  const [warehouseFilter, setWarehouseFilter] = useState<string>(prefs.warehouseFilter || "all");
  const [pdfLoading, setPdfLoading] = useState(false);

  // Persist filters after every change (survives reload).
  useEffect(() => {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ from, to, types, q, productFilter, warehouseFilter }),
      );
    } catch { /* ignore quota */ }
  }, [from, to, types, q, productFilter, warehouseFilter]);



  const { data, isLoading } = useStockMovements(from, to);
  const moves = data?.moves || [];
  const currentStock = data?.currentStock || new Map<string, number>();

  const productsList = useMemo(() => {
    const seen = new Map<string, string>();
    moves.forEach((m) => {
      if (m.product_id && !seen.has(m.product_id)) seen.set(m.product_id, m.product_name);
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [moves]);

  const warehousesList = useMemo(() => {
    const seen = new Map<string, string>();
    moves.forEach((m) => {
      if (m.warehouse_id) seen.set(m.warehouse_id, m.warehouse_name);
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [moves]);

  const filtered = useMemo(() => {
    return moves.filter((m) => {
      if (types.length > 0 && !types.includes(m.type)) return false;
      if (productFilter !== "all" && m.product_id !== productFilter) return false;
      if (warehouseFilter !== "all" && m.warehouse_id !== warehouseFilter) return false;
      if (q) {
        const hit =
          startsWithMatch(m.product_name, q) ||
          startsWithMatch(m.doc_number, q) ||
          startsWithMatch(m.party_name, q);
        if (!hit) return false;
      }
      return true;
    });
  }, [moves, types, productFilter, warehouseFilter, q]);

  // Running balance (رصيد بعد الحركة) — يُحسب لكل منتج كرصيد تاريخي بالتراجع من الرصيد الحالي.
  // الرصيد الحالي = مجموع كل الحركات منذ بداية الوجود. رصيد "بعد" حركة معيّنة = الرصيد الحالي - Σ الحركات الأحدث منها.
  const rowsWithBalance = useMemo(() => {
    // نجمع كل الحركات (بلا فلترة) لكل product_id لحساب صافي "الأحدث من هذه الحركة"
    const byProduct = new Map<string, Move[]>();
    moves.forEach((m) => {
      if (!m.product_id) return;
      const arr = byProduct.get(m.product_id) || [];
      arr.push(m);
      byProduct.set(m.product_id, arr);
    });
    // ترتيب كل قائمة تصاعدياً لحساب الرصيد المتحرك بشكل زمني
    byProduct.forEach((arr) => arr.sort((a, b) => {
      const A = a.created_at || a.date; const B = b.created_at || b.date;
      return A < B ? -1 : A > B ? 1 : 0;
    }));

    // خريطة id -> رصيد بعد الحركة
    const balanceAfter = new Map<string, number>();
    byProduct.forEach((arr, pid) => {
      const finalStock = currentStock.get(pid) ?? 0;
      // مجموع كل الحركات ضمن النطاق
      const sumAll = arr.reduce((s, m) => s + m.qty, 0);
      // الرصيد الافتتاحي قبل بداية النطاق = finalStock - sumAll (تقديري ضمن النطاق فقط)
      let running = finalStock - sumAll;
      arr.forEach((m) => {
        running += m.qty;
        balanceAfter.set(m.id, running);
      });
    });

    return filtered.map((m) => ({ ...m, balance_after: m.product_id ? balanceAfter.get(m.id) ?? null : null }));
  }, [moves, filtered, currentStock]);

  const totals = useMemo(() => {
    let incoming = 0, outgoing = 0;
    filtered.forEach((m) => {
      if (m.qty > 0) incoming += m.qty; else outgoing += -m.qty;
    });
    // رصيد افتتاحي/ختامي = تجميعي عبر كل الحركات في الفلتر لمنتج/مستودع محدّد فقط عندما يكون هناك اختيار
    let opening: number | null = null;
    let closing: number | null = null;
    if (productFilter !== "all") {
      const finalStock = currentStock.get(productFilter) ?? 0;
      const sumAllForProduct = moves
        .filter((m) => m.product_id === productFilter)
        .reduce((s, m) => s + m.qty, 0);
      opening = finalStock - sumAllForProduct;
      closing = opening + incoming - outgoing;
    }
    return { incoming, outgoing, net: incoming - outgoing, opening, closing };
  }, [filtered, moves, productFilter, currentStock]);

  const setRange = (kind: "today" | "yesterday" | "7d" | "30d" | "90d") => {
    if (kind === "today") { setFrom(todayISO()); setTo(todayISO()); }
    else if (kind === "yesterday") { const y = daysAgoISO(1); setFrom(y); setTo(y); }
    else if (kind === "7d") { setFrom(daysAgoISO(6)); setTo(todayISO()); }
    else if (kind === "30d") { setFrom(daysAgoISO(29)); setTo(todayISO()); }
    else { setFrom(daysAgoISO(89)); setTo(todayISO()); }
  };

  const toggleType = (t: MoveType) => {
    setTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const exportExcel = () => {
    try {
      const rows = rowsWithBalance.map((m) => ({
        "التاريخ": m.date,
        "الوقت": m.created_at ? new Date(m.created_at).toLocaleTimeString("ar-EG") : "",
        "النوع": typeLabel[m.type],
        "المنتج": m.product_name,
        "المستودع": m.warehouse_name,
        "الكمية": m.qty,
        "رصيد بعد الحركة": m.balance_after ?? "",
        "المستند": m.doc_number,
        "رقم العملية": m.doc_ref ?? "",
        "الجهة": m.party_name,
        "ملاحظات": m.reason || "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "حركات المخزون");
      XLSX.writeFile(wb, `stock-movements-${from}_${to}.xlsx`);
      toast.success("تم تصدير الملف");
    } catch (e: any) {
      toast.error(e?.message || "فشل التصدير");
    }
  };

  const buildPrintPayload = () => {
    const productName =
      productFilter !== "all"
        ? (productsList.find((p: any) => p.id === productFilter)?.name || null)
        : null;
    const warehouseName =
      warehouseFilter !== "all"
        ? (warehousesList.find((w: any) => w.id === warehouseFilter)?.name || null)
        : null;
    return {
      from,
      to,
      totals,
      filters: {
        product: productName,
        warehouse: warehouseName,
        types: types.map((t) => typeLabel[t]),
        query: q || undefined,
      },
      rows: rowsWithBalance.map((m) => ({
        date: m.date,
        created_at: m.created_at,
        type: m.type,
        typeLabel: typeLabel[m.type],
        product_name: m.product_name,
        warehouse_name: m.warehouse_name,
        qty: m.qty,
        balance_after: m.balance_after ?? null,
        doc_number: m.doc_number,
        doc_ref: m.doc_ref ?? null,
        party_name: m.party_name,
        reason: m.reason,
      })),
    };
  };

  const printPage = async () => {
    try {
      await printStockMovements(buildPrintPayload());
    } catch (e: any) {
      toast.error(e?.message || "فشل فتح نافذة المعاينة");
    }
  };

  const downloadPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    const t = toast.loading("جاري إنشاء ملف PDF...");
    try {
      await downloadStockMovementsPdf(buildPrintPayload());
      toast.success("تم تنزيل ملف PDF", { id: t });
    } catch (e: any) {
      toast.error(e?.message || "فشل إنشاء ملف PDF", { id: t });
    } finally {
      setPdfLoading(false);
    }
  };



  const allTypes: MoveType[] = ["sale", "return", "purchase", "transfer_in", "transfer_out", "manual_adjustment", "invoice_delete_restore"];

  return (
    <div dir="rtl" className="p-3 sm:p-6 space-y-4 font-cairo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">تتبع حركات المخزون</h1>
          <p className="text-sm text-muted-foreground mt-1">
            كل الحركات: بيع · شراء · إرجاع · تحويلات · تعديلات يدوية — {arDate(from)} ← {arDate(to)}
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Button variant="outline" size="sm" className="gap-2 min-h-[40px]" onClick={exportExcel}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 min-h-[40px]"
            onClick={downloadPdf}
            disabled={pdfLoading}
          >
            <FileText className="h-4 w-4" /> {pdfLoading ? "جاري..." : "PDF"}
          </Button>
          <Button variant="outline" size="sm" className="gap-2 min-h-[40px]" onClick={printPage}>
            <Printer className="h-4 w-4" /> معاينة وطباعة
          </Button>
        </div>

      </div>

      {/* بطاقات الإحصاء */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Package className="h-5 w-5" />}
          label="رصيد افتتاحي"
          value={totals.opening}
          hint={productFilter === "all" ? "اختر منتجاً" : undefined}
          tone="muted"
        />
        <SummaryCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="وارد"
          value={totals.incoming}
          tone="emerald"
        />
        <SummaryCard
          icon={<TrendingDown className="h-5 w-5" />}
          label="صادر"
          value={totals.outgoing}
          tone="destructive"
        />
        <SummaryCard
          icon={<Warehouse className="h-5 w-5" />}
          label="رصيد ختامي"
          value={totals.closing}
          hint={productFilter === "all" ? "اختر منتجاً" : `صافي: ${totals.net >= 0 ? "+" : ""}${totals.net}`}
          tone={totals.closing != null && totals.closing < 0 ? "destructive" : "primary"}
        />
      </div>

      {/* الفلاتر */}
      <Card className="no-print">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="min-h-[40px]" onClick={() => setRange("today")}>اليوم</Button>
            <Button variant="outline" size="sm" className="min-h-[40px]" onClick={() => setRange("yesterday")}>أمس</Button>
            <Button variant="outline" size="sm" className="min-h-[40px]" onClick={() => setRange("7d")}>7 أيام</Button>
            <Button variant="outline" size="sm" className="min-h-[40px]" onClick={() => setRange("30d")}>30 يوم</Button>
            <Button variant="outline" size="sm" className="min-h-[40px]" onClick={() => setRange("90d")}>90 يوم</Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">من تاريخ</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">المنتج</label>
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="all">كل المنتجات</SelectItem>
                  {productsList.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">المستودع</label>
              <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المستودعات</SelectItem>
                  {warehousesList.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Sliders className="h-3.5 w-3.5" /> نوع الحركة:
            </div>
            {allTypes.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                  types.includes(t)
                    ? typeBadgeCls[t] + " font-semibold"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {typeLabel[t]}
              </button>
            ))}
            {types.length > 0 && (
              <button
                type="button"
                onClick={() => setTypes([])}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                إلغاء الكل
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="absolute top-1/2 -translate-y-1/2 end-3 h-4 w-4 text-muted-foreground" />
            <Input className="pe-9" placeholder="بحث بالمنتج / رقم المستند / الجهة..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* الجدول */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="mobile-stack-table">
            <TableHeader>
              <TableRow>
                <TableHead className="text-right whitespace-nowrap">التاريخ</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">المنتج</TableHead>
                <TableHead className="text-right">المستودع</TableHead>
                <TableHead className="text-right">الكمية</TableHead>
                <TableHead className="text-right">رصيد بعد</TableHead>
                <TableHead className="text-right">المستند</TableHead>
                <TableHead className="text-right">الجهة / السبب</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
              )}
              {!isLoading && rowsWithBalance.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">لا توجد حركات في هذه الفترة</TableCell></TableRow>
              )}
              {rowsWithBalance.map((m) => (
                <TableRow key={m.id} className="hover:bg-muted/40">
                  <TableCell data-label="التاريخ" className="whitespace-nowrap text-xs">
                    <div>{arDate(m.date)}</div>
                    {m.created_at && (
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(m.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell data-label="النوع">
                    <Badge variant="outline" className={typeBadgeCls[m.type]}>
                      {(m.type === "transfer_in" || m.type === "transfer_out") && <ArrowLeftRight className="h-3 w-3 me-1" />}
                      {typeLabel[m.type]}
                    </Badge>
                  </TableCell>
                  <TableCell data-label="المنتج" className="font-medium">
                    <button
                      className="text-primary hover:underline text-right"
                      onClick={() => m.product_id && setProductFilter(m.product_id)}
                    >
                      {m.product_name}
                    </button>
                  </TableCell>
                  <TableCell data-label="المستودع" className="text-muted-foreground">{m.warehouse_name}</TableCell>
                  <TableCell data-label="الكمية" className={m.qty < 0 ? "text-destructive font-bold tabular-nums" : "text-emerald-600 dark:text-emerald-400 font-bold tabular-nums"}>
                    {m.qty > 0 ? `+${m.qty}` : m.qty}
                  </TableCell>
                  <TableCell data-label="رصيد بعد" className="text-foreground tabular-nums font-semibold">
                    {m.balance_after ?? "—"}
                  </TableCell>
                  <TableCell data-label="المستند">
                    <div className="flex items-center gap-1 flex-wrap">
                      {m.doc_href ? (
                        <Link to={m.doc_href} className="text-primary hover:underline font-semibold">{m.doc_number}</Link>
                      ) : (
                        <span className="text-foreground font-semibold">{m.doc_number}</span>
                      )}
                      {m.is_pos && (
                        <span className="inline-block px-1.5 py-0.5 text-[10px] rounded border border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold">
                          كاش
                        </span>
                      )}
                    </div>
                    {m.doc_ref && (
                      <div
                        className="text-[10px] text-muted-foreground font-mono cursor-pointer hover:text-foreground"
                        title="اضغط لنسخ رقم العملية"
                        onClick={() => {
                          navigator.clipboard?.writeText(m.doc_ref!).then(
                            () => toast.success("تم نسخ رقم العملية"),
                            () => {},
                          );
                        }}
                      >
                        #{m.doc_ref}
                      </div>
                    )}
                  </TableCell>

                  <TableCell data-label="الجهة">
                    <div>{m.party_name}</div>
                    {m.reason && <div className="text-[11px] text-muted-foreground">{m.reason}</div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}

function SummaryCard({
  icon, label, value, tone, hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  tone: "destructive" | "emerald" | "primary" | "muted";
  hint?: string;
}) {
  const toneCls =
    tone === "destructive" ? "text-destructive bg-destructive/10"
    : tone === "emerald" ? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
    : tone === "primary" ? "text-primary bg-primary/10"
    : "text-foreground bg-muted";
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-md flex items-center justify-center ${toneCls}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          <div className="text-xl font-bold text-foreground tabular-nums">{value ?? "—"}</div>
          {hint && <div className="text-[10px] text-muted-foreground truncate">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
