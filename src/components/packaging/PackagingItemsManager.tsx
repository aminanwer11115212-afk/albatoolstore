import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { usePackagingTypes, useProducts } from "@/hooks/useData";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useSpaceToDelete } from "@/hooks/useSpaceToDelete";
import { startsWithMatch } from "@/utils/searchMatch";

interface Props {
  parentTable: "invoice_packaging" | "quotes_packaging";
  itemsTable: "invoices_packaging_items" | "quotes_packaging_items";
  parentFkColumn: "invoice_packaging_id" | "quote_packaging_id";
  parentId: string;
  allowedProductIds?: string[];
  /** كمية كل منتج في بنود الفاتورة/العرض الأم (product_id → qty) */
  productQuantities?: Record<string, number>;
  /** ما تم تغليفه فعلياً من كل منتج عبر كل سجلات التغليف للمستند */
  packagedTotals?: Record<string, number>;
  /** يُستدعى بعد أي تغيير في البنود لإعادة حساب الإجماليات في المُكوّن الأب */
  onItemsChanged?: () => void;
}

export default function PackagingItemsManager({
  itemsTable, parentFkColumn, parentId, allowedProductIds,
  productQuantities = {}, packagedTotals = {}, onItemsChanged,
}: Props) {
  const qc = useQueryClient();
  const { data: types } = usePackagingTypes();
  const { data: allProducts } = useProducts();

  const docProducts = allowedProductIds && allowedProductIds.length > 0
    ? (allProducts || []).filter((p: any) => allowedProductIds.includes(p.id))
    : (allProducts || []);

  // إخفاء المنتجات المستنفدة من قائمة الاختيار
  const products = docProducts.filter((p: any) => {
    const total = productQuantities[p.id] ?? 0;
    const packaged = packagedTotals[p.id] ?? 0;
    if (total === 0) return true;
    return total - packaged > 0;
  });

  const { data: items = [] } = useQuery({
    queryKey: [itemsTable, parentId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from(itemsTable).select("*").eq(parentFkColumn, parentId).order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

  const [packagingTypeId, setPackagingTypeId] = useState("");
  const [productId, setProductId] = useState("");
  const [productName, setProductName] = useState("");
  const [packsCount, setPacksCount] = useState("");
  const [piecesPerPack, setPiecesPerPack] = useState("");
  const [price, setPrice] = useState("");
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  const reset = () => {
    setPackagingTypeId(""); setProductId(""); setProductName("");
    setPacksCount(""); setPiecesPerPack(""); setPrice("");
  };

  const packsNum = parseInt(packsCount) || 0;
  const piecesNum = parseInt(piecesPerPack) || 0;
  const totalQty = packsNum * piecesNum;
  const priceNum = parseFloat(price) || 0;
  const totalPrice = totalQty * priceNum;

  const add = async () => {
    if (totalQty <= 0) { toast.error("أدخل عدد العبوات والقطع"); return; }
    // تحقق من عدم تجاوز المتاح
    if (productId) {
      const total = productQuantities[productId] ?? 0;
      const packaged = packagedTotals[productId] ?? 0;
      const available = total - packaged;
      if (total > 0 && totalQty > available) {
        toast.error(`الكمية المتاحة لهذا المنتج: ${available} فقط`);
        return;
      }
    }
    const row: any = {
      [parentFkColumn]: parentId,
      packaging_type_id: packagingTypeId || null,
      product_id: productId || null,
      product_name: productName || (products || []).find((p: any) => p.id === productId)?.name || null,
      packs_count: packsNum,
      pieces_per_pack: piecesNum,
      quantity: totalQty,
      price: priceNum,
      total: totalPrice,
    };
    const { error } = await (supabase as any).from(itemsTable).insert(row);
    if (error) { toast.error(error.message); return; }
    toast.success("تم إضافة البند");
    reset();
    qc.invalidateQueries({ queryKey: [itemsTable, parentId] });
    onItemsChanged?.();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from(itemsTable).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: [itemsTable, parentId] });
    onItemsChanged?.();
  };

  // اختصار المسطرة: تحديد متعدد + ضغطتان للحذف (مثل جدول البنود)
  const { isPending: isSpacePending, handleRowKeyDown: handleSpaceDelete } = useSpaceToDelete(remove);

  // ---------- Inline edit + auto-save ----------
  const [drafts, setDrafts] = useState<Record<string, { packs: string; pieces: string; price: string }>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Sync drafts from server data when items change.
  useEffect(() => {
    setDrafts((prev) => {
      const next: typeof prev = {};
      (items as any[]).forEach((it) => {
        // Preserve in-flight edits the user is typing; otherwise hydrate from server.
        next[it.id] = prev[it.id] || {
          packs: it.packs_count != null ? String(it.packs_count) : "",
          pieces: it.pieces_per_pack != null ? String(it.pieces_per_pack) : "",
          price: it.price != null ? String(it.price) : "",
        };
      });
      return next;
    });
  }, [items]);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  const persistRow = async (id: string, draft?: { packs: string; pieces: string; price: string }) => {
    const d = draft || drafts[id];
    if (!d) return;
    const packs = parseInt(d.packs) || 0;
    const pieces = parseInt(d.pieces) || 0;
    const pr = parseFloat(d.price) || 0;
    const qty = packs * pieces;
    const total = qty * pr;
    const { error } = await (supabase as any)
      .from(itemsTable)
      .update({ packs_count: packs, pieces_per_pack: pieces, quantity: qty, price: pr, total })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: [itemsTable, parentId] });
    onItemsChanged?.();
  };

  const updateDraft = (id: string, field: "packs" | "pieces" | "price", val: string) => {
    setDrafts((prev) => {
      const nextRow = { ...(prev[id] || { packs: "", pieces: "", price: "" }), [field]: val };
      // Schedule save with the latest snapshot so we don't race React state updates.
      if (saveTimers.current[id]) clearTimeout(saveTimers.current[id]);
      saveTimers.current[id] = setTimeout(() => {
        persistRow(id, nextRow);
        delete saveTimers.current[id];
      }, 700);
      return { ...prev, [id]: nextRow };
    });
  };

  const flushSave = (id: string) => {
    if (saveTimers.current[id]) {
      clearTimeout(saveTimers.current[id]);
      delete saveTimers.current[id];
    }
    persistRow(id);
  };

  const totalSum = (items as any[]).reduce((s, i) => s + Number(i.total || 0), 0);

  return (
    <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid hsl(var(--border))" }}>
      <h5 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem", color: "hsl(var(--muted-foreground))" }}>
        بنود التغليف ({items.length}) {totalSum > 0 && <span> — إجمالي: {totalSum.toLocaleString()}</span>}
      </h5>

      {/* Add row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 90px 90px 90px 90px auto", gap: "0.4rem", alignItems: "end", marginBottom: "0.5rem" }}>
        <div>
          <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>نوع التغليف</label>
          <select className="legacy-control" value={packagingTypeId} onChange={(e) => setPackagingTypeId(e.target.value)}>
            <option value="">اختر...</option>
            {(types || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>المنتج</label>
          <Popover open={productPickerOpen} onOpenChange={setProductPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                role="combobox"
                aria-expanded={productPickerOpen}
                className="legacy-control"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, width: "100%", textAlign: "right" }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {productName || "(اختياري — اختر منتج)"}
                </span>
                <ChevronDown size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[320px]" align="start" dir="rtl">
              <Command
                filter={(value, search) => {
                  if (!search) return 1;
                  return startsWithMatch(value, search) ? 1 : 0;
                }}
              >
                <CommandInput placeholder="ابحث عن منتج..." autoFocus />
                <CommandList>
                  <CommandEmpty>لا توجد منتجات</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value=""
                      onSelect={() => {
                        setProductId("");
                        setProductName("");
                        setProductPickerOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", !productId ? "opacity-100" : "opacity-0")} />
                      (بدون منتج)
                    </CommandItem>
                    {(products || []).map((p: any) => (
                      <CommandItem
                        key={p.id}
                        value={`${p.name} ${p.code || ""}`}
                        onSelect={() => {
                          setProductId(p.id);
                          setProductName(p.name);
                          if (p.sale_price != null) setPrice(String(p.sale_price));
                          setProductPickerOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", productId === p.id ? "opacity-100" : "opacity-0")} />
                        <span>{p.name}</span>
                        {p.code && <span style={{ marginRight: 6, opacity: 0.6, fontSize: 11 }}>({p.code})</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>عبوات</label>
          <input
            type="number"
            className="legacy-control"
            value={packsCount}
            placeholder=""
            onChange={(e) => setPacksCount(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.currentTarget.closest("div")?.nextElementSibling?.querySelector("input") as HTMLInputElement | null)?.focus(); } }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>قطع/عبوة</label>
          <input
            type="number"
            className="legacy-control"
            value={piecesPerPack}
            placeholder=""
            onChange={(e) => setPiecesPerPack(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const wrap = e.currentTarget.closest("div")?.nextElementSibling?.nextElementSibling; (wrap?.querySelector("input") as HTMLInputElement | null)?.focus(); } }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>إجمالي القطع</label>
          <div className="legacy-control" style={{ background: "hsl(var(--muted) / 0.4)", textAlign: "center", fontWeight: 600 }}>
            {totalQty || ""}
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>السعر/قطعة</label>
          <input
            type="number"
            className="legacy-control"
            value={price}
            step="0.01"
            placeholder=""
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          />
        </div>
        <div>
          <button onClick={add} className="legacy-btn legacy-btn-primary btn-sm">
            <Plus /> إضافة
          </button>
        </div>
      </div>

      {totalQty > 0 && (
        <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: "0.5rem" }}>
          الإجمالي المتوقع: <span style={{ fontWeight: 600, color: "hsl(var(--foreground))" }}>{totalPrice.toLocaleString()}</span>
        </div>
      )}

      {items.length > 0 && (
        <table className="legacy-table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>نوع التغليف</th>
              <th>المنتج</th>
              <th className="text-center" title="مغلّف من إجمالي الفاتورة">مغلّف / إجمالي</th>
              <th className="text-center" style={{ width: 170 }}>العبوات × القطع</th>
              <th className="text-center">الإجمالي بالقطع</th>
              <th className="text-center" style={{ width: 110 }}>السعر</th>
              <th className="text-center">الإجمالي</th>
              <th className="text-center" style={{ width: 60 }}>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {(items as any[]).map((it, idx) => {
              const d = drafts[it.id] || {
                packs: it.packs_count != null ? String(it.packs_count) : "",
                pieces: it.pieces_per_pack != null ? String(it.pieces_per_pack) : "",
                price: it.price != null ? String(it.price) : "",
              };
              const packs = parseInt(d.packs) || 0;
              const pieces = parseInt(d.pieces) || 0;
              const qty = packs * pieces;
              const pr = parseFloat(d.price) || 0;
              const total = qty * pr;
              return (
                <tr
                  key={it.id}
                  className={idx % 2 === 0 ? "odd" : "even"}
                  style={isSpacePending(it.id) ? { background: "hsl(var(--destructive) / 0.15)", outline: "2px solid hsl(var(--destructive) / 0.5)" } : undefined}
                >
                  <td>{(types || []).find((t: any) => t.id === it.packaging_type_id)?.name || "—"}</td>
                  <td>{it.product_name || "—"}</td>
                  <td className="text-center" style={{ fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>
                    {it.product_id
                      ? `${packagedTotals[it.product_id] ?? 0} / ${productQuantities[it.product_id] ?? 0}`
                      : "—"}
                  </td>
                  <td className="text-center">
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="number"
                        className="legacy-control"
                        value={d.packs}
                        placeholder=""
                        onChange={(e) => updateDraft(it.id, "packs", e.target.value)}
                        onBlur={() => flushSave(it.id)}
                        onKeyDown={(e) => handleSpaceDelete(it.id, e)}
                        style={{ width: 60, textAlign: "center" }}
                      />
                      <span>×</span>
                      <input
                        type="number"
                        className="legacy-control"
                        value={d.pieces}
                        placeholder=""
                        onChange={(e) => updateDraft(it.id, "pieces", e.target.value)}
                        onBlur={() => flushSave(it.id)}
                        onKeyDown={(e) => handleSpaceDelete(it.id, e)}
                        style={{ width: 60, textAlign: "center" }}
                      />
                    </div>
                  </td>
                  <td className="text-center" style={{ fontWeight: 600 }}>{qty || "—"}</td>
                  <td className="text-center">
                    <input
                      type="number"
                      className="legacy-control"
                      value={d.price}
                      step="0.01"
                      placeholder=""
                      onChange={(e) => updateDraft(it.id, "price", e.target.value)}
                      onBlur={() => flushSave(it.id)}
                      onKeyDown={(e) => handleSpaceDelete(it.id, e)}
                      style={{ width: 90, textAlign: "center" }}
                    />
                  </td>
                  <td className="text-center" style={{ fontWeight: 600 }}>{total.toLocaleString()}</td>
                  <td className="text-center">
                    <button onClick={() => remove(it.id)} className="legacy-btn legacy-btn-danger btn-sm" title="حذف">
                      <Trash2 />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
