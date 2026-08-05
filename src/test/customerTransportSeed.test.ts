/**
 * المرحّل والوجهة المسجَّلان في جدول العملاء يصلان تفاصيل الفاتورة.
 *
 * ## العطل كما وصفه صاحب المستودع
 * «عند اضافة ترحيل ووجهة من جدول العملاء لزبون، تلقائي يظهر في تفاصيل
 * الفاتورة». وكان لا يظهر: يُسجَّل للعميل ثم تُنشأ فاتورته فتخرج ورقتُها بلا
 * ترحيل.
 *
 * ## والسبب
 * `loadInvoiceExtras` لا تقرأ إلا `invoice_transports`، وهذا الجدول لا يُكتب
 * فيه شيء ما لم يفتح المستخدم نافذة الترحيل ويحفظ. فالبيانات عند العميل ولا
 * تصل فاتورته.
 *
 * ## ولماذا الكتابةُ عند الحفظ لا السقوطُ عند القراءة
 * أسهلُ إصلاحٍ أن تسقط القراءة إلى افتراضيات العميل حين تجد الجدول فارغاً.
 * لكنّ ورقة العميل لا تمرّ بها: تقرأ ترحيلها من `get_shared_document` — دالّةُ
 * قاعدةٍ لا تعرف هذا السقوط، ولا يملك التوكن العامّ قراءة
 * `customer_preferred_transporter` أصلاً. فتفترق الورقتان: ترحيلٌ في المعاينة
 * وفراغٌ عند العميل، وهو ما تمنعه «قاعدة الورقة الواحدة».
 *
 * فالبذرُ عند الحفظ يجعلها بياناً واحداً يقرؤه الجميع.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, any>;

const db: Record<string, Row[]> = {};
const inserts: Array<{ table: string; payload: any }> = [];
/** أخطاءٌ تُحقن لفحص المسارات الفاشلة: `table:op` → خطأ */
const failures: Record<string, any> = {};

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    let rows = () => db[table] || [];
    const filters: Array<(r: Row) => boolean> = [];
    const result = () => {
      const err = failures[`${table}:select`];
      if (err) return Promise.resolve({ data: null, error: err });
      return Promise.resolve({ data: rows().filter((r) => filters.every((f) => f(r))), error: null });
    };
    const chain: any = {
      select: () => chain,
      eq: (col: string, val: any) => {
        filters.push((r) => r[col] === val);
        return chain;
      },
      limit: () => result(),
      maybeSingle: () =>
        result().then((res: any) => ({ data: (res.data || [])[0] ?? null, error: res.error })),
      insert: (payload: any) => {
        const err = failures[`${table}:insert`];
        if (err) return Promise.resolve({ data: null, error: err });
        inserts.push({ table, payload });
        (db[table] = db[table] || []).push(payload);
        return Promise.resolve({ data: [payload], error: null });
      },
      then: (ok: any, no?: any) => result().then(ok, no),
    };
    return chain;
  };
  return { supabase: { from: (t: string) => makeChain(t) } };
});

import { seedTransportFromCustomerDefaults } from "@/utils/customerTransportDefaults";

const CUST = "cust-1";
const INV = "inv-1";

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  for (const k of Object.keys(failures)) delete failures[k];
  inserts.length = 0;
  db.invoice_transports = [];
  db.quote_transports = [];
  db.customer_destinations = [];
  db.customer_preferred_transporter = [];
});

/** يسجّل للعميل مرحّلاً ووجهةً افتراضية كما تفعل شاشة العملاء. */
function giveCustomerDefaults(opts: { transporter?: string; destination?: string } = {}) {
  if (opts.transporter) {
    db.customer_preferred_transporter.push({ customer_id: CUST, transporter_id: opts.transporter });
  }
  if (opts.destination) {
    db.customer_destinations.push({ customer_id: CUST, destination_id: opts.destination, is_default: true });
  }
}

/* ─────────── ١) الحالة التي شكا منها ─────────── */

describe("فاتورةٌ جديدة لعميلٍ له ترحيلٌ مسجَّل", () => {
  it("تأخذ المرحّل والوجهة", async () => {
    giveCustomerDefaults({ transporter: "tr-1", destination: "dst-1" });
    const res = await seedTransportFromCustomerDefaults("invoice", INV, CUST);
    expect(res.seeded).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("invoice_transports");
    expect(inserts[0].payload).toEqual({
      invoice_id: INV,
      transporter_id: "tr-1",
      destination_id: "dst-1",
    });
  });

  it("والوجهةُ وحدها تكفي — الوجهة معلومةٌ تنفع العميل بلا مرحّل", async () => {
    giveCustomerDefaults({ destination: "dst-1" });
    const res = await seedTransportFromCustomerDefaults("invoice", INV, CUST);
    expect(res.seeded).toBe(true);
    expect(inserts[0].payload.transporter_id).toBeNull();
    expect(inserts[0].payload.destination_id).toBe("dst-1");
  });

  it("والمرحّلُ وحده كذلك", async () => {
    giveCustomerDefaults({ transporter: "tr-1" });
    const res = await seedTransportFromCustomerDefaults("invoice", INV, CUST);
    expect(res.seeded).toBe(true);
    expect(inserts[0].payload.transporter_id).toBe("tr-1");
    expect(inserts[0].payload.destination_id).toBeNull();
  });

  it("وعروضُ السعر بنفس القاعدة وبجدولها", async () => {
    giveCustomerDefaults({ transporter: "tr-1" });
    const res = await seedTransportFromCustomerDefaults("quote", "q-1", CUST);
    expect(res.seeded).toBe(true);
    expect(inserts[0].table).toBe("quote_transports");
    expect(inserts[0].payload.quote_id).toBe("q-1");
  });
});

/* ─────────── ٢) الحارس الأوّل: لا يُكتب فوق قرارٍ قائم ─────────── */

/**
 * صفٌّ في الجدول يعني أن أحداً قرّر، ولو تركه فارغاً. فمن حذف المرحّل من
 * فاتورةٍ بعينها لا يُعاد إليه عند كل حفظ.
 */
describe("لا يُكتب فوق ترحيلٍ قائم", () => {
  it("فاتورةٌ لها ترحيلٌ محفوظ لا تُمَسّ", async () => {
    giveCustomerDefaults({ transporter: "tr-1", destination: "dst-1" });
    db.invoice_transports.push({ id: "t-existing", invoice_id: INV, transporter_id: "tr-9" });
    const res = await seedTransportFromCustomerDefaults("invoice", INV, CUST);
    expect(res).toEqual({ seeded: false, reason: "already-set" });
    expect(inserts).toHaveLength(0);
  });

  it("ولو كان الصفُّ القائم فارغَ الحقلين — الفراغُ قرارٌ أيضاً", async () => {
    giveCustomerDefaults({ transporter: "tr-1" });
    db.invoice_transports.push({ id: "t-empty", invoice_id: INV, transporter_id: null, destination_id: null });
    const res = await seedTransportFromCustomerDefaults("invoice", INV, CUST);
    expect(res.seeded).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it("وترحيلُ فاتورةٍ أخرى لا يمنع البذر", async () => {
    giveCustomerDefaults({ transporter: "tr-1" });
    db.invoice_transports.push({ id: "t-other", invoice_id: "inv-other", transporter_id: "tr-9" });
    const res = await seedTransportFromCustomerDefaults("invoice", INV, CUST);
    expect(res.seeded).toBe(true);
  });

  /**
   * القراءة الفاشلة لا تُقرأ «فارغاً»: لو رفضت السياسة القراءة لكتبنا صفّاً
   * فوق ترحيلٍ قائمٍ لا نراه. فعند الخطأ نمتنع.
   */
  it("وقراءةٌ فاشلة تمنع البذر ولا تُقرأ فراغاً", async () => {
    giveCustomerDefaults({ transporter: "tr-1" });
    failures["invoice_transports:select"] = { message: "RLS" };
    const res = await seedTransportFromCustomerDefaults("invoice", INV, CUST);
    expect(res.seeded).toBe(false);
    expect(inserts).toHaveLength(0);
  });
});

/* ─────────── ٣) الحارس الثاني: لا صفَّ فارغاً ─────────── */

describe("عميلٌ بلا افتراضيات يبقى بلا ترحيل", () => {
  it("لا يُكتب صفٌّ لا يحمل شيئاً", async () => {
    const res = await seedTransportFromCustomerDefaults("invoice", INV, CUST);
    expect(res).toEqual({ seeded: false, reason: "no-defaults" });
    expect(inserts).toHaveLength(0);
  });

  it("ووجهةٌ غيرُ افتراضية لا تُبذر — الاختيار للمستخدم", async () => {
    db.customer_destinations.push({ customer_id: CUST, destination_id: "dst-2", is_default: false });
    const res = await seedTransportFromCustomerDefaults("invoice", INV, CUST);
    expect(res.seeded).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it("وافتراضياتُ عميلٍ آخر لا تُبذر هنا", async () => {
    db.customer_preferred_transporter.push({ customer_id: "cust-9", transporter_id: "tr-9" });
    const res = await seedTransportFromCustomerDefaults("invoice", INV, CUST);
    expect(res.seeded).toBe(false);
  });
});

/* ─────────── ٤) لا يُسقِط حفظ الفاتورة ─────────── */

/**
 * الفاتورة هي الأصل والترحيل تكملةٌ تُستدرك من نافذتها. فلا يرمي البذر أبداً:
 * فشلُه يُذكر في السجلّ ويُعاد `seeded:false` — لا استثناءٌ يُبطل حفظاً نجح.
 */
describe("الفشل لا يرمي", () => {
  it("فشلُ الكتابة يُعاد قيمةً لا استثناءً", async () => {
    giveCustomerDefaults({ transporter: "tr-1" });
    failures["invoice_transports:insert"] = { message: "denied" };
    const res = await seedTransportFromCustomerDefaults("invoice", INV, CUST);
    expect(res).toEqual({ seeded: false, reason: "insert-failed" });
  });

  it("وبلا معرّفاتٍ يخرج بلا استعلام", async () => {
    expect(await seedTransportFromCustomerDefaults("invoice", null, CUST))
      .toEqual({ seeded: false, reason: "no-ids" });
    expect(await seedTransportFromCustomerDefaults("invoice", INV, null))
      .toEqual({ seeded: false, reason: "no-ids" });
    expect(inserts).toHaveLength(0);
  });
});

/* ─────────── ٥) وتصل الورقة فعلاً ─────────── */

/**
 * البذرُ لا يُقاس بصفٍّ في جدول بل بسطرٍ في الورقة: هذا ما طلبه صاحب المستودع.
 * فالمسار يُقطع كاملاً — بذرٌ ثم قراءةٌ ثم تنسيقُ الورقة.
 */
describe("المسار كاملاً: من جدول العملاء إلى سطر الورقة", () => {
  it("الوجهة والمرحّل يظهران في تفاصيل الفاتورة", async () => {
    const { formatTransports } = await import("@/utils/printExtras");
    giveCustomerDefaults({ transporter: "tr-1", destination: "dst-1" });
    await seedTransportFromCustomerDefaults("invoice", INV, CUST);

    // ما كُتب في الجدول، مربوطاً بأسمائه كما تفعل `attachLookups`
    const seeded = db.invoice_transports.find((r) => r.invoice_id === INV)!;
    const html = formatTransports([
      {
        ...seeded,
        transporters: { name: "شركة النقل السريع", phone: "0900", address: "أم درمان" },
        destinations: { name: "بورتسودان" },
      },
    ]);
    expect(html).toBeDefined();
    expect(html).toContain("الاسم: شركة النقل السريع");
    expect(html).toContain("الوجهة: بورتسودان");
  });

  it("وبلا بذرٍ لا سطرَ ترحيلٍ أصلاً — وهو العطل بعينه", async () => {
    const { formatTransports } = await import("@/utils/printExtras");
    // عميلٌ بلا افتراضيات: الجدول يبقى فارغاً فلا ترحيل
    await seedTransportFromCustomerDefaults("invoice", INV, CUST);
    expect(db.invoice_transports.filter((r) => r.invoice_id === INV)).toHaveLength(0);
    expect(formatTransports([])).toBeUndefined();
  });
});
