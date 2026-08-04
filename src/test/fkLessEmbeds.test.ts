/**
 * جداول التغليف والترحيل بلا مفاتيح أجنبية — فلا تُربَط داخل `select`.
 *
 * ## العطل كما بلّغ عنه صاحب المستودع (بلقطة شاشة)
 * صفحة معاينة الفاتورة تقول «لا توجد بيانات تغليف لهذه الفاتورة» و«لا توجد
 * بيانات ترحيل» — وهو قد أدخلهما ورآهما في نافذتهما.
 *
 * ## السبب
 * ليس في البيانات. الجداول الستّة (`invoices_packaging_items`،
 * `invoice_packaging`، `invoice_transports` ونظائرها في العروض) **بلا مفاتيح
 * أجنبية في القاعدة الحيّة** — يشهد بذلك `types.ts` المولَّد منها:
 * `Relationships: []`. والهجرة التي تُنشئها بمفاتيحها موجودةٌ في المستودع،
 * لكنّ الجدول الحيّ أُنشئ بمسارٍ آخر.
 *
 * وPostgREST لا يعرف ربطاً بلا مفتاح أجنبي: `packaging_types(name)` يردّ
 * `PGRST200`، والعميل يستخرج `data` فيجدها `null` **بلا رمي استثناء**. فلا
 * `catch` يلتقطه ولا سطرَ في السجلّ — قراءةٌ فاشلة تُقرأ «لا توجد بيانات».
 *
 * ## ما يحرسه هذا الملف
 *   1. أن الربط يتمّ في الواجهة (`attachLookups`) بنفس شكل ربط PostgREST.
 *   2. أن **لا موضع** في المشروع يعود إلى الربط في `select` على هذه الجداول —
 *      والمواضع كانت ثمانية، فالنمط يتكرّر بطبعه.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/* ─────────── 1) شهادة القاعدة نفسها ─────────── */

describe("القاعدة الحيّة: هذه الجداول بلا مفاتيح أجنبية", () => {
  const types = read("src/integrations/supabase/types.ts");

  /** هل الجدول معلَّمٌ في الأنواع المولَّدة بأنه بلا علاقات؟ */
  const hasNoRelationships = (table: string) => {
    const at = types.indexOf(`\n      ${table}: {\n        Row:`);
    if (at < 0) return null;
    const rel = types.indexOf("Relationships:", at);
    return types.slice(rel, rel + 20).includes("Relationships: []");
  };

  it.each([
    "invoices_packaging_items",
    "invoice_packaging",
    "invoice_transports",
    "quotes_packaging_items",
    "quotes_packaging",
    "quote_transports",
  ])("%s", (table) => {
    expect(hasNoRelationships(table)).toBe(true);
  });

  it("والأنواع تحمل علاقاتٍ فعلاً لجداولَ أخرى — فالقائمة أعلاه ليست نقصاً في التوليد", () => {
    expect(types).toMatch(/foreignKeyName: "customers_group_id_fkey"/);
  });
});

/* ─────────── 2) الربط في الواجهة ─────────── */

const rowsByTable: Record<string, any[]> = {
  packaging_types: [
    { id: "t1", name: "كرتونة" },
    { id: "t2", name: "كيس" },
  ],
  transporters: [{ id: "tr1", name: "شركة النقل السريع", phone: "0912345678", address: "السوق القديم" }],
  destinations: [{ id: "d1", name: "بنغازي" }],
  products: [{ id: "p1", name: "بطارية" }],
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: (_col: string, ids: string[]) => Promise.resolve({
          data: (rowsByTable[table] || []).filter((r) => ids.includes(r.id)),
          error: null,
        }),
      }),
    }),
  },
}));

describe("attachLookups — يركّب الأسماء بنفس شكل ربط PostgREST", () => {
  let attachLookups: any, PACKAGING_TYPE_LOOKUP: any, TRANSPORTER_LOOKUP: any, DESTINATION_LOOKUP: any;

  beforeEach(async () => {
    const mod = await import("@/utils/lookupJoin");
    attachLookups = mod.attachLookups;
    PACKAGING_TYPE_LOOKUP = mod.PACKAGING_TYPE_LOOKUP;
    TRANSPORTER_LOOKUP = mod.TRANSPORTER_LOOKUP;
    DESTINATION_LOOKUP = mod.DESTINATION_LOOKUP;
  });

  it("بند التغليف يقرأ نوعه من `row.packaging_types.name` كما لو كان ربطاً", async () => {
    const out = await attachLookups(
      [{ product_name: "بطارية", packaging_type_id: "t1", quantity: 6 }],
      [PACKAGING_TYPE_LOOKUP],
    );
    expect(out[0].packaging_types.name).toBe("كرتونة");
  });

  it("ونوعان مختلفان لا يختلطان", async () => {
    const out = await attachLookups(
      [{ packaging_type_id: "t1" }, { packaging_type_id: "t2" }],
      [PACKAGING_TYPE_LOOKUP],
    );
    expect(out.map((r: any) => r.packaging_types.name)).toEqual(["كرتونة", "كيس"]);
  });

  it("الترحيل يقرأ مرحّله ووجهته معاً", async () => {
    const out = await attachLookups(
      [{ transporter_id: "tr1", destination_id: "d1" }],
      [TRANSPORTER_LOOKUP, DESTINATION_LOOKUP],
    );
    expect(out[0].transporters).toMatchObject({ name: "شركة النقل السريع", phone: "0912345678" });
    expect(out[0].destinations.name).toBe("بنغازي");
  });

  it("المعرّف الغائب لا يُسقط الصف — بندٌ بلا نوعٍ يبقى ببياناته", async () => {
    const out = await attachLookups(
      [{ product_name: "بطارية", packaging_type_id: null, quantity: 4 }],
      [PACKAGING_TYPE_LOOKUP],
    );
    expect(out).toHaveLength(1);
    expect(out[0].packaging_types).toBeNull();
    expect(out[0].product_name).toBe("بطارية");
  });

  it("والمعرّف الذي لا صفَّ له يعود `null` لا يرمي", async () => {
    const out = await attachLookups([{ packaging_type_id: "مفقود" }], [PACKAGING_TYPE_LOOKUP]);
    expect(out[0].packaging_types).toBeNull();
  });

  it("لا يُعدَّل ما جاء من الكاش — يعمل على نسخة", async () => {
    const original = [{ packaging_type_id: "t1" }];
    await attachLookups(original, [PACKAGING_TYPE_LOOKUP]);
    expect((original[0] as any).packaging_types).toBeUndefined();
  });

  it("قائمةٌ فارغة لا تُطلق استعلاماً", async () => {
    expect(await attachLookups([], [PACKAGING_TYPE_LOOKUP])).toEqual([]);
    expect(await attachLookups(null, [PACKAGING_TYPE_LOOKUP])).toEqual([]);
  });
});

/* ─────────── 3) الحراسة البنيوية ─────────── */

/**
 * لا `select` في المشروع كلّه يطلب ربطاً على جدولٍ بلا مفاتيح أجنبية.
 *
 * المواضع كانت ثمانية موزّعة على معاينة الطباعة وصفحتَي التغليف وصفحتَي
 * الترحيل ونافذة الترحيل وكشف الترحيلات ولوحة الجاهز للشحن — أُصلح موضعٌ
 * واحدٌ منها مرّةً وبقيت السبعة، وهذا ما جعل العطل يعود.
 */
describe("لا ربطَ داخل select على جدولٍ بلا مفاتيح", () => {
  const FILES = [
    "src/utils/printExtras.ts",
    "src/utils/dispatchReportPrint.ts",
    "src/pages/InvoicePackagingPage.tsx",
    "src/pages/QuotePackagingPage.tsx",
    "src/pages/InvoiceTransportPage.tsx",
    "src/pages/QuoteTransportPage.tsx",
    "src/components/transport/TransportDialog.tsx",
    "src/components/dispatch/ReadyToShipPanel.tsx",
  ];
  /** أسماء الجداول المرجعية التي كانت تُطلب ربطاً */
  const EMBEDS = ["packaging_types(", "transporters(", "destinations(", "products("];
  /** الجداول التي لا يعرف PostgREST لها ربطاً */
  const FK_LESS = [
    "invoices_packaging_items",
    "invoice_packaging",
    "invoice_transports",
    "quotes_packaging_items",
    "quotes_packaging",
    "quote_transports",
  ];

  /**
   * الفحص مقيّدٌ بجدولٍ بعينه: `invoice_items` **له** مفتاحٌ إلى `products`،
   * فربطه مشروع. المنع على الجداول الستّة وحدها.
   */
  const embedsOnFkLessTable = (src: string): string[] => {
    const found: string[] = [];
    for (const table of FK_LESS) {
      const re = new RegExp(`from\\(\\s*["'\`]${table}["'\`]\\s*\\)`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        // نافذةٌ تكفي `.select(...)` التالي مهما التفّ على أسطر
        const window = src.slice(m.index, m.index + 400);
        const sel = window.match(/\.select\(([\s\S]*?)\)/);
        if (!sel) continue;
        if (EMBEDS.some((e) => sel[1].includes(e))) found.push(`${table}: ${sel[0].slice(0, 120)}`);
      }
    }
    return found;
  };

  it.each(FILES)("%s", (file) => {
    expect(embedsOnFkLessTable(read(file))).toEqual([]);
  });

  it("والمشروع كلّه — لا هذه الملفات وحدها", () => {
    const all = fs
      .readdirSync(path.resolve(process.cwd(), "src"), { recursive: true, encoding: "utf8" })
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("test"))
      .map((f) => path.join("src", f));
    const offenders = all.flatMap((f) => {
      const full = path.resolve(process.cwd(), f);
      if (!fs.statSync(full).isFile()) return [];
      return embedsOnFkLessTable(fs.readFileSync(full, "utf8")).map((o) => `${f} → ${o}`);
    });
    expect(offenders).toEqual([]);
  });

  it("والملفات الثمانية تستعمل المصدر الواحد للربط", () => {
    const missing = FILES.filter((f) => !read(f).includes("attachLookups"));
    expect(missing).toEqual([]);
  });
});

/**
 * القراءة الفاشلة تُذكر.
 *
 * أصل العطل أن `{ data }` تُستخرج وحدها: PostgREST لا يرمي، بل يردّ خطأً في
 * `error` و`data: null`. فبقي شهوراً بلا سطرٍ واحد في السجلّ.
 */
describe("لا قراءةَ فاشلة صامتة في مسار الطباعة", () => {
  it("`printExtras` يسجّل خطأ كل استعلام", () => {
    const src = read("src/utils/printExtras.ts");
    expect(src).toContain("reportQueryErrors");
    expect(src).toMatch(/reportQueryErrors\("loadInvoiceExtras"/);
    expect(src).toMatch(/reportQueryErrors\("loadQuoteExtras"/);
  });
});
