// Issues an HMAC-signed token for sharing a customer statement.
// Requires an authenticated caller (the staff user generating the share link).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signStatementToken } from "../_shared/statementToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Maximum allowed token lifetime: 90 days
const MAX_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Validate caller is authenticated.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const customerId = String(body?.customer_id || "");
    const ttl = Math.min(
      Math.max(Number(body?.ttl_seconds) || DEFAULT_TTL_SECONDS, 60),
      MAX_TTL_SECONDS,
    );

    if (!UUID_RE.test(customerId)) {
      return new Response(JSON.stringify({ error: "invalid customer_id" }), {
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

    const exp = Math.floor(Date.now() / 1000) + ttl;
    const signed = await signStatementToken(customerId, exp, secret);

    return new Response(
      JSON.stringify({ token: signed, expires_at: new Date(exp * 1000).toISOString() }),
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
