// Public customer statement endpoint.
// Verifies a short-lived HMAC-signed token (issued by customer-statement-token)
// to ensure only the intended recipient can view the data without full authentication.
// Returns customer profile + invoices + quotes + returns + transactions for that customer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyStatementToken } from "../_shared/statementToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    if (!token) {
      return new Response(JSON.stringify({ error: "missing token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secret = Deno.env.get("STATEMENT_SIGNING_SECRET");
    if (!secret) {
      return new Response(JSON.stringify({ error: "signing secret not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let payload;
    try {
      payload = await verifyStatementToken(token, secret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "invalid token";
      const status = msg === "token expired" ? 410 : 401;
      return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const id = payload.c;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // عزل الكاش (POS): أي كشف مخصّص لعميل يستثني فواتير نقطة البيع
    // والمعاملات المرتبطة بها (transactions.reference_id = invoice id).
    const posRes = await supabase
      .from("invoices")
      .select("id")
      .eq("customer_id", id)
      .eq("source", "pos");
    const posIds = new Set<string>((posRes.data || []).map((r: any) => r.id));

    const [
      customerRes,
      companyRes,
      invoicesRes,
      quotesRes,
      returnsRes,
      transactionsRes,
    ] = await Promise.all([
      supabase.from("customers").select("*").eq("id", id).maybeSingle(),
      supabase.from("company_settings").select("*").limit(1).maybeSingle(),
      supabase
        .from("invoices")
        .select("id, invoice_number, date, created_at, due_date, total, paid_amount, due_amount, status, workflow_status, type, source, currency_code, notes")
        .eq("customer_id", id)
        .neq("source", "pos")
        .order("date", { ascending: false }),
      supabase
        .from("quotes")
        .select("id, quote_number, date, valid_until, total, status")
        .eq("customer_id", id)
        .order("date", { ascending: false }),
      supabase
        .from("stock_returns")
        .select("id, return_number, date, total, status")
        .eq("customer_id", id)
        .order("date", { ascending: false }),
      supabase
        .from("transactions")
        .select("id, date, created_at, amount, type, category, description, method, account_id, reference_id, reference_no, allocation")
        .eq("customer_id", id)
        .order("date", { ascending: false }),
    ]);


    if (customerRes.error) throw customerRes.error;
    if (!customerRes.data) {
      return new Response(JSON.stringify({ error: "customer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // استبعاد المعاملات المرتبطة بفواتير نقطة البيع
    const cleanTx = (transactionsRes.data || []).filter(
      (t: any) => !t.reference_id || !posIds.has(t.reference_id),
    );

    // أسماء الحسابات المستخدمة (لعرض «تحويل بنكي — بنك كذا»)
    const accountIds = [...new Set(cleanTx.map((t: any) => t.account_id).filter(Boolean))];
    let accounts: any[] = [];
    if (accountIds.length) {
      const accRes = await supabase.from("accounts").select("id, name").in("id", accountIds);
      accounts = accRes.data || [];
    }

    return new Response(
      JSON.stringify({
        customer: customerRes.data,
        company: companyRes.data || null,
        invoices: invoicesRes.data || [],
        quotes: quotesRes.data || [],
        returns: returnsRes.data || [],
        transactions: cleanTx,
        accounts,
        expires_at: new Date(payload.e * 1000).toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
