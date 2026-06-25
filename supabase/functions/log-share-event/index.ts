// Public endpoint to log a share-link event (viewed/printed/downloaded).
// Used by the standalone customer page. No auth required — token presence
// is treated as proof of access. Writes via service role so RLS doesn't block.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_EVENTS = new Set(["viewed", "printed", "downloaded"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const event = String(body?.event || "").trim();
    if (!token || !ALLOWED_EVENTS.has(event)) {
      return new Response(JSON.stringify({ error: "bad_request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Lookup the token to attach doc_type/doc_id (and silently skip if missing/expired-cleanup)
    const { data: tk } = await admin
      .from("document_share_tokens")
      .select("doc_type, doc_id")
      .eq("token", token)
      .maybeSingle();

    const ua = req.headers.get("user-agent") || "";
    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "";
    const referer = req.headers.get("referer") || "";

    await admin.from("share_link_events").insert({
      token,
      doc_type: tk?.doc_type || "unknown",
      doc_id: tk?.doc_id || null,
      event,
      user_agent: ua.slice(0, 500),
      ip: ip.slice(0, 64),
      referer: referer.slice(0, 500),
      meta: body?.meta && typeof body.meta === "object" ? body.meta : {},
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
