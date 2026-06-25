// Create a share token for a document. Auth required.
// POST { doc_type, doc_id, ttl_hours? }  →  { token, url, expires_at }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TYPES = new Set(["invoice", "quote", "return", "statement-customer", "statement-supplier", "packaging-invoice", "packaging-quote", "unavailable-invoice", "unavailable-quote"]);

function makeToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const docType = String(body?.doc_type || "");
    const docId = String(body?.doc_id || "");
    const ttlHours = Math.min(Math.max(Number(body?.ttl_hours || 24), 1), 24 * 30); // 1h..30d, default 24h

    // Optional: list of section keys hidden in the preview that should also be
    // hidden when the customer opens the public link. Sanitize to a flat array
    // of short identifiers to avoid storing arbitrary payloads.
    let hiddenSections: string[] = [];
    if (Array.isArray(body?.hidden_sections)) {
      hiddenSections = body.hidden_sections
        .filter((s: unknown) => typeof s === "string")
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0 && s.length <= 64 && /^[a-z0-9_-]+$/i.test(s))
        .slice(0, 50);
    }

    if (!ALLOWED_TYPES.has(docType)) {
      return new Response(JSON.stringify({ error: "invalid doc_type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^[0-9a-f-]{36}$/i.test(docId)) {
      return new Response(JSON.stringify({ error: "invalid doc_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const tok = makeToken();
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

    const { error: insErr } = await admin.from("document_share_tokens").insert({
      token: tok, doc_type: docType, doc_id: docId, created_by: userId, expires_at: expiresAt,
      hidden_sections: hiddenSections,
    });
    if (insErr) throw insErr;

    // سجِّل حدث "إنشاء" لمعرفة من ولّد الرابط ومتى.
    const ua = req.headers.get("user-agent") || "";
    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") || "";
    await admin.from("share_link_events").insert({
      token: tok, doc_type: docType, doc_id: docId, event: "created",
      actor: userId, user_agent: ua.slice(0, 500), ip: ip.slice(0, 64),
      meta: { ttl_hours: ttlHours, expires_at: expiresAt },
    }).then(() => {}, () => {});

    // روابط العملاء يجب أن تفتح على الرابط المنشور العام فقط.
    // لا نستخدم Origin القادم من واجهة المعاينة لأنه قد يكون id-preview/preview
    // ويتطلب تسجيل دخول في Lovable عند فتحه خارج جلسة المطوّر.
    const appOrigin = (Deno.env.get("PUBLIC_APP_URL") || "https://albatoolstore.lovable.app").replace(/\/$/, "");
    // Use the meta wrapper edge function so messaging apps (WhatsApp, etc.)
    // get our custom Open Graph preview (logo + customer name) instead of
    // the generic Lovable preview. Real browsers are redirected to the
    // React share page automatically.
    const metaParams = new URLSearchParams({ token: tok });
    if (appOrigin) metaParams.set("origin", appOrigin);
    const url = `${supabaseUrl}/functions/v1/document-share-meta?${metaParams.toString()}`;
    return new Response(JSON.stringify({ token: tok, url, expires_at: expiresAt }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
