/**
 * تفاصيل التغليف المُدخَلة للفاتورة تظهر في المعاينة والطباعة.
 *
 * ## العطل كما بلّغ عنه المستخدم
 * أدخل تغليفاً للفاتورة INV-49417 (مُدخل واحد: نوع تغليف + صنف + عدد + قطع)،
 * ثم فتح المعاينة فقرأ **«لا توجد بيانات تغليف لهذه الفاتورة»**.
 *
 * ## السبب
 * التغليف مُخزَّنٌ في جدولين:
 *   `invoice_packaging`        → **ترويسة** تُنشئها الشاشة تلقائياً بمجرّد فتح
 *                                النافذة: `{ invoice_id, quantity: 1 }` وباقي
 *                                حقولها فارغة.
 *   `invoices_packaging_items` → **بنود المستخدم**: النوع والصنف وعدد الطرود
 *                                والقطع.
 *
 * وكانت الطباعة تقرأ الترويسة وحدها. فإن لم تكن الترويسة قد أُنشئت بعدُ قرأ
 * المستخدم «لا توجد بيانات»، وإن أُنشئت قرأ **«الكمية: 1»** — قيمة الترويسة
 * الفارغة لا تغليفه. وكلاهما خطأ.
 *
 * `dispatchReportPrint` كان يقرأ الجدولين معاً منذ البداية — فالعطل كان في
 * `printExtras` وحدها، وهي التي تغذّي المعاينة والطباعة و PDF ورابط العميل.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/** ردٌّ مُحاكى لكل جدول، بنفس شكل باني Supabase. */
function mockSupabase(byTable: Record<string, any[]>) {
  const seen: string[] = [];
  return {
    seen,
    client: {
      from(table: string) {
        seen.push(table);
        const rows = () => byTable[table] ?? [];
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          // جداول الأسماء تُقرأ باستعلامٍ مستقلّ — لا ربطاً داخل `select`
          in: (_c: string, ids: string[]) =>
            Promise.resolve({ data: rows().filter((r: any) => ids.includes(r.id)), error: null }),
          order: () => Promise.resolve({ data: rows(), error: null }),
          then: (res: any) => res({ data: rows(), error: null }),
        };
        return chain;
      },
    },
  };
}

/** الحالة الحيّة من لقطة المستخدم: ترويسة فارغة + بندٌ حقيقي واحد. */
const HEADER_EMPTY = [{
  quantity: 1, packs_count: null, pieces_per_pack: null,
  weight: null, dimensions: null, cost: null, notes: null, packaging_type_id: null,
}];
/** جداول الأسماء — تُقرأ بـ`.in("id", …)` كما في القاعدة الحيّة. */
const TYPES = [{ id: "pt-box", name: "كرتونة" }, { id: "pt-bag", name: "كيس" }];
const REAL_ITEM = [{
  product_name: "بطارية 125 سي جي / دايون صغير SUSUKAI جديدة",
  packs_count: 1, pieces_per_pack: 1, quantity: 1,
  description: null, packaging_type_id: "pt-box",
}];

describe("loadInvoiceExtras — البنود هي المصدر", () => {
  let loadInvoiceExtras: any, clearPrintExtrasCache: any;

  const setup = async (tables: Record<string, any[]>) => {
    vi.resetModules();
    const { client } = mockSupabase(tables);
    vi.doMock("@/integrations/supabase/client", () => ({ supabase: client }));
    const mod = await import("@/utils/printExtras");
    loadInvoiceExtras = mod.loadInvoiceExtras;
    clearPrintExtrasCache = mod.clearPrintExtrasCache;
    clearPrintExtrasCache();
  };

  afterEach(() => vi.doUnmock("@/integrations/supabase/client"));

  it("العطل المُبلَّغ: تغليفٌ مُدخَل ⇒ لا «لا توجد بيانات» ولا «الكمية: 1»", async () => {
    await setup({
      invoice_packaging: HEADER_EMPTY,
      invoices_packaging_items: REAL_ITEM,
      packaging_types: TYPES,
      invoice_transports: [],
    });
    const out = await loadInvoiceExtras("inv-49417");
    expect(out.packagingInfo).toBeTruthy();
    // الجدول: عمود «نوع التغليف» يجمع النوع واسم الصنف في خانةٍ واحدة
    expect(out.packagingInfo).toContain("نوع التغليف");
    expect(out.packagingInfo).toContain("كرتونة بطارية 125 سي جي");
    // قيمة الترويسة الفارغة لا تُعرض فوق تفصيلٍ أدقّ منها
    expect(out.packagingInfo).not.toBe("الكمية: 1");
  });

  it("يقرأ جدول البنود فعلاً — لا الترويسة وحدها", async () => {
    vi.resetModules();
    const { client, seen } = mockSupabase({
      invoice_packaging: HEADER_EMPTY,
      invoices_packaging_items: REAL_ITEM,
      packaging_types: TYPES,
      invoice_transports: [],
    });
    vi.doMock("@/integrations/supabase/client", () => ({ supabase: client }));
    const mod = await import("@/utils/printExtras");
    mod.clearPrintExtrasCache();
    await mod.loadInvoiceExtras("inv-49417");
    expect(seen).toContain("invoices_packaging_items");
  });

  it("ترويسةٌ فارغة بلا بنود ⇒ لا تُلوّث الصندوق بـ«الكمية: 1»", async () => {
    await setup({
      invoice_packaging: HEADER_EMPTY,
      invoices_packaging_items: [],
      invoice_transports: [],
    });
    const out = await loadInvoiceExtras("inv-empty");
    // الترويسة المُنشأة تلقائياً ليست تغليفاً — الصندوق يقول «لا توجد بيانات»
    expect(out.packagingInfo).toBeUndefined();
  });

  it("حقول المستند من الترويسة تُضاف بعد البنود حين تُملأ", async () => {
    await setup({
      invoice_packaging: [{ ...HEADER_EMPTY[0], weight: 12.5, dimensions: "40×30×20", cost: 5000 }],
      invoices_packaging_items: REAL_ITEM,
      packaging_types: TYPES,
      invoice_transports: [],
    });
    const out = await loadInvoiceExtras("inv-full");
    // حقول المستند سطرٌ تحت الجدول لا صفٌّ فيه
    expect(out.packagingInfo).toContain("الوزن: 12.5");
    expect(out.packagingInfo).toContain("الأبعاد: 40×30×20");
    expect(out.packagingInfo).toContain("الإجمالي:");
    // والترويسة لا تُضيف صفّاً فوق البند: صفُّ بندٍ واحد + صفُّ المجموع
    expect(out.packagingInfo!.match(/<tr[ >]/g)).toHaveLength(3);
  });

  it("بنودٌ متعدّدة ⇒ سطرٌ لكلٍّ منها", async () => {
    await setup({
      invoice_packaging: HEADER_EMPTY,
      invoices_packaging_items: [
        REAL_ITEM[0],
        { product_name: "زيت", packs_count: 2, pieces_per_pack: 6, quantity: 12, packaging_type_id: "pt-bag" },
      ],
      packaging_types: TYPES,
      invoice_transports: [],
    });
    const out = await loadInvoiceExtras("inv-multi");
    expect(out.packagingInfo).toContain("كيس زيت");
    // قطع الطرد تُذكر بعلامة «6X» الحمراء حين تتجاوز الواحدة
    expect(out.packagingInfo).toContain("6X");
    // صفّان للبندين + صفُّ الترويسة + صفُّ المجموع
    expect(out.packagingInfo!.match(/<tr[ >]/g)).toHaveLength(4);
  });
});

describe("الترحيل — سطرٌ بلا مرحّلٍ مسجَّل لا يختفي", () => {
  const setup = async (tables: Record<string, any[]>) => {
    vi.resetModules();
    const { client } = mockSupabase(tables);
    vi.doMock("@/integrations/supabase/client", () => ({ supabase: client }));
    const mod = await import("@/utils/printExtras");
    mod.clearPrintExtrasCache();
    return mod;
  };

  afterEach(() => vi.doUnmock("@/integrations/supabase/client"));

  it("مرحّلٌ مسجَّل: الاسم والهاتف والعنوان", async () => {
    const mod = await setup({
      invoice_transports: [{ transporter_id: "tr-1", destination_id: null }],
      transporters: [{ id: "tr-1", name: "مرحّل تجريبي", phone: "0912", address: "السوق" }],
      invoice_packaging: [], invoices_packaging_items: [],
    });
    const out = await mod.loadInvoiceExtras("i1");
    expect(out.transportInfo).toContain("الاسم: مرحّل تجريبي");
    // السطر الرئيسي يحمل الاسم والوجهة، والفرعي الهاتف والعنوان
    expect(out.transportInfo).toContain('class="tr-main"');
    expect(out.transportInfo).toContain("الهاتف: 0912");
  });

  it("بلا مرحّلٍ مسجَّل لكن بوجهة: الوجهة تُعرض بدل «لا توجد بيانات»", async () => {
    const mod = await setup({
      invoice_transports: [{ transporter_id: null, destination_id: "d-1" }],
      destinations: [{ id: "d-1", name: "بورتسودان" }],
      invoice_packaging: [], invoices_packaging_items: [],
    });
    const out = await mod.loadInvoiceExtras("i2");
    expect(out.transportInfo).toBe('<span class="tr-main">الوجهة: بورتسودان</span>');
  });

  it("سطرٌ بلا مرحّلٍ ولا وجهة يبقى متخطّى — لا سطر فارغ", async () => {
    const mod = await setup({
      invoice_transports: [{ transporter_id: null, destination_id: null }],
      invoice_packaging: [], invoices_packaging_items: [],
    });
    const out = await mod.loadInvoiceExtras("i3");
    expect(out.transportInfo).toBeUndefined();
  });
});

/**
 * حراسة بنيوية: القارئان — قالب التطبيق ودالّة الحافة — يقرآن جدول البنود.
 * أُصلح `dispatchReportPrint` منذ البداية وبقيت `printExtras`، فالعطل تكرّر
 * لأن القراءة مكتوبةٌ في ثلاثة مواضع.
 */
describe("لا قارئَ متروكاً يقرأ الترويسة وحدها", () => {
  it("printExtras يقرأ جدولَي البنود", () => {
    const src = read("src/utils/printExtras.ts");
    expect(src).toContain("invoices_packaging_items");
    expect(src).toContain("quotes_packaging_items");
  });

  it("دالّة الحافة (رابط العميل) تقرؤهما أيضاً", () => {
    const src = read("supabase/functions/document-share/index.ts");
    expect(src).toContain("invoices_packaging_items");
    expect(src).toContain("quotes_packaging_items");
  });

  it("والوجهة تُقرأ في الاثنين — فلا يختفي ترحيلٌ بلا مرحّل", () => {
    // القالب يقرؤها بالمعرّف ثم يركّب الاسم: الجدول بلا مفتاحٍ أجنبي فلا
    // يقدر PostgREST على ربطه — راجع `lookupJoin.ts` و`fkLessEmbeds.test.ts`.
    const app = read("src/utils/printExtras.ts");
    expect(app).toContain("destination_id");
    expect(app).toContain("DESTINATION_LOOKUP");
    // دالّة الحافة متروكةٌ مسارَ سقوطٍ للروابط القديمة ولا تُطوَّر — تبقى على
    // ربطها، ورابط العميل لا يمرّ بها أصلاً (دالّة القاعدة + قالب الطباعة).
    expect(read("supabase/functions/document-share/index.ts")).toContain("destinations(name)");
  });
});
