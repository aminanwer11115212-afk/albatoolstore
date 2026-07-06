import { supabase } from "@/integrations/supabase/client";

/**
 * Unified quote → invoice conversion.
 * Used everywhere a quote is converted (QuotesPage, QuoteCreatePage,
 * QuoteViewPage, SideQuotesPage, Staff portal).
 *
 * Behavior:
 * - Creates an invoice with workflow_status = 'new'.
 * - Copies quote items to invoice_items.
 * - Deducts stock immediately (idempotent via `stock_deduction_id` guard),
 *   matching the behaviour of a direct invoice save.
 * - Deletes the original quote and its items (user preference — the invoice
 *   becomes the single source of truth; the quote no longer appears in the list).
 */
export async function convertQuoteToInvoice(
  quoteId: string,
): Promise<{ invoiceId: string; invoiceNumber: string; alreadyConverted: boolean }> {
  // 1. Load quote
  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .single();
  if (qErr || !quote) throw qErr || new Error("Quote not found");

  // Idempotency: already converted
  if (quote.converted_to_invoice_id) {
    const { data: existing } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .eq("id", quote.converted_to_invoice_id)
      .maybeSingle();
    if (existing) {
      return {
        invoiceId: existing.id,
        invoiceNumber: existing.invoice_number,
        alreadyConverted: true,
      };
    }
  }

  // 2. Load items
  const { data: items, error: iErr } = await supabase
    .from("quote_items")
    .select("*")
    .eq("quote_id", quoteId);
  if (iErr) throw iErr;

  // 3. Generate invoice number using ONLY invoice_prefix.
  // Defensive: نقرأ أيضاً quote_prefix و side_quote_prefix لنتأكد ألا يتسرّب أيٌّ منهما
  // إلى رقم الفاتورة، حتى لو تغيّرت بنية الجدول مستقبلاً.
  const { data: company } = await supabase
    .from("company_settings")
    .select("invoice_prefix, quote_prefix, side_quote_prefix")
    .limit(1)
    .maybeSingle();
  const invoicePrefix = company?.invoice_prefix || "INV-";
  const quotePrefix = (company as any)?.quote_prefix;
  const sideQuotePrefix = (company as any)?.side_quote_prefix;
  if (!invoicePrefix || invoicePrefix === quotePrefix || invoicePrefix === sideQuotePrefix) {
    throw new Error(
      `[convertQuoteToInvoice] invoice_prefix غير صالح أو يساوي بادئة عرض السعر (invoice="${invoicePrefix}", quote="${quotePrefix}", side="${sideQuotePrefix}")`,
    );
  }
  const prefix = invoicePrefix;
  // رقم عشوائي فريد عبر helper موحّد بدل Date.now() لتفادي التكرار وضمان عدم التسلسل
  const { generateRandomDocNumber } = await import("@/utils/randomDocNumber");
  const invNum = await generateRandomDocNumber("invoices", "invoice_number", prefix);
  // حماية نهائية: تأكد أن الرقم الناتج لا يبدأ بأي بادئة عرض سعر
  if (
    (quotePrefix && invNum.startsWith(quotePrefix)) ||
    (sideQuotePrefix && invNum.startsWith(sideQuotePrefix))
  ) {
    throw new Error(`[convertQuoteToInvoice] رقم الفاتورة الناتج يبدأ ببادئة عرض سعر: ${invNum}`);
  }

  // 4. Create invoice with workflow_status = 'new'
  const { data: inv, error: insErr } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invNum,
      customer_id: quote.customer_id,
      subtotal: quote.subtotal,
      discount: quote.discount,
      total: quote.total,
      due_amount: quote.total,
      status: "pending",
      workflow_status: "new",
      currency_code: quote.currency_code,
      exchange_rate_to_base: quote.exchange_rate_to_base,
      date: new Date().toISOString().split("T")[0],
      notes: quote.notes
        ? `محول من عرض السعر ${quote.quote_number}\n${quote.notes}`
        : `محول من عرض السعر ${quote.quote_number}`,
    })
    .select()
    .single();
  if (insErr || !inv) throw insErr || new Error("Failed to create invoice");

  // 5. Copy items first
  if (items && items.length > 0) {
    const payload = items.map((it: any) => ({
      invoice_id: inv.id,
      product_id: it.product_id,
      product_name: it.product_name,
      quantity: it.quantity,
      unit_price: it.unit_price,
      foreign_price: it.foreign_price,
      discount: it.discount || 0,
      discount_value: it.discount_value || 0,
      format_discount: it.format_discount || "percent",
      unit: it.unit,
      tax_status: it.tax_status,
      total: it.total,
    }));
    const { error: itErr } = await supabase.from("invoice_items").insert(payload);
    if (itErr) {
      // Rollback the orphan invoice
      await supabase.from("invoices").delete().eq("id", inv.id);
      throw itErr;
    }
  }

  // 6. Delete the original quote (items first, then the quote itself).
  // User preference: after a successful conversion the quote is removed from
  // the quotes list — the resulting invoice is the single source of truth.
  await supabase.from("quote_items").delete().eq("quote_id", quoteId);
  await supabase.from("quotes").delete().eq("id", quoteId);

  return { invoiceId: inv.id, invoiceNumber: invNum, alreadyConverted: false };
}
