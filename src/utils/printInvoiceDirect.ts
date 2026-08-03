import { supabase } from "@/integrations/supabase/client";
import { invoiceDue } from "@/utils/invoiceDue";
import { generatePrintHTML } from "@/utils/printTemplate";
import { loadInvoiceExtras } from "@/utils/printExtras";
import { documentHiddenSections } from "@/utils/printSectionPrefs";
import { netBalanceOf } from "@/utils/balanceDisplay";
import { netBeforeInvoice } from "@/utils/customerNetBefore";

/**
 * يبني HTML الطباعة لفاتورة محفوظة (بنفس منطق صفحة المعاينة) دون فتح صفحة
 * المعاينة — يُستخدم للطباعة المباشرة من صفحة تعديل الفاتورة (F10).
 */
export async function buildInvoicePrintHtml(invoiceId: string): Promise<string> {
  const sortItems = (items: any[]) => items;

  const { data: companyArr } = await (supabase as any)
    .from("company_settings").select("*").limit(1);
  const company = Array.isArray(companyArr) ? companyArr[0] : null;

  const { data: invoice, error: iErr } = await supabase
    .from("invoices")
    .select("*, customers(name, phone, address, email, balance, credit_balance)")
    .eq("id", invoiceId).maybeSingle();
  if (iErr) throw iErr;
  if (!invoice) throw new Error("الفاتورة غير موجودة");

  const { data: items } = await supabase
    .from("invoice_items").select("*").eq("invoice_id", invoiceId);
  const printItems = (items || []).map((it: any) => ({
    product_name: it.product_name,
    quantity: it.quantity,
    unit_price: it.unit_price,
    tax_amount: Number(it.tax_rate || 0) * Number(it.unit_price) * Number(it.quantity) / 100,
    discount: it.discount || 0,
    total: it.total,
  }));
  const extras = await loadInvoiceExtras((invoice as any).id);
  const iCust: any = (invoice as any).customers;
  // «الحساب القديم» = صافي الحساب قبل إنشاء هذه الفاتورة، محسوباً تاريخياً.
  // كان يُشتقّ سابقاً بطرح هذه الفاتورة من الرصيد الحالي، فيُدخل في «القديم»
  // فواتيرَ أُنشئت بعدها ويشوّه الصافي بالقصّ عند الصفر. القراءة هنا تحتاج
  // فواتير العميل وحركاته، فإن تعذّرت نعود للاشتقاق القديم بدل ألّا نعرض شيئاً.
  const customerId = (invoice as any).customer_id;
  let prevNet: number | null = null;
  if (customerId) {
    const [{ data: custInvoices }, { data: custTxs }] = await Promise.all([
      (supabase as any)
        .from("invoices")
        .select("id, total, paid_amount, status, date, created_at")
        .eq("customer_id", customerId),
      (supabase as any)
        .from("transactions")
        .select("id, category, amount, method, reference_id, date, created_at")
        .eq("customer_id", customerId)
        .in("category", ["customer_payment", "customer_credit"]),
    ]);
    prevNet = netBeforeInvoice(invoiceId, {
      invoices: custInvoices || [],
      transactions: custTxs || [],
    });
  }
  if (prevNet == null) {
    const invRemaining = Math.max(Number((invoice as any).total || 0) - Number((invoice as any).paid_amount || 0), 0);
    const invSurplus   = Math.max(Number((invoice as any).paid_amount || 0) - Number((invoice as any).total || 0), 0);
    prevNet = Math.max(Number(iCust?.balance || 0) - invRemaining, 0)
            - Math.max(Number(iCust?.credit_balance || 0) - invSurplus, 0);
  }
  // القالب يستقبل الرقمين منفصلين: موجب «عليه» في الأول وسالب «له» في الثاني.
  const prevDebt   = prevNet > 0 ? prevNet : 0;
  const prevCredit = prevNet < 0 ? -prevNet : 0;

  return generatePrintHTML({
    type: "invoice",
    isCash: (invoice as any).type === "cash",
    number: (invoice as any).invoice_number,
    date: (invoice as any).date,
    dueDate: (invoice as any).due_date,
    customer: iCust
      ? { name: iCust.name, phone: iCust.phone, address: iCust.address, email: iCust.email }
      : (invoice as any).walk_in_customer_name
        ? { name: (invoice as any).walk_in_customer_name }
        : null,
    items: sortItems(printItems),
    subtotal: Number((invoice as any).subtotal || 0),
    taxTotal: Number((invoice as any).tax_amount || 0),
    discountTotal: Number((invoice as any).discount || 0),
    shipping: Number((invoice as any).shipping || 0),
    grandTotal: Number((invoice as any).total || 0),
    paidAmount: Number((invoice as any).paid_amount || 0),
    dueAmount: invoiceDue(invoice as any),
    notes: (invoice as any).notes,
    company: company as any,
    status: (invoice as any).status,
    paymentMethod: (invoice as any).payment_method,
    oldBalance: netBalanceOf(iCust),
    previousDebt: prevDebt,
    previousCredit: prevCredit,
    // الرصيد الفعلي الآن — منه يُشتقّ «المدفوع» في ملخّص الحساب بدل قراءة
    // توزيع الدفعة على الفواتير. يُمرَّر للعملاء المسجّلين وحدهم؛ فاتورة
    // الكاش بلا عميل لا حساب لها فيبقى الاشتقاق من `paid_amount`.
    currentNet: customerId && iCust ? netBalanceOf(iCust) : null,
    // نفس رؤية الأقسام المختارة في شاشة الفاتورة — الطباعة المباشرة لا تمرّ
    // بشريط المعاينة، فلولا هذا لخرج التوقيع المخفيّ في الورقة المطبوعة.
    hiddenSections: documentHiddenSections("invoice"),
    hidePaidBox: false,
    ...extras,
  } as any);
}

/**
 * يطبع فاتورة محفوظة مباشرةً عبر iframe مخفي — بلا نافذة منبثقة وبلا الانتقال
 * لصفحة المعاينة. يحلّ محلّ الرجوع لصفحة المعاينة عند الطباعة السريعة.
 */
export async function printInvoiceDirect(invoiceId: string): Promise<void> {
  const html = await buildInvoicePrintHtml(invoiceId);

  // أزل أي iframe طباعة سابق
  const prev = document.getElementById("__lov_direct_print_iframe");
  if (prev) prev.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "__lov_direct_print_iframe";
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed", right: "0", bottom: "0",
    width: "0", height: "0", border: "0", visibility: "hidden",
  } as CSSStyleDeclaration);
  iframe.srcdoc = html;

  iframe.onload = () => {
    const w = iframe.contentWindow;
    if (!w) return;
    setTimeout(() => {
      try { w.focus(); w.print(); } catch { /* noop */ }
      // نظّف بعد إغلاق مربّع الطباعة
      const cleanup = () => setTimeout(() => { try { iframe.remove(); } catch { /* noop */ } }, 1000);
      try { w.onafterprint = cleanup; } catch { /* noop */ }
      cleanup();
    }, 300);
  };

  document.body.appendChild(iframe);
}
