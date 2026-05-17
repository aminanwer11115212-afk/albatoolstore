import { supabase } from "@/integrations/supabase/client";
import { applyStockDeltaForLines } from "@/utils/stockDeduction";

export type DeleteInvoiceResult = {
  restoredStock: boolean;
  invoiceNumber: string | null;
};

/**
 * يحذف فاتورة بالكامل (مع كل توابعها) ويُرجع كميات بنودها إلى المخزون
 * فقط إذا كانت الفاتورة قد خُصمت سابقاً (stock_deduction_id موجود).
 *
 * إن فشل إرجاع المخزون → يُلقي خطأ ولا يحذف الفاتورة.
 */
export async function deleteInvoiceWithStockRestore(
  invoiceId: string,
): Promise<DeleteInvoiceResult> {
  if (!invoiceId) throw new Error("invoiceId مطلوب");

  // 1) قراءة بيانات الحارس + رقم الفاتورة
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("id, invoice_number, stock_deduction_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr) throw new Error(`تعذّر قراءة الفاتورة: ${invErr.message}`);
  if (!inv) throw new Error("الفاتورة غير موجودة");

  // 2) قراءة بنود الفاتورة
  const { data: items, error: itErr } = await supabase
    .from("invoice_items")
    .select("product_id, quantity")
    .eq("invoice_id", invoiceId);
  if (itErr) throw new Error(`تعذّر قراءة بنود الفاتورة: ${itErr.message}`);

  // 3) إرجاع المخزون فقط إن كانت الفاتورة مُخصومة فعلاً
  let restoredStock = false;
  const wasDeducted = !!(inv as any).stock_deduction_id;
  if (wasDeducted && items && items.length > 0) {
    await applyStockDeltaForLines(items as any[], []);
    restoredStock = true;
  }

  // 4) حذف توابع الفاتورة بالترتيب الآمن
  // أ) عناصر التغليف ثم رؤوس التغليف
  const { data: pkgs } = await supabase
    .from("invoice_packaging")
    .select("id")
    .eq("invoice_id", invoiceId);
  const pkgIds = (pkgs || []).map((p: any) => p.id);
  if (pkgIds.length) {
    await supabase.from("invoices_packaging_items").delete().in("invoice_packaging_id", pkgIds);
  }

  // ب) عناصر النقل ثم رؤوس النقل
  const { data: trs } = await supabase
    .from("invoice_transports")
    .select("id")
    .eq("invoice_id", invoiceId);
  const trIds = (trs || []).map((t: any) => t.id);
  if (trIds.length) {
    await supabase.from("invoices_transports_items").delete().in("invoice_transport_id", trIds);
  }

  // ج) باقي التوابع
  await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
  await supabase.from("invoice_packaging").delete().eq("invoice_id", invoiceId);
  await supabase.from("invoice_transports").delete().eq("invoice_id", invoiceId);
  await supabase.from("invoice_attachments").delete().eq("invoice_id", invoiceId);

  // 5) حذف الفاتورة نفسها
  const { error: delErr } = await supabase.from("invoices").delete().eq("id", invoiceId);
  if (delErr) throw new Error(`فشل حذف الفاتورة: ${delErr.message}`);

  // 6) إخطار باقي الشاشات بتحديث المخزون والقوائم
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new Event("products:changed")); } catch {}
    try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
  }

  return { restoredStock, invoiceNumber: (inv as any).invoice_number ?? null };
}
