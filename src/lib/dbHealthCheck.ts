import { supabase } from "@/integrations/supabase/client";

/**
 * فحوص تشخيصية للقاعدة — قراءة فقط، لا تعديل.
 * تُستخدم في صفحة Diagnostics المستقبلية أو يدوياً من DevTools.
 */

export type OverpaidInvoice = {
  id: string;
  invoice_number: string;
  total: number;
  paid_amount: number;
  due_amount: number;
};

/** فواتير دُفع فيها أكثر من المجموع. */
export async function findOverpaidInvoices(): Promise<OverpaidInvoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id,invoice_number,total,paid_amount,due_amount")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).filter((i: any) => Number(i.paid_amount || 0) > Number(i.total || 0) + 0.01);
}

/** فواتير لها total > 0 لكن لا تحتوي أي بند (بنود محذوفة). */
export async function findInvoicesWithoutItems(): Promise<Array<{ id: string; invoice_number: string; total: number }>> {
  const [{ data: invoices, error: e1 }, { data: items, error: e2 }] = await Promise.all([
    supabase.from("invoices").select("id,invoice_number,total"),
    supabase.from("invoice_items").select("invoice_id"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const withItems = new Set((items || []).map((x: any) => x.invoice_id));
  return (invoices || [])
    .filter((i: any) => Number(i.total || 0) > 0 && !withItems.has(i.id))
    .map((i: any) => ({ id: i.id, invoice_number: i.invoice_number, total: Number(i.total) }));
}

/** أرقام مكرّرة عبر الفواتير/عروض السعر/أوامر الشراء. */
export async function findDuplicateNumbers(): Promise<{
  invoices: string[];
  quotes: string[];
  purchase_orders: string[];
}> {
  const [{ data: inv }, { data: qt }, { data: po }] = await Promise.all([
    supabase.from("invoices").select("invoice_number"),
    supabase.from("quotes").select("quote_number"),
    supabase.from("purchase_orders").select("order_number"),
  ]);
  const dup = (arr: any[] | null, key: string) => {
    const counts = new Map<string, number>();
    (arr || []).forEach((r) => counts.set(r[key], (counts.get(r[key]) || 0) + 1));
    return [...counts.entries()].filter(([, c]) => c > 1).map(([k]) => k);
  };
  return {
    invoices: dup(inv, "invoice_number"),
    quotes: dup(qt, "quote_number"),
    purchase_orders: dup(po, "order_number"),
  };
}

/** عناصر يتيمة (parent محذوف). */
export async function findOrphanItems(): Promise<{
  invoice_items: number;
  quote_items: number;
  purchase_order_items: number;
}> {
  const [{ data: invIds }, { data: qIds }, { data: poIds }, { data: ii }, { data: qi }, { data: pi }] =
    await Promise.all([
      supabase.from("invoices").select("id"),
      supabase.from("quotes").select("id"),
      supabase.from("purchase_orders").select("id"),
      supabase.from("invoice_items").select("invoice_id"),
      supabase.from("quote_items").select("quote_id"),
      supabase.from("purchase_order_items").select("purchase_order_id"),
    ]);
  const inv = new Set((invIds || []).map((r: any) => r.id));
  const qt = new Set((qIds || []).map((r: any) => r.id));
  const po = new Set((poIds || []).map((r: any) => r.id));
  return {
    invoice_items: (ii || []).filter((r: any) => !inv.has(r.invoice_id)).length,
    quote_items: (qi || []).filter((r: any) => !qt.has(r.quote_id)).length,
    purchase_order_items: (pi || []).filter((r: any) => !po.has(r.purchase_order_id)).length,
  };
}

/** مشاكل تكامل التحويل من عرض السعر إلى الفاتورة. */
export type QuoteConversionIssue = {
  quote_id: string;
  quote_number: string;
  status: string | null;
  converted_to_invoice_id: string | null;
  issue:
    | "accepted_without_invoice" // status=accepted لكن لا يوجد converted_to_invoice_id
    | "accepted_invoice_missing" // converted_to_invoice_id موجود لكن الفاتورة محذوفة
    | "converted_but_not_accepted" // مرتبط بفاتورة لكن status ليس accepted
    | "duplicate_invoice_link"; // نفس الفاتورة مرتبطة بأكثر من عرض سعر
};

export async function findQuoteConversionIssues(): Promise<QuoteConversionIssue[]> {
  const [{ data: quotes, error: qe }, { data: invoices, error: ie }] = await Promise.all([
    supabase
      .from("quotes")
      .select("id,quote_number,status,converted_to_invoice_id"),
    supabase.from("invoices").select("id"),
  ]);
  if (qe) throw qe;
  if (ie) throw ie;

  const invIds = new Set((invoices || []).map((r: any) => r.id));
  const issues: QuoteConversionIssue[] = [];

  // counts per invoice id لاكتشاف التكرار
  const linkCounts = new Map<string, number>();
  (quotes || []).forEach((q: any) => {
    if (q.converted_to_invoice_id) {
      linkCounts.set(
        q.converted_to_invoice_id,
        (linkCounts.get(q.converted_to_invoice_id) || 0) + 1,
      );
    }
  });

  (quotes || []).forEach((q: any) => {
    const base = {
      quote_id: q.id,
      quote_number: q.quote_number,
      status: q.status,
      converted_to_invoice_id: q.converted_to_invoice_id,
    };
    if (q.status === "accepted" && !q.converted_to_invoice_id) {
      issues.push({ ...base, issue: "accepted_without_invoice" });
    }
    if (q.converted_to_invoice_id && !invIds.has(q.converted_to_invoice_id)) {
      issues.push({ ...base, issue: "accepted_invoice_missing" });
    }
    if (q.converted_to_invoice_id && q.status !== "accepted") {
      issues.push({ ...base, issue: "converted_but_not_accepted" });
    }
    if (
      q.converted_to_invoice_id &&
      (linkCounts.get(q.converted_to_invoice_id) || 0) > 1
    ) {
      issues.push({ ...base, issue: "duplicate_invoice_link" });
    }
  });

  return issues;
}

/** تشغيل كل الفحوص دفعة واحدة. */
export async function runAllChecks() {
  const [overpaid, noItems, dupes, orphans, conversion] = await Promise.all([
    findOverpaidInvoices(),
    findInvoicesWithoutItems(),
    findDuplicateNumbers(),
    findOrphanItems(),
    findQuoteConversionIssues(),
  ]);
  return {
    overpaid,
    noItems,
    dupes,
    orphans,
    conversion,
    ranAt: new Date().toISOString(),
  };
}
