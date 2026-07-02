import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
export default function DeletedItemsPage() {
  const [tab, setTab] = useState<"invoices" | "quotes">("invoices");
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [quoteItems, setQuoteItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const [a, b] = await Promise.all([
      (supabase as any).from("deleted_invoice_items").select("*").order("deleted_at", { ascending: false }).limit(500),
      (supabase as any).from("deleted_quote_items").select("*").order("deleted_at", { ascending: false }).limit(500),
    ]);
    setInvoiceItems(a.data || []);
    setQuoteItems(b.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const restore = async (item: any, kind: "invoice" | "quote") => {
    if (!confirm(`استعادة "${item.product_name}"؟`)) return;
    try {
      if (kind === "invoice") {
        const { error } = await (supabase as any).from("invoice_items").insert({
          invoice_id: item.invoice_id, product_id: item.product_id, product_name: item.product_name,
          quantity: item.quantity, unit_price: item.unit_price, discount: item.discount, discount_value: item.discount_value,
          format_discount: item.format_discount, foreign_price: item.foreign_price, unit: item.unit,
          tax_status: item.tax_status, total: item.total,
        });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("quote_items").insert({
          quote_id: item.quote_id, product_id: item.product_id, product_name: item.product_name,
          quantity: item.quantity, unit_price: item.unit_price, discount: item.discount, discount_value: item.discount_value,
          format_discount: item.format_discount, foreign_price: item.foreign_price, unit: item.unit,
          tax_status: item.tax_status, total: item.total,
        });
        if (error) throw error;
      }
      toast.success("تمت الاستعادة");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const list = tab === "invoices" ? invoiceItems : quoteItems;

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>سجل المنتجات المحذوفة</h5>
        <hr />
        <div style={{ marginBottom: "1rem" }}>
          <button onClick={() => setTab("invoices")} className={`legacy-btn ${tab === "invoices" ? "legacy-btn-primary" : "legacy-btn-default"}`}>من الفواتير ({invoiceItems.length})</button>{" "}
          <button onClick={() => setTab("quotes")} className={`legacy-btn ${tab === "quotes" ? "legacy-btn-primary" : "legacy-btn-default"}`}>من عروض الأسعار ({quoteItems.length})</button>
        </div>

        <table className="legacy-table">
          <thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th>حُذف بواسطة</th><th>تاريخ الحذف</th><th>إعدادات</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ textAlign: "center" }}>جاري التحميل...</td></tr>
            : list.length === 0 ? <tr><td colSpan={7} style={{ textAlign: "center" }}>لا توجد بنود محذوفة</td></tr>
            : list.map((it: any, i: number) => (
              <tr key={it.id} className={i % 2 === 0 ? "odd" : "even"}>
                <td>{it.product_name}</td>
                <td>{it.quantity} {it.unit || ""}</td>
                <td>{Number(it.unit_price || 0).toLocaleString()}</td>
                <td>{Number(it.total || 0).toLocaleString()}</td>
                <td style={{ fontSize: 11 }}>{it.deleted_by || "—"}</td>
                <td style={{ fontSize: 11 }}>{new Date(it.deleted_at).toLocaleString("ar-EG")}</td>
                <td><button onClick={() => restore(it, tab === "invoices" ? "invoice" : "quote")} className="btn-xs btn-success">استعادة</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
