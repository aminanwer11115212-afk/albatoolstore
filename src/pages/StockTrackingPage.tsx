import { useMemo, useState } from "react";
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
import { Search, TrendingDown, TrendingUp, RotateCcw, Package } from "lucide-react";

type MoveType = "sale" | "return" | "purchase";

interface Move {
  id: string;
  date: string; // ISO yyyy-mm-dd
  type: MoveType;
  product_id: string | null;
  product_name: string;
  qty: number; // signed
  doc_number: string;
  doc_id: string;
  party_name: string;
  current_stock: number | null;
  is_pos?: boolean;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const arDate = (iso: string) =>
  new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "long" }).format(new Date(iso));

function useStockMovements(from: string, to: string) {
  return useQuery({
    queryKey: ["stock-tracking", from, to],
    queryFn: async (): Promise<Move[]> => {
      const [inv, ret, pur, prods] = await Promise.all([
        supabase
          .from("invoice_items")
          .select("id, product_id, product_name, quantity, invoice_id, invoices!inner(id, invoice_number, date, customer_id, status, source, walk_in_customer_name, customers(name))")
          .gte("invoices.date", from).lte("invoices.date", to)
          .neq("invoices.status", "cancelled")
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("stock_return_items")
          .select("id, product_id, product_name, quantity, stock_return_id, stock_returns!inner(id, return_number, date, customer_id, customers(name))")
          .gte("stock_returns.date", from).lte("stock_returns.date", to)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("purchase_order_items")
          .select("id, product_id, product_name, quantity, purchase_order_id, purchase_orders!inner(id, order_number, date, supplier_id, status, suppliers(name))")
          .gte("purchase_orders.date", from).lte("purchase_orders.date", to)
          .neq("purchase_orders.status", "cancelled")
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase.from("products").select("id, stock_quantity"),
      ]);

      if (inv.error) throw inv.error;
      if (ret.error) throw ret.error;
      if (pur.error) throw pur.error;
      if (prods.error) throw prods.error;

      const stockMap = new Map<string, number>(
        (prods.data || []).map((p: any) => [p.id, Number(p.stock_quantity || 0)])
      );

      const moves: Move[] = [];

      (inv.data || []).forEach((r: any) => {
        const isPos = (r.invoices?.source || "") === "pos";
        moves.push({
          id: `sale-${r.id}`,
          date: r.invoices?.date,
          type: "sale",
          product_id: r.product_id,
          product_name: r.product_name,
          qty: -Number(r.quantity || 0),
          doc_number: r.invoices?.invoice_number || "—",
          doc_id: r.invoices?.id,
          party_name: r.invoices?.customers?.name || r.invoices?.walk_in_customer_name || (isPos ? "عميل نقدي" : "—"),
          current_stock: r.product_id ? stockMap.get(r.product_id) ?? null : null,
          is_pos: isPos,
        });
      });
      (ret.data || []).forEach((r: any) => {
        moves.push({
          id: `ret-${r.id}`,
          date: r.stock_returns?.date,
          type: "return",
          product_id: r.product_id,
          product_name: r.product_name,
          qty: +Number(r.quantity || 0),
          doc_number: r.stock_returns?.return_number || "—",
          doc_id: r.stock_returns?.id,
          party_name: r.stock_returns?.customers?.name || "—",
          current_stock: r.product_id ? stockMap.get(r.product_id) ?? null : null,
        });
      });
      (pur.data || []).forEach((r: any) => {
        moves.push({
          id: `pur-${r.id}`,
          date: r.purchase_orders?.date,
          type: "purchase",
          product_id: r.product_id,
          product_name: r.product_name,
          qty: +Number(r.quantity || 0),
          doc_number: r.purchase_orders?.order_number || "—",
          doc_id: r.purchase_orders?.id,
          party_name: r.purchase_orders?.suppliers?.name || "—",
          current_stock: r.product_id ? stockMap.get(r.product_id) ?? null : null,
        });
      });

      moves.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      return moves;
    },
  });
}

const typeLabel: Record<MoveType, string> = {
  sale: "بيع",
  return: "إرجاع",
  purchase: "شراء",
};

const typeBadgeCls: Record<MoveType, string> = {
  sale: "bg-destructive/15 text-destructive border-destructive/30",
  return: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  purchase: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

const docHref = (m: Move) =>
  m.type === "sale"
    ? (m.is_pos ? `/invoices/cash/edit/${m.doc_id}` : `/invoices/view/${m.doc_id}`)
    : m.type === "return"
    ? `/stock-return/view/${m.doc_id}`
    : `/purchase/edit/${m.doc_id}`;

export default function StockTrackingPage() {
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [type, setType] = useState<"all" | MoveType>("all");
  const [q, setQ] = useState("");

  const { data: moves = [], isLoading } = useStockMovements(from, to);

  const filtered = useMemo(() => {
    return moves.filter((m) => {
      if (type !== "all" && m.type !== type) return false;
      if (q && !startsWithMatch(m.product_name, q) && !startsWithMatch(m.doc_number, q) && !startsWithMatch(m.party_name, q)) return false;
      return true;
    });
  }, [moves, type, q]);

  const totals = useMemo(() => {
    let sales = 0, returns = 0, purchases = 0;
    filtered.forEach((m) => {
      if (m.type === "sale") sales += -m.qty;
      else if (m.type === "return") returns += m.qty;
      else purchases += m.qty;
    });
    return { sales, returns, purchases, net: purchases + returns - sales };
  }, [filtered]);

  const setRange = (kind: "today" | "yesterday" | "7d" | "30d") => {
    if (kind === "today") { setFrom(todayISO()); setTo(todayISO()); }
    else if (kind === "yesterday") { const y = daysAgoISO(1); setFrom(y); setTo(y); }
    else if (kind === "7d") { setFrom(daysAgoISO(6)); setTo(todayISO()); }
    else { setFrom(daysAgoISO(29)); setTo(todayISO()); }
  };

  return (
    <div dir="rtl" className="p-3 sm:p-6 space-y-4 font-cairo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">تتبع المخزون</h1>
          <p className="text-sm text-muted-foreground mt-1">
            اليوم: {arDate(todayISO())}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard icon={<TrendingDown className="h-5 w-5" />} label="المبيعات (كمية)" value={totals.sales} tone="destructive" />
        <SummaryCard icon={<RotateCcw className="h-5 w-5" />} label="المرتجعات" value={totals.returns} tone="amber" />
        <SummaryCard icon={<TrendingUp className="h-5 w-5" />} label="المشتريات" value={totals.purchases} tone="emerald" />
        <SummaryCard icon={<Package className="h-5 w-5" />} label="صافي الحركة" value={totals.net} tone={totals.net >= 0 ? "emerald" : "destructive"} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => setRange("today")}>اليوم</Button>
            <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => setRange("yesterday")}>أمس</Button>
            <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => setRange("7d")}>آخر 7 أيام</Button>
            <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => setRange("30d")}>آخر 30 يوم</Button>
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
              <label className="text-xs text-muted-foreground mb-1 block">نوع الحركة</label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="sale">بيع</SelectItem>
                  <SelectItem value="return">إرجاع</SelectItem>
                  <SelectItem value="purchase">شراء</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">بحث (منتج / مستند / جهة)</label>
              <div className="relative">
                <Search className="absolute top-1/2 -translate-y-1/2 end-3 h-4 w-4 text-muted-foreground" />
                <Input className="pe-9" placeholder="ابحث..." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="mobile-stack-table">
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">المنتج</TableHead>
                <TableHead className="text-right">الكمية</TableHead>
                <TableHead className="text-right">رقم المستند</TableHead>
                <TableHead className="text-right">العميل / المورد</TableHead>
                <TableHead className="text-right">المخزون الحالي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد حركات في هذه الفترة</TableCell></TableRow>
              )}
              {filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell data-label="التاريخ" className="whitespace-nowrap">{arDate(m.date)}</TableCell>
                  <TableCell data-label="النوع">
                    <Badge variant="outline" className={typeBadgeCls[m.type]}>{typeLabel[m.type]}</Badge>
                  </TableCell>
                  <TableCell data-label="المنتج">
                    <button
                      className="text-primary hover:underline text-right"
                      onClick={() => setQ(m.product_name)}
                    >
                      {m.product_name}
                    </button>
                  </TableCell>
                  <TableCell data-label="الكمية" className={m.qty < 0 ? "text-destructive font-bold" : "text-emerald-600 dark:text-emerald-400 font-bold"}>
                    {m.qty > 0 ? `+${m.qty}` : m.qty}
                  </TableCell>
                  <TableCell data-label="المستند">
                    <Link to={docHref(m)} className="text-primary hover:underline">{m.doc_number}</Link>
                    {m.is_pos && (
                      <span className="ms-2 inline-block px-1.5 py-0.5 text-[10px] rounded border border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold">
                        كاش
                      </span>
                    )}
                  </TableCell>
                  <TableCell data-label="الجهة">{m.party_name}</TableCell>
                  <TableCell data-label="المخزون" className="text-muted-foreground">{m.current_stock ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "destructive" | "amber" | "emerald" }) {
  const toneCls =
    tone === "destructive" ? "text-destructive bg-destructive/10"
    : tone === "amber" ? "text-amber-700 dark:text-amber-400 bg-amber-500/10"
    : "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10";
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-md flex items-center justify-center ${toneCls}`}>{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-bold text-foreground">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
