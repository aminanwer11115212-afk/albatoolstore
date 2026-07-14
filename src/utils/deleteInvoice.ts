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

  // 1) قراءة بيانات الحارس + رقم الفاتورة + حالة سير العمل
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("id, invoice_number, stock_deduction_id, stock_deducted_at, workflow_status")
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

  // 3) إرجاع المخزون إن كانت الفاتورة قد خُصمت — إما عبر الحارس الحديث
  //    (stock_deduction_id / stock_deducted_at) أو ضمنياً لأن سير العمل
  //    تجاوز حالة "جديد" (الفواتير القديمة قبل إدخال الحارس).
  let restoredStock = false;
  const wasDeducted =
    !!(inv as any).stock_deduction_id ||
    !!(inv as any).stock_deducted_at ||
    ((inv as any).workflow_status && (inv as any).workflow_status !== "new");
  if (wasDeducted && items && items.length > 0) {
    await applyStockDeltaForLines(items as any[], []);
    restoredStock = true;
  }

  // 4) حذف توابع الفاتورة بالترتيب الآمن — فحص كل خطوة لمنع البيانات اليتيمة الصامتة.
  const { data: pkgs, error: pkgQErr } = await supabase
    .from("invoice_packaging")
    .select("id")
    .eq("invoice_id", invoiceId);
  if (pkgQErr) throw new Error(`تعذّر قراءة سجلات التغليف: ${pkgQErr.message}`);
  const pkgIds = (pkgs || []).map((p: any) => p.id);
  if (pkgIds.length) {
    const { error } = await supabase.from("invoices_packaging_items").delete().in("invoice_packaging_id", pkgIds);
    if (error) throw new Error(`تعذّر حذف بنود التغليف: ${error.message}`);
  }

  const { data: trs, error: trQErr } = await supabase
    .from("invoice_transports")
    .select("id")
    .eq("invoice_id", invoiceId);
  if (trQErr) throw new Error(`تعذّر قراءة سجلات الترحيل: ${trQErr.message}`);
  const trIds = (trs || []).map((t: any) => t.id);
  if (trIds.length) {
    const { error } = await supabase.from("invoices_transports_items").delete().in("invoice_transport_id", trIds);
    if (error) throw new Error(`تعذّر حذف بنود الترحيل: ${error.message}`);
  }

  {
    const { error } = await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
    if (error) throw new Error(`تعذّر حذف بنود الفاتورة: ${error.message}`);
  }
  {
    const { error } = await supabase.from("invoice_packaging").delete().eq("invoice_id", invoiceId);
    if (error) throw new Error(`تعذّر حذف رؤوس التغليف: ${error.message}`);
  }
  {
    const { error } = await supabase.from("invoice_transports").delete().eq("invoice_id", invoiceId);
    if (error) throw new Error(`تعذّر حذف رؤوس الترحيل: ${error.message}`);
  }
  {
    const { error } = await supabase.from("invoice_attachments").delete().eq("invoice_id", invoiceId);
    if (error) throw new Error(`تعذّر حذف مرفقات الفاتورة: ${error.message}`);
  }

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
