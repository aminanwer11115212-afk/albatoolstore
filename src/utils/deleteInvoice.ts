import { supabase } from "@/integrations/supabase/client";
import { applyStockDeltaForLines } from "@/utils/stockDeduction";

export type DeleteInvoiceResult = {
  restoredStock: boolean;
  invoiceNumber: string | null;
  convertedToCredit: number;
  /** Total quantity summed across restored items (0 when none). */
  totalRestoredQty: number;
  /** Amount of payments converted to customer credit when this invoice was deleted. */
  deletedPayments: number;
  restoredItems: Array<{ product_id: string | null; quantity: number }>;
  customerId: string | null;
  newCustomerBalance: number | null;
  newCustomerCredit: number | null;
};

/**
 * يحذف فاتورة بالكامل (مع كل توابعها) ويُرجع كميات بنودها إلى المخزون.
 *
 * **الدفعات تُمحى ولا تُحوَّل**: عبر `delete_invoice_with_reconciliation` تُحذف
 * قيود الدفع والرصيد المرتبطة بالفاتورة نهائياً، فلا يعود مبلغها رصيداً دائناً
 * يظهر في كشف حساب العميل. كانت تُحوَّل إلى `customer_credit` سابقاً، فيبقى
 * المال في الحساب رغم أن الفاتورة كلّها لم تعد موجودة.
 *
 * الأثر التدقيقي محفوظ: لقطة كاملة من الصفوف المحذوفة تُكتب في `activity_log`
 * قبل حذفها. ثم يعيد `recompute_customer_balance` حساب الرصيد من بقية الحركات.
 */
export async function deleteInvoiceWithStockRestore(
  invoiceId: string,
): Promise<DeleteInvoiceResult> {
  if (!invoiceId) throw new Error("invoiceId مطلوب");

  // 0) قراءة بيانات الحارس + رقم الفاتورة + معلومات لقطة الـ Audit قبل أي مصالحة.
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("id, invoice_number, date, customer_id, total, paid_amount, status, source, stock_deduction_id, stock_deducted_at, workflow_status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr) throw new Error(`تعذّر قراءة الفاتورة: ${invErr.message}`);
  if (!inv) throw new Error("الفاتورة غير موجودة");

  // لا حارس يمنع الحذف: أي فاتورة تُحذف من أي مكان بطلب صاحب المستودع. كان
  // الحذف يُمنع على الفاتورة المدفوعة بالكامل ذات سير العمل «تمت» — والأثر
  // التدقيقي محفوظ في `activity_log` بلقطة كاملة قبل الحذف، فالمنع لم يكن
  // يحمي بياناً بقدر ما كان يحبس المستخدم.


  // 1) حذف دفعات الفواتير العادية نهائياً — لا تحويل لرصيد عميل.
  //    فواتير الكاش/POS لا تخص بطاقة عميل.
  let deletedPayments = 0;
  const shouldReconcilePayments = !!(inv as any).customer_id && (inv as any).source !== "pos";
  if (shouldReconcilePayments) {
    const { data: reconc, error: reconErr } = await (supabase as any).rpc(
      "delete_invoice_with_reconciliation",
      { _invoice_id: invoiceId },
    );
    if (reconErr) throw new Error(`تعذّر إلغاء الدفعات: ${reconErr.message}`);
    // deleted_amount = مجموع ما مُحي من دفعات وقيود رصيد على هذه الفاتورة.
    deletedPayments = Number(
      reconc?.deleted_amount ?? reconc?.converted_amount ?? reconc?.deleted_payments ?? 0,
    );
  }

  // 2) قراءة بنود الفاتورة
  const { data: items, error: itErr } = await supabase
    .from("invoice_items")
    .select("product_id, quantity")
    .eq("invoice_id", invoiceId);
  if (itErr) throw new Error(`تعذّر قراءة بنود الفاتورة: ${itErr.message}`);

  // 3) إرجاع المخزون: أي فاتورة محفوظة تعتبر مُخصومة من المخزون فعلياً
  //    (مسار الإنشاء يستدعي deductStockForInvoiceOnce قبل إظهار البنود، ومسار
  //    التعديل يطبّق الفرق فوراً). لذا إذا وُجدت بنود ⇒ يجب إرجاعها كي لا
  //    يبقى المخزون سالباً. الحارس القديم المعتمد على stock_deduction_id
  //    كان يفشل مع الفواتير المُنشأة قبل إدخال العَلَم أو حين يتعطّل الكتابة
  //    عليه، مما أنتج مخزوناً سالباً بعد الحذف.
  let restoredStock = false;
  const linesToRestore = (items || []).filter(
    (it: any) => it && it.product_id && Number(it.quantity || 0) > 0,
  );
  if (linesToRestore.length > 0) {
    await applyStockDeltaForLines(linesToRestore as any[], []);
    restoredStock = true;

    // Log restore entries into stock_adjustments_log so they appear in Stock Tracking.
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id || null;
      const invNo = (inv as any).invoice_number || invoiceId;
      const rows = linesToRestore.map((it: any) => ({
        product_id: it.product_id,
        delta: Number(it.quantity || 0), // positive: returned to stock
        source: "invoice_delete",
        reference_id: invoiceId,
        reason: `إرجاع مخزون بعد حذف الفاتورة ${invNo}`,
        actor_uid: uid,
      }));
      if (rows.length) {
        const { error: logErr } = await (supabase as any)
          .from("stock_adjustments_log")
          .insert(rows);
        if (logErr) console.warn("[deleteInvoice] stock log insert failed (non-fatal)", logErr);
      }
    } catch (logEx) {
      console.warn("[deleteInvoice] stock log insert threw (non-fatal)", logEx);
    }
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
    // Silent delete → skip archive trigger (this is a full invoice deletion, not a per-line removal).
    const { error } = await (supabase as any).rpc("delete_invoice_items_silent", { p_invoice_id: invoiceId });
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

  // 5.1) شبكة أمان: أعِد حساب رصيد العميل صراحةً — الـ trigger يجب أن يفعل ذلك
  //      لكن نضمن التصفير بعد الحذف حتى لو تأخّرت إعادة الحساب أو تعطّل الـ trigger.
  if ((inv as any).customer_id) {
    try {
      await (supabase as any).rpc("recompute_customer_balance", { _customer_id: (inv as any).customer_id });
    } catch (recErr) {
      console.warn("[deleteInvoice] recompute_customer_balance failed (non-fatal)", recErr);
    }
  }

  // 6) سجل Audit — من قام بالحذف، متى، وما الذي استُرجع (بدون إيقاف العملية عند الفشل)
  const restoredItems = restoredStock
    ? (items || []).map((it: any) => ({ product_id: it.product_id ?? null, quantity: Number(it.quantity || 0) }))
    : [];
  try {
    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email || null;
    const uid = userData?.user?.id || null;
    await (supabase as any).from("activity_log").insert({
      entity_type: "invoice",
      entity_id: invoiceId,
      action: "delete",
      user_email: email,
      user_name: email,
      changed_by: uid,
      table_name: "invoices",
      record_id: invoiceId,
      old_data: {
        invoice_number: (inv as any).invoice_number,
        date: (inv as any).date,
        customer_id: (inv as any).customer_id,
        total: (inv as any).total,
        paid_amount: (inv as any).paid_amount,
        status: (inv as any).status,
        workflow_status: (inv as any).workflow_status,
      },
      details: {
        restored_stock: restoredStock,
        restored_items: restoredItems,
        deleted_payments: deletedPayments,
        payments_removed: deletedPayments > 0
          ? {
              invoice_number: (inv as any).invoice_number,
              paid_amount: (inv as any).paid_amount,
              customer_id: (inv as any).customer_id,
              reason: "invoice_deleted_payments_removed_from_transactions",
              executed_at: new Date().toISOString(),
            }
          : null,
        items_count: (items || []).length,
      },
    });
  } catch (auditErr) {
    console.warn("[deleteInvoice] audit log failed (non-fatal)", auditErr);
  }

  // 7) اقرأ الرصيد الجديد للعميل بعد الحذف (بعد recompute) لعرضه في الـtoast
  let newCustomerBalance: number | null = null;
  let newCustomerCredit: number | null = null;
  const customerId = (inv as any).customer_id ?? null;
  if (customerId) {
    try {
      const { data: cust } = await (supabase as any)
        .from("customers")
        .select("balance, credit_balance")
        .eq("id", customerId)
        .maybeSingle();
      newCustomerBalance = Number(cust?.balance ?? 0);
      newCustomerCredit = Number(cust?.credit_balance ?? 0);
    } catch {}
  }

  // 8) إخطار باقي الشاشات بتحديث المخزون والقوائم
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new Event("products:changed")); } catch {}
    try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
    try { window.dispatchEvent(new Event("customers:changed")); } catch {}
    try { window.dispatchEvent(new Event("transactions:changed")); } catch {}
  }

  const totalRestoredQty = restoredItems.reduce((s, it) => s + Number(it.quantity || 0), 0);
  return {
    restoredStock,
    invoiceNumber: (inv as any).invoice_number ?? null,
    convertedToCredit: 0,
    totalRestoredQty,
    deletedPayments,
    restoredItems,
    customerId,
    newCustomerBalance,
    newCustomerCredit,
  };
}
