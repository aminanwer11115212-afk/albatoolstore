import { supabase } from "@/integrations/supabase/client";

/**
 * Unified quote → invoice conversion.
 *
 * Copies EVERYTHING from the quote to the new invoice so no field/attachment
 * is lost after conversion:
 *   - header fields (customer, currency, exchange, dates, notes, warehouse,
 *     tax_amount, user/internal notes, created_by)
 *   - items (quote_items → invoice_items)
 *   - transports (quote_transports → invoice_transports)
 *   - packaging + packaging items (quotes_packaging(+_items) → invoice_packaging(+ items))
 *   - attachments (quote_attachments → invoice_attachments, same storage URL)
 *
 * Also:
 *   - stocks are deducted once via `deductStockForInvoiceOnce` (idempotent),
 *   - the original quote (and its child rows) is deleted so the invoice is
 *     the single source of truth,
 *   - idempotent: re-running for an already-converted quote returns the
 *     existing invoice instead of creating a duplicate.
 */
export async function convertQuoteToInvoice(
  quoteId: string,
): Promise<{
  invoiceId: string;
  invoiceNumber: string;
  alreadyConverted: boolean;
  stockDeducted: boolean;
  deductedLineCount: number;
  copied: {
    items: number;
    transports: number;
    packaging: number;
    packagingItems: number;
    attachments: number;
  };
}> {
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
        stockDeducted: false,
        deductedLineCount: 0,
        copied: { items: 0, transports: 0, packaging: 0, packagingItems: 0, attachments: 0 },
      };
    }
  }

  // 2. Load items + related children in parallel
  const [itemsRes, transportsRes, pkgRes, pkgItemsRes, attachmentsRes] = await Promise.all([
    supabase.from("quote_items").select("*").eq("quote_id", quoteId),
    supabase.from("quote_transports").select("*").eq("quote_id", quoteId),
    supabase.from("quotes_packaging").select("*").eq("quote_id", quoteId),
    supabase.from("quotes_packaging_items").select("*").eq("quote_id", quoteId),
    supabase.from("quote_attachments").select("*").eq("quote_id", quoteId).is("deleted_at", null),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  const items = itemsRes.data || [];
  const transports = transportsRes.data || [];
  const packaging = pkgRes.data || [];
  const packagingItems = pkgItemsRes.data || [];
  const attachments = attachmentsRes.data || [];

  // 3. Generate invoice number using ONLY invoice_prefix.
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
  const { generateRandomDocNumber } = await import("@/utils/randomDocNumber");
  const invNum = await generateRandomDocNumber("invoices", "invoice_number", prefix);
  if (
    (quotePrefix && invNum.startsWith(quotePrefix)) ||
    (sideQuotePrefix && invNum.startsWith(sideQuotePrefix))
  ) {
    throw new Error(`[convertQuoteToInvoice] رقم الفاتورة الناتج يبدأ ببادئة عرض سعر: ${invNum}`);
  }

  // 4. Create invoice with full field parity
  const q = quote as any;
  const { data: inv, error: insErr } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invNum,
      customer_id: q.customer_id,
      subtotal: q.subtotal,
      tax_amount: q.tax_amount ?? 0,
      discount: q.discount,
      total: q.total,
      due_amount: q.total,
      status: "pending",
      workflow_status: "new",
      currency_code: q.currency_code,
      exchange_rate_to_base: q.exchange_rate_to_base,
      warehouse_id: q.warehouse_id ?? null,
      user_note: q.user_note ?? null,
      internal_note: q.internal_note ?? null,
      created_by: q.created_by ?? null,
      date: new Date().toISOString().split("T")[0],
      notes: q.notes
        ? `محول من عرض السعر ${q.quote_number}\n${q.notes}`
        : `محول من عرض السعر ${q.quote_number}`,
    })
    .select()
    .single();
  if (insErr || !inv) throw insErr || new Error("Failed to create invoice");

  // 4b. IDEMPOTENCY: mark the quote as converted BEFORE inserting children.
  {
    const { error: markErr } = await supabase
      .from("quotes")
      .update({ converted_to_invoice_id: inv.id })
      .eq("id", quoteId);
    if (markErr) {
      const { error: rbErr } = await supabase.from("invoices").delete().eq("id", inv.id);
      if (rbErr) console.error("[convertQuoteToInvoice] rollback after mark failed", rbErr);
      throw markErr;
    }
  }

  const copied = {
    items: 0,
    transports: 0,
    packaging: 0,
    packagingItems: 0,
    attachments: 0,
  };

  // 5. Copy items
  if (items.length > 0) {
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
      const { error: rbErr } = await supabase.from("invoices").delete().eq("id", inv.id);
      if (rbErr) console.error("[convertQuoteToInvoice] items-insert rollback failed", rbErr);
      throw itErr;
    }
    copied.items = payload.length;
  }

  // 5b. Copy transports
  if (transports.length > 0) {
    const payload = transports.map((t: any) => ({
      invoice_id: inv.id,
      transporter_id: t.transporter_id,
      destination_id: t.destination_id,
      driver_name: t.driver_name,
      vehicle_number: t.vehicle_number,
      cost: t.cost,
      status: t.status,
      notes: t.notes,
      transport_date: t.transport_date,
    }));
    const { error } = await supabase.from("invoice_transports").insert(payload);
    if (error) console.error("[convertQuoteToInvoice] transports copy failed", error);
    else copied.transports = payload.length;
  }

  // 5c. Copy packaging headers + build old→new id map, then items
  const pkgIdMap = new Map<string, string>();
  if (packaging.length > 0) {
    const payload = packaging.map((p: any) => ({
      invoice_id: inv.id,
      packaging_type_id: p.packaging_type_id,
      notes: p.notes,
      total: p.total,
      quantity: p.quantity,
      packs_count: p.packs_count,
      pieces_per_pack: p.pieces_per_pack,
      weight: p.weight,
      dimensions: p.dimensions,
      cost: p.cost,
    }));
    const { data: inserted, error } = await supabase
      .from("invoice_packaging")
      .insert(payload)
      .select("id");
    if (error) {
      console.error("[convertQuoteToInvoice] packaging copy failed", error);
    } else if (inserted) {
      packaging.forEach((p: any, i: number) => {
        if (inserted[i]) pkgIdMap.set(p.id, inserted[i].id);
      });
      copied.packaging = inserted.length;
    }
  }
  if (packagingItems.length > 0) {
    const payload = packagingItems
      .map((pi: any) => ({
        invoice_id: inv.id,
        invoice_packaging_id: pi.quote_packaging_id
          ? pkgIdMap.get(pi.quote_packaging_id) ?? null
          : null,
        packaging_id: pi.packaging_id,
        packaging_type_id: pi.packaging_type_id,
        description: pi.description,
        quantity: pi.quantity,
        unit_price: pi.unit_price,
        total: pi.total,
        product_id: pi.product_id,
        product_name: pi.product_name,
        packs_count: pi.packs_count,
        pieces_per_pack: pi.pieces_per_pack,
        price: pi.price,
      }));
    const { error } = await supabase.from("invoices_packaging_items").insert(payload);
    if (error) console.error("[convertQuoteToInvoice] packaging items copy failed", error);
    else copied.packagingItems = payload.length;
  }

  // 5d. Copy attachments (same storage URL — no file duplication)
  if (attachments.length > 0) {
    const payload = attachments.map((a: any) => ({
      invoice_id: inv.id,
      file_url: a.file_url,
      file_name: a.file_name,
      file_type: a.file_type,
      file_size: a.file_size,
      category: a.category,
      expires_at: a.expires_at,
    }));
    const { error } = await supabase.from("invoice_attachments").insert(payload);
    if (error) console.error("[convertQuoteToInvoice] attachments copy failed", error);
    else copied.attachments = payload.length;
  }

  // 6. Deduct stock for the newly-created invoice (idempotent).
  let stockDeducted = false;
  let deductedLineCount = 0;
  if (items.length > 0) {
    try {
      const { deductStockForInvoiceOnce } = await import("@/utils/stockDeduction");
      const linesForStock = items
        .map((it: any) => ({ product_id: it.product_id, quantity: it.quantity }))
        .filter((l: any) => l.product_id && Number(l.quantity || 0) > 0);
      const res = await deductStockForInvoiceOnce(inv.id, linesForStock);
      stockDeducted = res.deducted;
      deductedLineCount = res.deducted ? linesForStock.length : 0;
    } catch (e) {
      console.error("[convertQuoteToInvoice] stock deduction failed", e);
    }
  }

  // 7. Delete the original quote and all its children. Skip archive trigger for
  //    quote_items because this is a conversion, not a user-intent item deletion.
  await (supabase as any).rpc("delete_quote_items_silent", { p_quote_id: quoteId });
  await Promise.all([
    supabase.from("quote_transports").delete().eq("quote_id", quoteId),
    supabase.from("quotes_packaging_items").delete().eq("quote_id", quoteId),
    supabase.from("quotes_packaging").delete().eq("quote_id", quoteId),
    supabase.from("quote_attachments").delete().eq("quote_id", quoteId),
  ]);
  const { error: delQuoteErr } = await supabase
    .from("quotes").delete().eq("id", quoteId);
  if (delQuoteErr) console.error("[convertQuoteToInvoice] delete quote failed", delQuoteErr);

  // 8. إعادة حساب رصيد العميل صراحةً + بث أحداث تحديث الكاش
  //    حتى تعرض CustomerStatementPage / CustomersPage الأرقام الجديدة
  //    فوراً دون الاعتماد فقط على triggers realtime التي قد تتأخر.
  if (quote.customer_id) {
    try {
      await (supabase as any).rpc("recompute_customer_balance", {
        _customer_id: quote.customer_id,
      });
    } catch (e) {
      console.error("[convertQuoteToInvoice] recompute_customer_balance failed", e);
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("invoices:changed"));
    window.dispatchEvent(new Event("quotes:changed"));
    window.dispatchEvent(new Event("customers:changed"));
    window.dispatchEvent(new Event("transactions:changed"));
  }

  return {
    invoiceId: inv.id,
    invoiceNumber: invNum,
    alreadyConverted: false,
    stockDeducted,
    deductedLineCount,
    copied,
  };
}
