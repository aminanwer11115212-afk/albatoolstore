/**
 * منطقة الخطر (Ctrl+Shift+9) — النافذةُ نفسُها لا دوالُّها.
 *
 * طلبه صاحبُ المستودع: «راجع الـdanger zone، هناك أكثر من ٧ أخطاء ورسائل
 * تنبيهية تظهر».
 *
 * ## ولمَ تُشغَّل النافذةُ فعلاً
 * فحصُ `wipeTable` يقول إنّ **الحذف** صحيح. وهذا الملفّ يسأل سؤالاً آخر: ماذا
 * يرى المستخدم؟ فالأخطاء التي يشكو منها لا تظهر في دالّةٍ منعزلة — تظهر حين
 * تُفتح النافذة وتُعدّ الجداولُ وتُصدَّر النسخةُ ويُضغط الزرّ.
 *
 * فتُركَّب النافذةُ ويُضغط الاختصارُ حقيقةً، ومعها **مزدوجٌ يتصرّف كـPostgREST
 * لا كما نتمنّى**: يُرجع `{ error }` ولا يرمي أبداً. وهذا وحده يكشف عطلين
 * كان `try/catch` يُخفيهما.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/* ═══════════ المزدوجات ═══════════ */

const toasts: Array<{ kind: string; msg: string; desc?: string }> = [];
const push = (kind: string) => (m: any, o?: any) =>
  { toasts.push({ kind, msg: String(m), desc: o?.description ? String(o.description) : undefined }); };
vi.mock("sonner", () => ({
  toast: {
    error: (m: any, o?: any) => push("error")(m, o),
    success: (m: any, o?: any) => push("success")(m, o),
    info: (m: any, o?: any) => push("info")(m, o),
    message: (m: any, o?: any) => push("message")(m, o),
  },
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true, loading: false, role: "admin", permissions: {} }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.c" }, loading: false }),
}));

/**
 * جداولُ ترفضها سياسةُ الصفوف للقراءة. وPostgREST لا يرمي: يُرجع
 * `{ data: null, count: null, error }`. وهذا هو بيت القصيد.
 */
const DENIED_READ = new Set<string>();
/** جداولُ ترفض سياستُها الحذفَ بخطأٍ صريح — لاختبار الانقطاع في المنتصف. */
const DENY_DELETE = new Set<string>();
const ROWS: Record<string, number> = {};
const calls: string[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const denied = () => ({
      data: null, count: null,
      error: { code: "42501", message: `permission denied for table ${table}` },
    });
    const api: any = {
      select: (_c: string, opts?: any) => {
        calls.push(`select:${table}${opts?.head ? ":head" : ""}`);
        const res = DENIED_READ.has(table)
          ? denied()
          : { data: Array.from({ length: ROWS[table] ?? 0 }, (_, i) => ({ id: `${table}-${i}` })),
              count: ROWS[table] ?? 0, error: null };
        const p: any = Promise.resolve(res);
        p.limit = () => Promise.resolve(res);
        return p;
      },
      insert: () => { calls.push(`insert:${table}`); return Promise.resolve({ error: null }); },
      delete: () => {
        const run = () => {
          calls.push(`delete:${table}`);
          if (DENY_DELETE.has(table)) {
            return Promise.resolve({ error: { code: "42501", message: `permission denied for table ${table}` } });
          }
          ROWS[table] = 0;
          return Promise.resolve({ error: null });
        };
        return { not: run, gte: run };
      },
    };
    return api;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: (name: string) => { calls.push(`rpc:${name}`); return Promise.resolve({ data: { ok: true }, error: null }); },
    },
  };
});

import HiddenDevResetDialog from "@/components/HiddenDevResetDialog";

/* ═══════════ تركيبٌ وفتحٌ بالاختصار ═══════════ */

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(HiddenDevResetDialog)),
  );
}

/** يضغط Ctrl+Shift+9 على النافذة كما يضغطه المستخدم. */
function pressShortcut() {
  fireEvent.keyDown(window, { key: "9", code: "Digit9", ctrlKey: true, shiftKey: true });
}

beforeEach(() => {
  toasts.length = 0; calls.length = 0;
  DENIED_READ.clear(); DENY_DELETE.clear();
  for (const k of Object.keys(ROWS)) delete ROWS[k];
  Object.assign(ROWS, {
    transporters: 4, customer_transporters: 7, customer_preferred_transporter: 2,
    destination_transporters: 3, locality_transporters: 5,
    invoice_transports: 9, invoices_transports_items: 11, quote_transports: 1,
  });
  // التنزيل والتأكيد — لا نريد نوافذ نظامٍ في jsdom
  (globalThis as any).URL.createObjectURL = () => "blob:x";
  (globalThis as any).URL.revokeObjectURL = () => {};
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/* ═══════════ ١) الاختصارُ يفتح النافذة ═══════════ */

describe("الاختصار", () => {
  it("Ctrl+Shift+9 يفتح النافذة", async () => {
    mount();
    expect(screen.queryByText(/أداة مطوّر مخفية/)).toBeNull();
    pressShortcut();
    expect(await screen.findByText(/أداة مطوّر مخفية/)).toBeTruthy();
  });

  it("ولا تُفتح بلا الاختصار كاملاً", () => {
    mount();
    fireEvent.keyDown(window, { key: "9", code: "Digit9", ctrlKey: true });   // بلا Shift
    expect(screen.queryByText(/أداة مطوّر مخفية/)).toBeNull();
  });
});

/* ═══════════ ٢) معاينةُ العدّ — العطل الذي يراه المستخدم ═══════════ */

describe("معاينة ما سيُمسّ", () => {
  const selectTransporters = async () => {
    mount();
    pressShortcut();
    await screen.findByText(/أداة مطوّر مخفية/);
    fireEvent.click(screen.getByText(/حذف كل الناقلين وسجلات الترحيل/));
  };

  it("تعرض عددَ صفوف كل جدول", async () => {
    await selectTransporters();
    await waitFor(() => expect(screen.getByText("transporters")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("11")).toBeTruthy());   // invoices_transports_items
  });

  /**
   * **العطل**: `catch` لا يقع أبداً — PostgREST لا يرمي. فجدولٌ تمنع سياستُه
   * القراءةَ يُرجع `count: null`، و`count ?? 0` يجعله **صفراً**.
   *
   * فتقول المعاينةُ «لا شيء هنا» عن جدولٍ لم تستطع قراءته — وفرعُ «؟» في
   * الواجهة لا يُبلغ أبداً. وهذا أخطر ما في أداةٍ كلُّ غرضها أن يرى المستخدمُ
   * ما سيُمحى قبل أن يمحوه.
   */
  it("وجدولٌ تعذّرت قراءتُه لا يُعرض صفراً — الصفرُ يعني «فارغ» لا «لا أعرف»", async () => {
    DENIED_READ.add("customer_transporters");
    await selectTransporters();
    await waitFor(() => expect(screen.getByText("transporters")).toBeTruthy());

    /* الاسمُ يظهر مرّتين بعد الإصلاح: في الشبكة وفي شريط التنبيه. فيُؤخذ
       صفُّ الشبكة وحده — وهو الذي يحمل الرقم. */
    const cell = screen.getAllByText("customer_transporters")
      .find((el) => el.classList.contains("font-mono") && el.classList.contains("truncate"))!;
    const row = cell.parentElement!;
    expect(row.textContent, "عُرض صفرٌ عن جدولٍ لم يُقرأ").not.toMatch(/\b0\b/);
    expect(row.textContent).toContain("؟");
  });

  it("ويُنبَّه المستخدمُ أنّ في المعاينة ما لم يُقرأ", async () => {
    DENIED_READ.add("locality_transporters");
    await selectTransporters();
    await waitFor(() => expect(screen.getByText("transporters")).toBeTruthy());
    expect(screen.getByText(/تعذّرت قراءة/)).toBeTruthy();
  });
});

/* ═══════════ ٣) النسخةُ الاحتياطية تحرس الحذف ═══════════ */

describe("النسخة الاحتياطية", () => {
  const openAndArm = async () => {
    mount();
    pressShortcut();
    await screen.findByText(/أداة مطوّر مخفية/);
    fireEvent.click(screen.getByText(/حذف كل الناقلين وسجلات الترحيل/));
    await waitFor(() => expect(screen.getByText("transporters")).toBeTruthy());
    // عبارةُ المرور تُقرأ من الشاشة لا تُخمَّن
    const label = screen.getByText(/اكتب عبارة المرور/).textContent || "";
    const phrase = /([^\s]+-\d{4})/.exec(label)![1];
    fireEvent.change(screen.getByPlaceholderText(phrase), { target: { value: phrase } });
    return phrase;
  };

  it("فشلُ النسخة يمنع الحذف — والجداولُ تبقى", async () => {
    DENIED_READ.add("quote_transports");        // يفشل تصديرُه
    await openAndArm();
    fireEvent.click(screen.getByText("تنفيذ الآن"));

    await waitFor(() => expect(toasts.some((t) => /أُلغي الحذف/.test(t.msg))).toBe(true));
    expect(calls.filter((c) => c.startsWith("delete:")), "حُذف شيءٌ رغم فشل النسخة").toEqual([]);
    expect(ROWS.transporters).toBe(4);
  });

  /**
   * ملفٌّ واحد لا ملفٌّ لكل جدول: المتصفّحات تحجب التنزيلَ التلقائي بعد
   * الأوّل، ومن رفض الإذنَ مرّةً تسقط بقيةُ الملفّات صامتةً — والحلقةُ تعدّها
   * ناجحةً. فتمضي الأداةُ إلى حذفٍ لا رجعةَ فيه على ثقةِ نسخةٍ لا وجود لها.
   */
  it("تُنزَّل ملفّاً واحداً — لا ملفّاً لكل جدول يحجبه المتصفّح", async () => {
    const clicks: string[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: any) => {
      const el = realCreate(tag);
      if (tag === "a") el.click = () => { clicks.push((el as HTMLAnchorElement).download); };
      return el;
    });

    await openAndArm();
    fireEvent.click(screen.getByText("تنفيذ الآن"));
    await waitFor(() => expect(toasts.some((t) => /تم التنفيذ بنجاح/.test(t.msg))).toBe(true), { timeout: 4000 });

    expect(clicks.length, "أكثرُ من تنزيلٍ — يُحجب ما بعد الأوّل").toBe(1);
    expect(clicks[0]).toMatch(/^albatool-backup_.*\.csv$/);
    expect(toasts.some((t) => /نسخة احتياطية واحدة تضم 8 جدول/.test(t.msg))).toBe(true);
  });

  it("ونجاحُها يُمضي الحذفَ على جداول الترحيل كلّها", async () => {
    await openAndArm();
    fireEvent.click(screen.getByText("تنفيذ الآن"));

    await waitFor(() => expect(toasts.some((t) => /تم التنفيذ بنجاح/.test(t.msg))).toBe(true), { timeout: 4000 });
    const deleted = calls.filter((c) => c.startsWith("delete:")).map((c) => c.slice(7)).sort();
    expect(deleted).toEqual([
      "customer_preferred_transporter", "customer_transporters", "destination_transporters",
      "invoice_transports", "invoices_transports_items", "locality_transporters",
      "quote_transports", "transporters",
    ]);
  });
});

/* ═══════════ ٣-ب) الفشلُ في المنتصف يُقال بأسمائه ═══════════ */

describe("انقطاعُ الحذف في منتصفه", () => {
  /**
   * العمليةُ ليست ذرّية: تُمسح الجداولُ واحداً بعد واحد. فإن رفض أحدُها
   * بقي ما قبله محذوفاً. وقولُ «تعذّر التنفيذ» وحدَه يُقرأ «لم يحدث شيء» —
   * وهو أخطرُ ما يُقال عن حذفٍ وقع بعضُه.
   */
  it("يُذكر ما مُسح قبل التوقّف بأسمائه", async () => {
    DENY_DELETE.add("customer_transporters");
    mount();
    pressShortcut();
    await screen.findByText(/أداة مطوّر مخفية/);
    fireEvent.click(screen.getByText(/حذف كل الناقلين وسجلات الترحيل/));
    await waitFor(() => expect(screen.getByText("transporters")).toBeTruthy());
    const label = screen.getByText(/اكتب عبارة المرور/).textContent || "";
    const phrase = /([^\s]+-\d{4})/.exec(label)![1];
    fireEvent.change(screen.getByPlaceholderText(phrase), { target: { value: phrase } });
    fireEvent.click(screen.getByText("تنفيذ الآن"));

    await waitFor(() => expect(toasts.some((t) => t.kind === "error")).toBe(true), { timeout: 4000 });
    const err = toasts.find((t) => t.kind === "error")!;
    /* ترتيبُ المسح: invoices_transports_items، invoice_transports،
       quote_transports، customer_preferred_transporter، ثمّ الرافض. فأربعةٌ
       مُسحت قبله — والعددُ يُقرأ من الترتيب لا يُخمَّن. */
    expect(err.desc, "لم يُذكر ما مُسح قبل التوقّف").toMatch(/مُسحت 4 جدول/);
    expect(err.desc).toContain("invoices_transports_items");
    expect(err.desc).not.toContain("locality_transporters");   // لم يُبلَغ أصلاً
  });
});

/* ═══════════ ٤) سجلُّ التدقيق وعدٌ لا زينة ═══════════ */

describe("سجل التدقيق", () => {
  /**
   * النافذةُ تَعِد في صدرها: «كل تنفيذ يُوثَّق في سجل التدقيق». وكان فشلُ
   * الكتابة يُبتلع بـ`console.warn` — فيُعلَن النجاحُ ولا سجلَّ له.
   */
  it("يُكتب بعد التنفيذ", async () => {
    mount();
    pressShortcut();
    await screen.findByText(/أداة مطوّر مخفية/);
    fireEvent.click(screen.getByText(/سجل نشاط كشوفات الحسابات/));
    await waitFor(() => expect(screen.getByText("activity_log")).toBeTruthy());
    const label = screen.getByText(/اكتب عبارة المرور/).textContent || "";
    const phrase = /([^\s]+-\d{4})/.exec(label)![1];
    fireEvent.change(screen.getByPlaceholderText(phrase), { target: { value: phrase } });
    fireEvent.click(screen.getByText("تنفيذ الآن"));

    await waitFor(() => expect(toasts.some((t) => /تم التنفيذ بنجاح/.test(t.msg))).toBe(true), { timeout: 4000 });
    expect(calls).toContain("insert:bot_audit_log");
  });

  it("وتعذُّرُه يُقال للمستخدم لا يُبتلع في الكونسول", () => {
    const src = require("node:fs").readFileSync("src/components/HiddenDevResetDialog.tsx", "utf8");
    const fn = src.slice(src.indexOf("const logAudit"), src.indexOf("const run = async"));
    expect(fn, "فشلُ السجلّ يُبتلع صامتاً").toMatch(/toast\.(error|warning)/);
  });
});

/* ═══════════ ٥) البوّابة ═══════════ */

describe("البوّابة", () => {
  it("زرُّ التنفيذ مقفولٌ قبل كتابة العبارة", async () => {
    mount();
    pressShortcut();
    await screen.findByText(/أداة مطوّر مخفية/);
    fireEvent.click(screen.getByText(/سجل نشاط كشوفات الحسابات/));
    expect((screen.getByText("تنفيذ الآن").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("ومقفولٌ بلا اختيارِ شيء", async () => {
    mount();
    pressShortcut();
    await screen.findByText(/أداة مطوّر مخفية/);
    expect((screen.getByText("تنفيذ الآن").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
