/**
 * المتبقّي على فاتورة — **محسوباً لا مقروءاً**.
 *
 * ## لماذا لا يُقرأ عمود `due_amount`
 * العمود يُكتب يدوياً من كل مسار على حدة، وأيّ مسار يُنسى يتركه منحرفاً.
 * و`settle_invoices_from_credit` تنساه فعلاً: تُحدّث `paid_amount` و`status`
 * ولا تمسّه — فتبقى فاتورةٌ خالصة حاملةً ديناً وهمياً بمقدار ما سُدِّد من
 * الرصيد بالضبط. ست فواتير في الإنتاج بمجموع 1,121,600 على هذا الحال.
 *
 * والانحراف لا يقف عند الشاشة: كان يُرسَل إلى العميل في رسالة واتساب
 * («المتبقي») ويدخل في مجاميع صفحة الإحصائيات.
 *
 * فالمصدر الواحد هنا حسابٌ لا قراءة. `total − paid_amount` صحيحٌ دائماً مهما
 * فعلت القاعدة، ولا يحتاج هجرةً ولا صلاحية على اللوحة.
 *
 * القصّ عند الصفر مقصود: الفائض ليس ديناً سالباً على الفاتورة، مكانه رصيد
 * العميل — وهذا ما يعرضه كشف الحساب.
 */
export function invoiceDue(
  invoice: { total?: number | null; paid_amount?: number | null } | null | undefined,
): number {
  if (!invoice) return 0;
  const total = Number(invoice.total || 0);
  const paid = Number(invoice.paid_amount || 0);
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

/** مجموع المتبقّي على مجموعة فواتير — بنفس الحساب لا بالعمود المخزَّن. */
export function totalInvoiceDue(
  invoices: Array<{ total?: number | null; paid_amount?: number | null }> | null | undefined,
): number {
  if (!invoices?.length) return 0;
  return Math.round(invoices.reduce((s, i) => s + invoiceDue(i), 0) * 100) / 100;
}
