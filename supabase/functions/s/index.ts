// Public short-link + Open Graph preview endpoint for customer statements.
// URL pattern: /functions/v1/s?t=<token>
//
// Behavior:
// - Bots/crawlers (WhatsApp, Telegram, Twitter, Facebook, Slack, Discord, etc.):
//   returns a tiny HTML page with Open Graph meta tags showing the company's
//   name and logo (no Lovable branding), so link previews look professional.
// - Regular browsers: 302 redirects to the actual SPA route that renders the
//   full statement page.
//
// This function does NOT verify the token signature itself — it just reads the
// customer_id from the payload (publicly safe) to fetch company branding for
// the preview. The real data fetch (customer-statement) still requires a valid
// signed token, so security is unchanged.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Detects social/messaging crawlers that fetch URLs to build link previews.
function isBot(ua: string): boolean {
  if (!ua) return false;
  const u = ua.toLowerCase();
  return /whatsapp|telegrambot|twitterbot|facebookexternalhit|facebot|slackbot|discordbot|linkedinbot|pinterest|skypeuripreview|googlebot|bingbot|applebot|embedly|vkshare|w3c_validator|outbrain|quora|redditbot|tumblr|bitlybot|nuzzel|yahoo|baiduspider|yandex|duckduckbot/.test(u);
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Decode the unsigned payload portion of the token (no signature verification —
// that happens in the data endpoint).
function decodePayload(token: string): { c?: string; e?: number } | null {
  try {
    const [payloadB64] = token.split(".");
    if (!payloadB64) return null;
    const b64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("t") || "";
  const ua = req.headers.get("user-agent") || "";

  // Compute the public app origin to redirect humans to.
  // Only allow origins from a server-side allowlist to prevent open-redirect abuse.
  const DEFAULT_APP_ORIGIN = `${url.protocol}//${url.host}`;
  const ALLOWED_APP_ORIGINS = new Set<string>(
    [
      Deno.env.get("PUBLIC_APP_URL"),
      "https://albatool.lovable.app",
      "https://preview--albatool.lovable.app",
      DEFAULT_APP_ORIGIN,
    ].filter((v): v is string => !!v).map((v) => v.replace(/\/$/, "")),
  );
  const rawApp = (url.searchParams.get("app") || "").replace(/\/$/, "");
  const appOrigin = rawApp && ALLOWED_APP_ORIGINS.has(rawApp)
    ? rawApp
    : (Deno.env.get("PUBLIC_APP_URL") || DEFAULT_APP_ORIGIN).replace(/\/$/, "");
  const targetUrl = `${appOrigin.replace(/\/$/, "")}/share/customer/t/${encodeURIComponent(token)}`;

  // Humans → straight redirect to the SPA.
  if (!isBot(ua)) {
    return Response.redirect(targetUrl, 302);
  }

  // Bots → render OG preview HTML with company branding.
  let companyName = "كشف حساب";
  let logoUrl =
    "https://vifrecsqxdbwqtcfkdyb.supabase.co/storage/v1/object/public/company-assets/logo.png";
  let description = "كشف حساب العميل";

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: company } = await supabase
      .from("company_settings")
      .select("company_name, logo_url, address")
      .limit(1)
      .maybeSingle();

    if (company?.company_name) companyName = company.company_name;
    if (company?.logo_url) logoUrl = company.logo_url;

    // Try to personalize description with customer name (best-effort, no auth).
    const payload = decodePayload(token);
    if (payload?.c) {
      const { data: customer } = await supabase
        .from("customers")
        .select("name")
        .eq("id", payload.c)
        .maybeSingle();
      if (customer?.name) {
        description = `كشف حساب العميل: ${customer.name}`;
      }
    }
  } catch {
    // ignore — fall back to defaults
  }

  const title = `${companyName} - كشف حساب`;
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(logoUrl)}" />
<meta property="og:image:alt" content="${escapeHtml(companyName)}" />
<meta property="og:url" content="${escapeHtml(req.url)}" />
<meta property="og:site_name" content="${escapeHtml(companyName)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(logoUrl)}" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(targetUrl)}" />
</head>
<body>
<p><a href="${escapeHtml(targetUrl)}">${escapeHtml(title)}</a></p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
});
