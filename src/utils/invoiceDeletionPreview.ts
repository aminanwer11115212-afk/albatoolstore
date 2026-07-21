import { supabase } from "@/integrations/supabase/client";

/**
 * ما الذي سيحدث فعلياً عند حذف هذه الفاتورة؟
 * يُستدعى قبل إظهار حوار التأكيد ليعرض للمستخدم:
 *  - عدد ومبلغ الدفعات التي ستُحذف من الحركات
 *  - عدد ومبلغ الفائض (customer_credit موجب) الناتج عن هذه الفاتورة
 *  - عدد ومبلغ الاستهلاكات المرتبطة بهذا الفائض (سالبة) والتي ستُنظَّف
 *  - الأثر التقديري على رصيد العميل (balance / credit_balance)
 */
export type InvoiceDeletionPreview = {
  invoiceId: string;
  invoiceNumber: string | null;
  isPos: boolean;
  customerId: string | null;
  total: number;
  paidAmount: number;
  workflowStatus: string | null;
  status: string | null;
  fullyPaidAndDone: boolean;
  payments: { count: number; amount: number };
  surplusCredit: { count: number; amount: number };
  consumedCredit: { count: number; amount: number };
  itemsCount: number;
  stockWillRestore: boolean;
  currentCustomerBalance: number;
  currentCustomerCredit: number;
  projectedCustomerBalance: number;
  projectedCustomerCredit: number;
};

export async function previewInvoiceDeletion(invoiceId: string): Promise<InvoiceDeletionPreview> {
  const { data: inv, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, customer_id, total, paid_amount, status, source, workflow_status, stock_deducted_at, stock_deduction_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw error;
  if (!inv) throw new Error("الفاتورة غير موجودة");

  const total = Number((inv as any).total || 0);
  const paid = Number((inv as any).paid_amount || 0);
  const st = String((inv as any).status || "").toLowerCase();
  const wf = String((inv as any).workflow_status || "").toLowerCase();
  const fullyPaid = st === "paid" || (total > 0 && paid >= total - 0.01);
  const fullyPaidAndDone = fullyPaid && wf === "done";
  const isPos = (inv as any).source === "pos";
  const custId: string | null = (inv as any).customer_id || null;

  // Payments linked to this invoice
  let payCount = 0, payAmount = 0;
  let surCount = 0, surAmount = 0;
  let consCount = 0, consAmount = 0;

  if (custId && !isPos) {
    const [pays, surplus] = await Promise.all([
      (supabase as any).from("transactions")
        .select("id, amount")
        .eq("reference_id", invoiceId)
        .eq("category", "customer_payment")
        .eq("customer_id", custId),
      (supabase as any).from("transactions")
        .select("id, amount")
        .eq("reference_id", invoiceId)
        .eq("category", "customer_credit")
        .eq("customer_id", custId)
        .gt("amount", 0),
    ]);
    for (const r of (pays.data || [])) { payCount++; payAmount += Number(r.amount || 0); }
    const surplusIds: string[] = [];
    for (const r of (surplus.data || [])) {
      surCount++;
      surAmount += Number(r.amount || 0);
      surplusIds.push(r.id);
    }
    if (surplusIds.length) {
      // consumptions referring to these surplus rows via allocation.consumed_from
      const { data: consumed } = await (supabase as any)
        .from("transactions")
        .select("id, amount, allocation")
        .eq("category", "customer_credit")
        .eq("customer_id", custId)
        .lt("amount", 0);
      for (const c of (consumed || [])) {
        const from = c?.allocation?.consumed_from;
        if (from && surplusIds.includes(String(from))) {
          consCount++;
          consAmount += Math.abs(Number(c.amount || 0));
        }
      }
    }
  }

  // Items + stock restore prediction
  const { count: itemsCount } = await (supabase as any)
    .from("invoice_items")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId);
  const stockWillRestore =
    (!!(inv as any).stock_deducted_at || !!(inv as any).stock_deduction_id ||
     (wf && wf !== "new")) && Number(itemsCount || 0) > 0;

  // Current customer balances
  let currentBal = 0, currentCred = 0;
  if (custId) {
    const { data: cust } = await (supabase as any)
      .from("customers")
      .select("balance, credit_balance")
      .eq("id", custId)
      .maybeSingle();
    currentBal = Number(cust?.balance || 0);
    currentCred = Number(cust?.credit_balance || 0);
  }

  // Projection:
  //  - customers.balance = Σ(remaining على فواتير غير ملغاة/غير POS)
  //    حذف هذه الفاتورة يزيل remaining هذه الفاتورة → balance يقل بـ (total - paid)
  //  - customers.credit_balance = Σ(customer_credit)
  //    نحذف الفائض الموجب ونحذف الاستهلاك السالب → صافي التغيير = -(surAmount) + consAmount
  const remainingOfThis = Math.max(total - paid, 0);
  const projBal = Math.max(currentBal - remainingOfThis, 0);
  const netCreditRemoved = surAmount - consAmount; // ما سيختفي فعلياً من credit_balance
  const projCred = Math.max(currentCred - netCreditRemoved, 0);

  return {
    invoiceId,
    invoiceNumber: (inv as any).invoice_number || null,
    isPos,
    customerId: custId,
    total,
    paidAmount: paid,
    workflowStatus: (inv as any).workflow_status || null,
    status: (inv as any).status || null,
    fullyPaidAndDone,
    payments: { count: payCount, amount: payAmount },
    surplusCredit: { count: surCount, amount: surAmount },
    consumedCredit: { count: consCount, amount: consAmount },
    itemsCount: Number(itemsCount || 0),
    stockWillRestore,
    currentCustomerBalance: currentBal,
    currentCustomerCredit: currentCred,
    projectedCustomerBalance: projBal,
    projectedCustomerCredit: projCred,
  };
}
