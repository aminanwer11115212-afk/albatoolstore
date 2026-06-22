import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Printer, Save, Trash2, Search, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { startsWithMatch } from "@/utils/searchMatch";
import { deductStockForInvoiceOnce } from "@/utils/stockDeduction";
import { fetchAllProducts } from "@/lib/fetchAllProducts";

type Product = {
  id: string;
  name: string;
  sale_price: number | null;
  unit?: string | null;
  stock_quantity?: number | null;
  is_frozen?: boolean | null;
};
type Account = { id: string; name: string; account_type?: string | null };
type Row = {
  product_id: string;
  product_name: string;
  unit?: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
};

export default function PosPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [invoicePrefix, setInvoicePrefix] = useState("POS-");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [walkInName, setWalkInName] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [generalDiscount, setGeneralDiscount] = useState(0);
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // ─── Initial load ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [ps, accs, cfg] = await Promise.all([
        fetchAllProducts<Product>("id,name,sale_price,unit,stock_quantity,is_frozen"),
        supabase.from("accounts").select("id,name,account_type").order("name"),
        supabase.from("company_settings").select("*").maybeSingle(),
      ]);
      setProducts((ps as any[]).filter((x: any) => !x.is_frozen));
      if (accs.data) {
        setAccounts(accs.data as Account[]);
        const cash = (accs.data as any[]).find((a) => a.account_type === "cash") || accs.data[0];
        if (cash) setAccountId(cash.id);
      }
      if (cfg.data) {
        setCompany(cfg.data);
        if (cfg.data.invoice_prefix) setInvoicePrefix(cfg.data.invoice_prefix);
      }
    })();
  }, []);

  // Generate next invoice number
  useEffect(() => {
    (async () => {
      const { data: last } = await supabase
        .from("invoices")
        .select("invoice_number")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let next = 1;
      if (last?.invoice_number) {
        const m = String(last.invoice_number).match(/(\d+)$/);
        if (m) next = parseInt(m[1]) + 1;
      }
      setInvoiceNumber(`${invoicePrefix}${String(next).padStart(4, "0")}`);
    })();
  }, [invoicePrefix]);

  // ─── Product search results ─────────────────────────────────────
  const searchResults = useMemo(() => {
    const q = search.trim();
    if (!q) return [];
    return products
      .filter((p) => startsWithMatch(p.name, q))
      .slice(0, 8);
  }, [products, search]);

  // ─── Add product to cart ────────────────────────────────────────
  const addProduct = (p: Product) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.product_id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          product_id: p.id,
          product_name: p.name,
          unit: p.unit || null,
          quantity: 1,
          unit_price: Number(p.sale_price || 0),
          discount: 0,
        },
      ];
    });
    setSearch("");
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const updateRow = (i: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  // ─── Totals ─────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let subtotal = 0;
    let itemDiscounts = 0;
    rows.forEach((r) => {
      const line = Number(r.quantity || 0) * Number(r.unit_price || 0);
      subtotal += line;
      itemDiscounts += Number(r.discount || 0);
    });
    const total = Math.max(0, subtotal - itemDiscounts - (Number(generalDiscount) || 0));
    return { subtotal, itemDiscounts, total };
  }, [rows, generalDiscount]);

  // ─── Save ───────────────────────────────────────────────────────
  async function save(opts: { print?: boolean; andNew?: boolean } = {}) {
    if (rows.length === 0) {
      toast.error("أضف منتجاً واحداً على الأقل");
      return;
    }
    if (!accountId) {
      toast.error("اختر الحساب النقدي");
      return;
    }
    setSaving(true);
    try {
      const total = totals.total;
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
        invoice_number: invoiceNumber,
        customer_id: null,
        walk_in_customer_name: walkInName.trim() || "عميل نقدي",
        source: "pos",
        type: "cash",
        date: new Date().toISOString().slice(0, 10),
        subtotal: totals.subtotal,
        discount: totals.itemDiscounts + (Number(generalDiscount) || 0),
        shipping: 0,
        total,
        paid_amount: total,
        due_amount: 0,
        status: "paid",
        workflow_status: "done",
        payment_method: "cash",
        currency_code: company?.currency || "SDG",
        created_by_uid: user?.id || null,
      };

      // Insert invoice with collision retry
      let invId: string | undefined;
      let currentNumber = invoiceNumber;
      let attempt = 0;
      while (attempt < 5) {
        const { data, error } = await supabase
          .from("invoices")
          .insert({ ...payload, invoice_number: currentNumber })
          .select("id,invoice_number")
          .single();
        if (!error) {
          invId = data.id;
          if (data.invoice_number !== invoiceNumber) {
            setInvoiceNumber(data.invoice_number);
          }
          break;
        }
        const isDup =
          (error as any).code === "23505" ||
          /duplicate key|invoice_number/i.test(error.message || "");
        if (!isDup) throw error;
        const m = currentNumber.match(/^(.*?)(\d+)$/);
        if (m) {
          currentNumber = `${m[1]}${String(parseInt(m[2]) + 1).padStart(m[2].length, "0")}`;
        } else {
          throw error;
        }
        attempt++;
      }
      if (!invId) throw new Error("تعذّر إنشاء رقم الفاتورة");

      // Insert items
      const items = rows.map((r) => ({
        invoice_id: invId!,
        product_id: r.product_id,
        product_name: r.product_name,
        quantity: r.quantity,
        unit_price: r.unit_price,
        discount: r.discount,
        unit: r.unit,
        total:
          Math.max(0, Number(r.quantity || 0) * Number(r.unit_price || 0) - Number(r.discount || 0)),
      }));
      const { error: itemsErr } = await supabase.from("invoice_items").insert(items);
      if (itemsErr) throw itemsErr;

      // Stock deduction (idempotent)
      await deductStockForInvoiceOnce(
        invId,
        rows.map((r) => ({ product_id: r.product_id, quantity: r.quantity })),
      );

      // Cash income transaction
      const desc = `بيع نقدي - ${invoiceNumber} - ${walkInName.trim() || "عميل نقدي"}`;
      const { error: txErr } = await supabase.from("transactions").insert({
        type: "income",
        amount: total,
        description: desc,
        category: "pos_sale",
        account_id: accountId,
        date: new Date().toISOString().slice(0, 10),
        method: "cash",
        reference_id: invId,
        currency_code: company?.currency || "SDG",
      });
      if (txErr) console.warn("[POS] tx insert failed", txErr.message);

      try {
        window.dispatchEvent(new Event("invoices:changed"));
      } catch {}

      toast.success("تم حفظ فاتورة الكاش");

      if (opts.print) {
        navigate(`/preview/invoice/${invId}`);
        return;
      }
      if (opts.andNew) {
        setRows([]);
        setWalkInName("");
        setGeneralDiscount(0);
        const m = invoiceNumber.match(/^(.*?)(\d+)$/);
        if (m) {
          setInvoiceNumber(`${m[1]}${String(parseInt(m[2]) + 1).padStart(m[2].length, "0")}`);
        }
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    } catch (e: any) {
      console.error("[PosPage] save failed", e);
      toast.error(`فشل الحفظ: ${e?.message || "خطأ غير معروف"}`);
    } finally {
      setSaving(false);
    }
  }

  const fmt = (n: any) =>
    Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const currency = company?.currency || "SDG";

  return (
    <div dir="rtl" className="space-y-3 p-2 md:p-4">
      {/* Header */}
      <Card>
        <CardHeader className="p-3 md:p-4 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              مبيعات كاش (نقطة بيع)
              <span className="text-xs font-normal text-muted-foreground">— {invoiceNumber}</span>
            </CardTitle>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => save({ andNew: true })}
                disabled={saving}
                title="حفظ وفتح فاتورة جديدة"
              >
                <Plus className="w-4 h-4" />
                حفظ وجديد
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => save({ print: true })}
                disabled={saving}
                title="حفظ ومعاينة الإيصال للطباعة"
              >
                <Printer className="w-4 h-4" />
                حفظ وطباعة
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 md:p-4 pt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">اسم العميل (اختياري)</label>
            <Input
              value={walkInName}
              onChange={(e) => setWalkInName(e.target.value)}
              placeholder="عميل نقدي"
              className="h-9"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">حساب الاستلام</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— اختر حساباً —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">خصم عام</label>
            <Input
              type="number"
              value={generalDiscount}
              onChange={(e) => setGeneralDiscount(Number(e.target.value) || 0)}
              className="h-9"
              min={0}
            />
          </div>
        </CardContent>
      </Card>

      {/* Product picker */}
      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن منتج بالاسم..."
              className="h-10 pr-10"
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchResults[0]) {
                  e.preventDefault();
                  addProduct(searchResults[0]);
                }
              }}
            />
            {searchResults.length > 0 && (
              <div className="mt-2 border border-border rounded-md bg-card max-h-72 overflow-auto divide-y divide-border">
                {searchResults.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => addProduct(p)}
                    className="w-full text-right px-3 py-2 hover:bg-muted/60 flex justify-between items-center text-sm"
                  >
                    <span className="flex-1">{p.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {fmt(p.sale_price)} {currency} · مخزون: {Number(p.stock_quantity || 0)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Items table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="text-xs">
                  <th className="text-right px-2 py-2 w-10">#</th>
                  <th className="text-right px-2 py-2">المنتج</th>
                  <th className="text-right px-2 py-2 w-20">الكمية</th>
                  <th className="text-right px-2 py-2 w-28">السعر</th>
                  <th className="text-right px-2 py-2 w-24">خصم</th>
                  <th className="text-right px-2 py-2 w-28">الإجمالي</th>
                  <th className="text-right px-2 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted-foreground py-8 text-sm">
                      لا توجد بنود — ابحث عن منتج أعلاه لإضافته
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => {
                    const line = Math.max(
                      0,
                      Number(r.quantity || 0) * Number(r.unit_price || 0) - Number(r.discount || 0),
                    );
                    return (
                      <tr key={r.product_id + "-" + i} className="border-t border-border">
                        <td className="px-2 py-1 text-muted-foreground tabular-nums">{i + 1}</td>
                        <td className="px-2 py-1">{r.product_name}</td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            value={r.quantity}
                            onChange={(e) =>
                              updateRow(i, { quantity: Math.max(0, Number(e.target.value) || 0) })
                            }
                            className="h-8 text-sm"
                            min={0}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            value={r.unit_price}
                            onChange={(e) =>
                              updateRow(i, { unit_price: Number(e.target.value) || 0 })
                            }
                            className="h-8 text-sm"
                            min={0}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            value={r.discount}
                            onChange={(e) =>
                              updateRow(i, { discount: Math.max(0, Number(e.target.value) || 0) })
                            }
                            className="h-8 text-sm"
                            min={0}
                          />
                        </td>
                        <td className="px-2 py-1 tabular-nums font-medium">
                          {fmt(line)} {currency}
                        </td>
                        <td className="px-2 py-1">
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            className="text-destructive hover:text-destructive/80 p-1"
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Totals summary */}
      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">المجموع الفرعي</div>
              <div className="font-semibold tabular-nums">{fmt(totals.subtotal)} {currency}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">خصم البنود</div>
              <div className="font-semibold tabular-nums">{fmt(totals.itemDiscounts)} {currency}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">خصم عام</div>
              <div className="font-semibold tabular-nums">{fmt(generalDiscount)} {currency}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">الإجمالي للدفع</div>
              <div className="font-bold text-lg text-primary tabular-nums">
                {fmt(totals.total)} {currency}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => save({ andNew: true })}
              disabled={saving || rows.length === 0}
            >
              <Save className="w-4 h-4" />
              حفظ وجديد
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => save({ print: true })}
              disabled={saving || rows.length === 0}
            >
              <Printer className="w-4 h-4" />
              حفظ وطباعة الإيصال
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
