// اختبارات تكامل لرؤوس استجابة document-share-meta:
// - واتساب (بوت معاينة) → 200 + text/html + no-store + بدون Location
// - متصفح عادي         → 302 + Location → /share/document/<token> + no-store
//
// تستدعي الدالة المنشورة فعلياً عبر HTTP.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const FN_URL = `${SUPABASE_URL}/functions/v1/document-share-meta`;
const TEST_TOKEN = "test-headers-token-does-not-need-to-exist";
const TEST_ORIGIN = "https://albatoolstore.lovable.app";
const PREVIEW_ORIGIN = "https://id-preview--6bb54d5d-228c-4959-ae23-8bb1b02bd990.lovable.app";

const WHATSAPP_UA =
  "WhatsApp/2.23.20.0 A";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function callFn(userAgent: string): Promise<Response> {
  const url = `${FN_URL}?token=${encodeURIComponent(TEST_TOKEN)}&origin=${encodeURIComponent(TEST_ORIGIN)}`;
  return await fetch(url, {
    method: "GET",
    redirect: "manual", // لا تتبع 302 — نريد فحص رؤوسه
    headers: {
      "user-agent": userAgent,
      "apikey": SUPABASE_ANON_KEY,
      "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
}

async function callFnWithOrigin(userAgent: string, origin: string): Promise<Response> {
  const url = `${FN_URL}?token=${encodeURIComponent(TEST_TOKEN)}&origin=${encodeURIComponent(origin)}`;
  return await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      "user-agent": userAgent,
      "apikey": SUPABASE_ANON_KEY,
      "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
}

Deno.test("WhatsApp bot: 200 with HTML body, no-store, and no Location", async () => {
  const res = await callFn(WHATSAPP_UA);
  const body = await res.text(); // استهلاك الجسم لتجنب تسريب موارد

  assertEquals(res.status, 200, "expected 200 for WhatsApp bot");

  // ملاحظة: بوابة Supabase تعيد كتابة Content-Type أحياناً إلى text/plain
  // لاستجابات الدوال. واتساب يحلّل meta tags بصرف النظر عن ذلك،
  // لذا نقبل text/html أو text/plain ونتحقق أن الجسم HTML فعلاً.
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  assert(
    contentType.includes("text/html") || contentType.includes("text/plain"),
    `expected text/html or text/plain, got: ${contentType}`,
  );

  const cacheControl = (res.headers.get("cache-control") || "").toLowerCase();
  assertStringIncludes(
    cacheControl,
    "no-store",
    `expected no-store cache-control, got: ${cacheControl}`,
  );

  assertEquals(
    res.headers.get("location"),
    null,
    "bot response must NOT include a Location header",
  );

  // المهم: الجسم HTML صالح وفيه meta tags لمعاينة الرابط
  assertStringIncludes(body.toLowerCase(), "<!doctype html>");
  assertStringIncludes(body, 'property="og:title"');
  assertStringIncludes(body, 'property="og:image"');
});

Deno.test("Regular browser: 302 redirect to /share/document/<token>", async () => {
  const res = await callFn(BROWSER_UA);
  await res.text(); // استهلاك الجسم

  assertEquals(res.status, 302, "expected 302 for regular browser");

  const location = res.headers.get("location") || "";
  const expected = `${TEST_ORIGIN}/share/document/${encodeURIComponent(TEST_TOKEN)}`;
  assertEquals(
    location,
    expected,
    `expected Location=${expected}, got: ${location}`,
  );

  const cacheControl = res.headers.get("cache-control") || "";
  assertStringIncludes(
    cacheControl.toLowerCase(),
    "no-store",
    `expected no-store cache-control, got: ${cacheControl}`,
  );

  // المتصفح يجب ألا يتلقى جسم HTML للمعاينة
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  assert(
    !contentType.includes("text/html"),
    `browser redirect should not be text/html, got: ${contentType}`,
  );
});

Deno.test("Regular browser: preview origins are forced to published public app", async () => {
  const res = await callFnWithOrigin(BROWSER_UA, PREVIEW_ORIGIN);
  await res.text();

  assertEquals(res.status, 302, "expected 302 for regular browser");

  const location = res.headers.get("location") || "";
  const expected = `https://albatoolstore.lovable.app/share/document/${encodeURIComponent(TEST_TOKEN)}`;
  assertEquals(
    location,
    expected,
    `expected preview origin to be replaced with published app, got: ${location}`,
  );
});
