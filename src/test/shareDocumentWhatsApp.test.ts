import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Unit tests لمساعد shareDocumentWhatsApp:
 *  - يبني الرسالة العربية بالشكل المتوقّع (اسم العميل/رقم المستند/الإجمالي/الرابط)
 *  - يمرر doc_type وdoc_id وttl_hours وhidden_sections بشكل صحيح لكل الحالات
 *    (فاتورة عادية، POS، عرض سعر، عرض سعر جانبي، مرتجع، كشوف حساب، تغليف)
 *  - يفتح واتساب بدون رقم عندما لا يُمرَّر phone (حالة POS)
 *  - يتعامل مع فشل الاستجابة بدون فتح واتساب
 */

// --- mocks ---------------------------------------------------------------
const h = vi.hoisted(() => ({
  toastErr: vi.fn(),
  toastLoading: vi.fn(() => "tid"),
  toastDismiss: vi.fn(),
  getSession: vi.fn(async () => ({ data: { session: { access_token: "tok-abc" } } })),
  openWhatsApp: vi.fn(),
}));
const { toastErr, toastLoading, toastDismiss, getSession, openWhatsApp } = h;

vi.mock("sonner", () => ({
  toast: { error: h.toastErr, loading: h.toastLoading, dismiss: h.toastDismiss, success: vi.fn() },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: h.getSession } },
}));
vi.mock("@/utils/whatsapp", () => ({ openWhatsApp: h.openWhatsApp }));

import { shareDocumentViaWhatsApp } from "@/utils/shareDocumentWhatsApp";

// --- env + fetch stub ----------------------------------------------------
const SUPA_URL = "https://example.supabase.co";
const SHARE_URL = "https://share.test/d/share-token-xyz";

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", SUPA_URL);
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon-key");
  openWhatsApp.mockReset();
  toastErr.mockReset();
  toastLoading.mockClear();
  toastDismiss.mockClear();
  getSession.mockClear();
  // default fetch: success returning known URL
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ url: SHARE_URL, token: "share-token-xyz" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function lastFetchBody(): any {
  const f = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>);
  const init = f.mock.calls[0]?.[1] as RequestInit | undefined;
  return init?.body ? JSON.parse(String(init.body)) : null;
}

function lastFetchUrl(): string {
  const f = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>);
  return String(f.mock.calls[0]?.[0] ?? "");
}

// --- tests --------------------------------------------------------------
describe("shareDocumentViaWhatsApp", () => {
  it("يرفض الاستدعاء بدون docId ولا يستدعي fetch", async () => {
    const url = await shareDocumentViaWhatsApp({ docType: "invoice", docId: "" });
    expect(url).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(toastErr).toHaveBeenCalled();
    expect(openWhatsApp).not.toHaveBeenCalled();
  });

  it("فاتورة عادية: يمرر doc_type=invoice ويبني رسالة بالاسم والرقم والإجمالي والرابط", async () => {
    const url = await shareDocumentViaWhatsApp({
      docType: "invoice",
      docId: "inv-1",
      phone: "0912345678",
      customerName: "أحمد",
      docNumber: "INV-0001",
      total: 1500,
      currency: "SDG",
    });

    expect(url).toBe(SHARE_URL);
    expect(lastFetchUrl()).toBe(`${SUPA_URL}/functions/v1/create-document-share-token`);
    const body = lastFetchBody();
    expect(body).toMatchObject({ doc_type: "invoice", doc_id: "inv-1", ttl_hours: 168 });
    expect(body.hidden_sections).toBeUndefined();

    expect(openWhatsApp).toHaveBeenCalledTimes(1);
    const [phoneArg, msg] = openWhatsApp.mock.calls[0];
    expect(phoneArg).toBe("0912345678");
    expect(msg).toContain("مرحباً أحمد");
    expect(msg).toContain("📄 فاتورة رقم: INV-0001");
    expect(msg).toContain("💰 الإجمالي:");
    expect(msg).toContain("1,500");
    expect(msg).toContain("SDG");
    expect(msg).toContain("رابط المعاينة:");
    expect(msg).toContain(SHARE_URL);
  });

  it("فاتورة POS بدون هاتف: يفتح واتساب بـ undefined ويستعمل docLabel المخصص", async () => {
    await shareDocumentViaWhatsApp({
      docType: "invoice",
      docId: "pos-9",
      phone: null,
      customerName: null,
      docNumber: "POS-0042",
      total: 250,
      currency: "SDG",
      docLabel: "فاتورة كاش",
    });
    const body = lastFetchBody();
    expect(body).toMatchObject({ doc_type: "invoice", doc_id: "pos-9" });

    const [phoneArg, msg] = openWhatsApp.mock.calls[0];
    expect(phoneArg).toBeUndefined();
    expect(msg.startsWith("مرحباً 👋")).toBe(true);
    expect(msg).toContain("📄 فاتورة كاش رقم: POS-0042");
    expect(msg).toContain(SHARE_URL);
  });

  it("عرض سعر: doc_type=quote والعنوان الافتراضي 'عرض سعر'", async () => {
    await shareDocumentViaWhatsApp({
      docType: "quote", docId: "q-1", phone: "0900",
      customerName: "خالد", docNumber: "QT-0001", total: 0,
    });
    expect(lastFetchBody()).toMatchObject({ doc_type: "quote", doc_id: "q-1" });
    const msg = openWhatsApp.mock.calls[0][1] as string;
    expect(msg).toContain("📄 عرض سعر رقم: QT-0001");
    // total=0 ⇒ لا يُضاف سطر الإجمالي
    expect(msg).not.toContain("💰 الإجمالي:");
  });

  it("عرض سعر جانبي: يبقى doc_type=quote (نفس جدول quotes) مع تمرير hidden_sections وttl مخصص", async () => {
    await shareDocumentViaWhatsApp({
      docType: "quote",
      docId: "side-7",
      phone: "0911",
      docNumber: "QT-SIDE-7",
      hiddenSections: ["account", "totals"],
      ttlHours: 24,
    });
    const body = lastFetchBody();
    expect(body).toMatchObject({
      doc_type: "quote",
      doc_id: "side-7",
      ttl_hours: 24,
      hidden_sections: ["account", "totals"],
    });
  });

  it("مرتجع: doc_type=return والعنوان الافتراضي 'مرتجع'", async () => {
    await shareDocumentViaWhatsApp({
      docType: "return", docId: "rt-1", phone: "0922",
      docNumber: "RT-001", total: 100, currency: "SDG",
    });
    expect(lastFetchBody()).toMatchObject({ doc_type: "return", doc_id: "rt-1" });
    const msg = openWhatsApp.mock.calls[0][1] as string;
    expect(msg).toContain("📄 مرتجع رقم: RT-001");
    expect(msg).toContain(SHARE_URL);
  });

  it("كشف حساب عميل ومورد: doc_type يُمرَّر كما هو، العنوان الافتراضي 'كشف حساب'", async () => {
    await shareDocumentViaWhatsApp({ docType: "statement-customer", docId: "c-1", docNumber: "C-1" });
    expect(lastFetchBody()).toMatchObject({ doc_type: "statement-customer", doc_id: "c-1" });
    expect((openWhatsApp.mock.calls[0][1] as string)).toContain("📄 كشف حساب رقم: C-1");

    openWhatsApp.mockClear();
    (globalThis.fetch as any).mockClear();
    await shareDocumentViaWhatsApp({ docType: "statement-supplier", docId: "s-1", docNumber: "S-1" });
    expect(lastFetchBody()).toMatchObject({ doc_type: "statement-supplier", doc_id: "s-1" });
    expect((openWhatsApp.mock.calls[0][1] as string)).toContain("📄 كشف حساب رقم: S-1");
  });

  it("تغليف فاتورة وعرض سعر: doc_type يُمرَّر كما هو، العنوان 'كشف تغليف'", async () => {
    await shareDocumentViaWhatsApp({ docType: "packaging-invoice", docId: "pi-1", docNumber: "PI-1" });
    expect(lastFetchBody()).toMatchObject({ doc_type: "packaging-invoice", doc_id: "pi-1" });
    expect((openWhatsApp.mock.calls[0][1] as string)).toContain("📄 كشف تغليف رقم: PI-1");

    openWhatsApp.mockClear();
    (globalThis.fetch as any).mockClear();
    await shareDocumentViaWhatsApp({ docType: "packaging-quote", docId: "pq-1", docNumber: "PQ-1" });
    expect(lastFetchBody()).toMatchObject({ doc_type: "packaging-quote", doc_id: "pq-1" });
  });

  it("الأصناف غير المتوفرة (فاتورة/عرض): doc_type يُمرَّر كما هو", async () => {
    await shareDocumentViaWhatsApp({ docType: "unavailable-invoice", docId: "ui-1" });
    expect(lastFetchBody()).toMatchObject({ doc_type: "unavailable-invoice", doc_id: "ui-1" });
    expect((openWhatsApp.mock.calls[0][1] as string)).toContain("📄 أصناف غير متوفّرة");

    openWhatsApp.mockClear();
    (globalThis.fetch as any).mockClear();
    await shareDocumentViaWhatsApp({ docType: "unavailable-quote", docId: "uq-1" });
    expect(lastFetchBody()).toMatchObject({ doc_type: "unavailable-quote", doc_id: "uq-1" });
  });

  it("يرسل Authorization Bearer وapikey في الرؤوس", async () => {
    await shareDocumentViaWhatsApp({ docType: "invoice", docId: "x" });
    const init = (globalThis.fetch as any).mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-abc");
    expect(headers.apikey).toBe("anon-key");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.method).toBe("POST");
  });

  it("يفشل بدون جلسة مسجَّلة: لا يستدعي fetch ولا يفتح واتساب", async () => {
    getSession.mockResolvedValueOnce({ data: { session: null } } as any);
    const url = await shareDocumentViaWhatsApp({ docType: "invoice", docId: "x" });
    expect(url).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(openWhatsApp).not.toHaveBeenCalled();
    expect(toastErr).toHaveBeenCalled();
  });

  it("عند فشل استجابة edge function: لا يفتح واتساب ويعرض toast خطأ", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "boom" }), { status: 500, headers: { "content-type": "application/json" } }),
      ),
    );
    const url = await shareDocumentViaWhatsApp({ docType: "invoice", docId: "x" });
    expect(url).toBeNull();
    expect(openWhatsApp).not.toHaveBeenCalled();
    expect(toastErr).toHaveBeenCalled();
  });

  it("ttlHours الافتراضي = 168 ساعة (7 أيام) عند عدم تمريره", async () => {
    await shareDocumentViaWhatsApp({ docType: "invoice", docId: "x" });
    expect(lastFetchBody().ttl_hours).toBe(168);
  });
});
