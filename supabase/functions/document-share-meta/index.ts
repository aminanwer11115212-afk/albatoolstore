// Public link wrapper that serves Open Graph meta tags for messaging apps
// (WhatsApp, Telegram, etc.) so the link preview shows the company logo
// and a tailored title (document type + customer name) instead of the
// default Lovable preview. Real browsers are redirected to the React
// share page at /share/document/:token.
//
// GET /functions/v1/document-share-meta?token=...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const LOGO_URL =
  "https://vifrecsqxdbwqtcfkdyb.supabase.co/storage/v1/object/public/company-assets/albatool-logo.png";

const DEFAULT_APP_ORIGIN = "https://preview--albatool.lovable.app";

// Allowlist of origins permitted as redirect targets. Anything else falls back to DEFAULT_APP_ORIGIN.
const ALLOWED_APP_ORIGINS = new Set<string>(
  [
    DEFAULT_APP_ORIGIN,
    "https://albatool.lovable.app",
    Deno.env.get("PUBLIC_APP_URL"),
  ].filter((v): v is string => !!v).map((v) => v.replace(/\/$/, "")),
);

function pickAppOrigin(raw: string | null): string {
  const candidate = (raw || "").replace(/\/$/, "");
  return candidate && ALLOWED_APP_ORIGINS.has(candidate) ? candidate : DEFAULT_APP_ORIGIN;
}

function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function docTypeLabel(t: string): string {
  switch (t) {
    case "invoice": return "فاتورة";
    case "quote": return "عرض سعر";
    case "return": return "مرتجع";
    case "statement-customer": return "كشف حساب عميل";
    case "statement-supplier": return "كشف حساب مورد";
    default: return "مستند";
  }
}

// قائمة وكلاء روبوتات معاينة الروابط (مشاركة في تطبيقات المراسلة، محركات البحث،
// معاينات iMessage/Safari، إلخ). استخدم isLinkPreviewBot للتحقق.
const PREVIEW_BOT_PATTERNS: RegExp[] = [
  // تطبيقات المراسلة
  /WhatsApp/i,
  /TelegramBot/i,
  /Slackbot(-LinkExpanding)?/i,
  /Discordbot/i,
  /SkypeUriPreview/i,
  /Viber/i,
  /Line\//i,                       // LINE messenger
  /KAKAOTALK-Scrap/i,
  /Snapchat/i,

  // فيسبوك / إنستغرام / تويتر / لينكدإن
  /facebookexternalhit/i,
  /Facebot/i,
  /Instagram/i,
  /Twitterbot/i,
  /LinkedInBot/i,
  /Pinterest(bot)?/i,
  /redditbot/i,

  // معاينات Apple (iMessage / Safari Rich Link)
  /facebookexternalua/i,
  /Applebot/i,
  /iMessagePreview/i,
  /LinkPreview/i,

  // محركات البحث الكبرى
  /Googlebot/i,
  /Google-InspectionTool/i,
  /Storebot-Google/i,
  /Bingbot/i,
  /DuckDuckBot/i,
  /YandexBot/i,
  /Baiduspider/i,

  // أدوات معاينة عامة وSEO
  /Embedly/i,
  /Iframely/i,
  /Nuzzel/i,
  /vkShare/i,
  /W3C_Validator/i,
  /qwantify/i,
  /Yahoo!\s*Slurp/i,
  /MetaInspector/i,
];

export function isLinkPreviewBot(userAgent: string): boolean {
  if (!userAgent) return false;
  return PREVIEW_BOT_PATTERNS.some((re) => re.test(userAgent));
}

// كشف حلقة التحويل: إذا أعاد العميل طلباً مرّة أخرى إلى هذه الدالة بعد
// تحويلها له، أو إذا كان origin يشير إلى نفس بوابة Functions، نوقف الحلقة.
function detectRedirectLoop(req: Request, appOrigin: string): string | null {
  const reqUrl = new URL(req.url);

  // 1) origin يجب ألا يكون نفس مضيف بوابة الـ functions
  try {
    const originHost = new URL(appOrigin).host;
    if (originHost === reqUrl.host) {
      return "origin يساوي مضيف بوابة الدوال — سيؤدي إلى حلقة تحويل.";
    }
  } catch {
    return "قيمة origin غير صالحة.";
  }

  // 2) Referer من نفس بوابة الـ functions يعني أن العميل عاد إلينا
  const referer = req.headers.get("referer") || "";
  if (referer) {
    try {
      if (new URL(referer).host === reqUrl.host) {
        return "تم اكتشاف عودة الطلب إلى نفس بوابة الدوال (referer loop).";
      }
    } catch { /* ignore */ }
  }

  // 3) عدّاد قفزات عبر query param ?hops=
  const hops = parseInt(reqUrl.searchParams.get("hops") || "0", 10);
  if (Number.isFinite(hops) && hops >= 3) {
    return `تجاوز عدد القفزات الحدّ الأقصى (${hops}).`;
  }
  return null;
}

function generateTraceId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// رؤوس آمنة للتسجيل (لا نسرّب authorization/cookie/apikey)
const SENSITIVE_HEADERS = new Set([
  "authorization", "cookie", "apikey", "x-api-key", "set-cookie",
]);
function snapshotHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase())
      ? `<redacted:${v.length}c>`
      : v.length > 200 ? v.slice(0, 200) + "…" : v;
  });
  return out;
}

type RedirectEvent = {
  trace_id: string;
  ts: string;
  kind: "browser-redirect" | "bot-meta" | "blocked-loop" | "error";
  status: number;
  token_present: boolean;
  target?: string;
  user_agent: string;
  is_bot: boolean;
  loop_reason?: string;
  error?: string;
  request_headers?: Record<string, string>;
  response_headers?: Record<string, string>;
};

function logRedirectEvent(ev: RedirectEvent) {
  // لقطة الرؤوس تُرفق فقط للأخطاء/الحلقات لتقليل الضوضاء في السجلات
  const isError = ev.kind === "blocked-loop" || ev.kind === "error" || ev.status >= 400;
  const payload = isError ? ev : { ...ev, request_headers: undefined, response_headers: undefined };
  const logger = isError ? console.error : console.log;
  logger(`[share-meta-event] ${JSON.stringify(payload)}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || "").trim();
  const traceId = generateTraceId();

  // Build the destination app URL (where the React preview page lives).
  const appOrigin = pickAppOrigin(url.searchParams.get("origin"));
  const targetUrl = token
    ? `${appOrigin}/share/document/${encodeURIComponent(token)}`
    : appOrigin;

  const userAgent = req.headers.get("user-agent") || "";
  const isPreviewBot = isLinkPreviewBot(userAgent);

  // فحص الحلقة قبل أي تحويل
  const loopReason = detectRedirectLoop(req, appOrigin);
  if (loopReason && !isPreviewBot) {
    const errorHtml = `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>تعذّر فتح المستند</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:'Segoe UI',Tahoma,sans-serif;background:#f3f4f6;color:#1a1a1a;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#fff;border-radius:12px;padding:32px;text-align:center;max-width:480px;box-shadow:0 4px 16px rgba(0,0,0,.08)}h1{font-size:18px;margin:0 0 12px;color:#b91c1c}p{color:#555;margin:0 0 8px;font-size:14px}code{background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:12px;color:#5b21b6}</style>
</head><body><div class="card">
<h1>تعذّر فتح رابط المستند</h1>
<p>تم اكتشاف حلقة تحويل ولم نتمكن من توجيهك إلى الصفحة الصحيحة.</p>
<p style="color:#888;font-size:12px">${escapeHtml(loopReason)}</p>
<p>رقم التتبّع: <code>${traceId}</code></p>
</div></body></html>`;
    const respHeaders = {
      ...corsHeaders,
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store, must-revalidate",
      "x-share-trace-id": traceId,
      "x-share-redirect": "blocked-loop",
    };
    logRedirectEvent({
      trace_id: traceId,
      ts: new Date().toISOString(),
      kind: "blocked-loop",
      status: 508,
      token_present: !!token,
      target: targetUrl,
      user_agent: userAgent.slice(0, 200),
      is_bot: isPreviewBot,
      loop_reason: loopReason,
      request_headers: snapshotHeaders(req.headers),
      response_headers: respHeaders,
    });
    return new Response(new TextEncoder().encode(errorHtml), {
      status: 508, // Loop Detected
      headers: respHeaders,
    });
  }

  if (!isPreviewBot) {
    logRedirectEvent({
      trace_id: traceId,
      ts: new Date().toISOString(),
      kind: "browser-redirect",
      status: 302,
      token_present: !!token,
      target: targetUrl,
      user_agent: userAgent.slice(0, 200),
      is_bot: false,
    });
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        "Location": targetUrl,
        "Cache-Control": "no-store, must-revalidate",
        "x-share-trace-id": traceId,
        "x-share-redirect": "browser-to-app",
      },
    });
  }

  logRedirectEvent({
    trace_id: traceId,
    ts: new Date().toISOString(),
    kind: "bot-meta",
    status: 200,
    token_present: !!token,
    target: targetUrl,
    user_agent: userAgent.slice(0, 200),
    is_bot: true,
  });


  let title = "البتول لاسبيرات المواتر والتكاتك";
  let description = "اضغط لفتح المستند";
  const companyName = "اولاد جابر لاسبيرات المواتر والتكاتك";

  if (token) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(supabaseUrl, serviceKey);

      const { data: tk } = await admin
        .from("document_share_tokens")
        .select("doc_type, doc_id, expires_at")
        .eq("token", token)
        .maybeSingle();

      if (tk && new Date(tk.expires_at).getTime() > Date.now()) {
        const docLabel = docTypeLabel(tk.doc_type);
        let partyName = "";
        let docNumber = "";

        if (tk.doc_type === "invoice") {
          const { data } = await admin
            .from("invoices")
            .select("invoice_number, customers(name)")
            .eq("id", tk.doc_id)
            .maybeSingle();
          partyName = (data as any)?.customers?.name || "";
          docNumber = (data as any)?.invoice_number || "";
        } else if (tk.doc_type === "quote") {
          const { data } = await admin
            .from("quotes")
            .select("quote_number, customers(name)")
            .eq("id", tk.doc_id)
            .maybeSingle();
          partyName = (data as any)?.customers?.name || "";
          docNumber = (data as any)?.quote_number || "";
        } else if (tk.doc_type === "return") {
          const { data } = await admin
            .from("returns")
            .select("return_number, customers(name)")
            .eq("id", tk.doc_id)
            .maybeSingle();
          partyName = (data as any)?.customers?.name || "";
          docNumber = (data as any)?.return_number || "";
        } else if (tk.doc_type === "statement-customer") {
          const { data } = await admin
            .from("customers").select("name").eq("id", tk.doc_id).maybeSingle();
          partyName = (data as any)?.name || "";
        } else if (tk.doc_type === "statement-supplier") {
          const { data } = await admin
            .from("suppliers").select("name").eq("id", tk.doc_id).maybeSingle();
          partyName = (data as any)?.name || "";
        }

        title = `${docLabel}${docNumber ? " #" + docNumber : ""}${partyName ? " - " + partyName : ""}`;
        description = `${companyName}${partyName ? " — " + partyName : ""}`;
      }
    } catch (_) {
      // fall through to default meta
    }
  }

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">

<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(LOGO_URL)}">
<meta property="og:image:width" content="600">
<meta property="og:image:height" content="600">
<meta property="og:image:alt" content="${escapeHtml(companyName)}">
<meta property="og:url" content="${escapeHtml(targetUrl)}">
<meta property="og:site_name" content="${escapeHtml(companyName)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(LOGO_URL)}">

<link rel="icon" href="${escapeHtml(LOGO_URL)}">
<meta http-equiv="refresh" content="0; url=${escapeHtml(targetUrl)}">
<style>
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: #f3f4f6; color: #1a1a1a; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .card { background: #fff; border-radius: 12px; padding: 32px; text-align: center; max-width: 420px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
  img { width: 120px; height: 120px; object-fit: contain; margin-bottom: 16px; }
  h1 { font-size: 18px; margin: 0 0 8px; color: #5b21b6; }
  p { color: #555; margin: 0 0 16px; font-size: 14px; }
  a { display: inline-block; background: #5b21b6; color: #fff; text-decoration: none; padding: 10px 22px; border-radius: 8px; font-weight: 700; }
</style>
</head>
<body>
<div class="card">
  <img src="${escapeHtml(LOGO_URL)}" alt="${escapeHtml(companyName)}">
  <h1>${escapeHtml(title)}</h1>
  <p>جاري فتح المستند...</p>
  <a href="${escapeHtml(targetUrl)}">فتح المستند الآن</a>
</div>
<script>window.location.replace(${JSON.stringify(targetUrl)});</script>
</body>
</html>`;

  // Encode as raw bytes. The Supabase edge gateway sometimes rewrites
  // Content-Type to text/plain for string bodies — sending a Uint8Array
  // with an explicit binary-style content type bypasses that.
  const bytes = new TextEncoder().encode(html);

  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store, must-revalidate",
      "x-content-type-options": "nosniff",
      "x-share-trace-id": traceId,
      "x-share-redirect": "bot-meta",
    },
  });
});
