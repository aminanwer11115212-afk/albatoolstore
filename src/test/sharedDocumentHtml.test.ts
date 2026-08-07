/**
 * ورقة العميل تُبنى في المتصفّح بنفس قالب الطباعة.
 *
 * ## لماذا
 * مجلد `supabase/functions` لا يُعدَّل من المستودع في هذا المشروع، فبقي رابط
 * العميل على نسخةٍ أقدم من التطبيق ولا سبيل لتحديثه — ومعه قالبٌ ثانٍ يُحرَس
 * بعقدٍ واختبارات كي لا ينحرف.
 *
 * الآن تقرأ الصفحة بياناتها من `get_shared_document` وتبني الورقة بـ
 * `generatePrintHTML` **نفسها**. فالتطابق صار بنيوياً لا تعاقدياً: قالبٌ واحد
 * لا نسختان. وهذا ما تفحصه هذه الاختبارات — بمقارنة ناتج الرابط بناتج
 * المعاينة حرفياً للمدخلات نفسها.
 */
import { describe, it, expect } from "vitest";
import { buildSharedDocumentHTML, SharedDocumentError } from "@/utils/sharedDocumentHtml";
import { generatePrintHTML } from "@/utils/printTemplate";

const payload = (over: Record<string, any> = {}) => ({
  doc_type: "invoice" as const,
  hidden_sections: [],
  doc: {
    invoice_number: "INV-49417", date: "2026-08-02", type: "regular",
    subtotal: 200_000, discount: 0, shipping: 0, total: 200_000, paid_amount: 0,
    notes: null, status: "pending", payment_method: "cash",
  },
  items: [{ product_name: "بطارية", quantity: 10, unit_price: 20_000, discount: 0, total: 200_000 }],
  customer: { name: "عميل تجريبي تبع مينا", phone: "0909605576", address: "سوق البسطة" },
  company: { company_name: "شركة البتول" },
  packaging: [],
  packaging_items: [],
  transports: [],
  prev_net: 200_000,
  current_net: 400_000,
  ...over,
});

describe("الورقة تُبنى بقالب الطباعة نفسه", () => {
  const html = buildSharedDocumentHTML(payload());

  it("الترويسة والبنود والملخّص كلّها حاضرة", () => {
    expect(html).toContain("INV-49417");
    expect(html).toContain("بطارية");
    expect(html).toContain("عميل تجريبي تبع مينا");
    expect(html).toContain("جملة الحساب");
  });

  it("«الحساب القديم» يُعرض بإشارته", () => {
    expect(html).toContain("الحساب القديم");
    expect(html).toContain("200,000");
  });

  it("التواقيع وصندوقا التغليف والترحيل — كما في المعاينة", () => {
    expect(html).toContain("توقيع المستلم");
    expect(html).toContain("تفاصيل التغليف");
    expect(html).toContain("تفاصيل الترحيل");
  });

  it("**نفس الناتج حرفياً** كما تبنيه شاشة المعاينة للمدخلات نفسها", () => {
    const fromPreview = generatePrintHTML({
      type: "invoice", isCash: false, number: "INV-49417", date: "2026-08-02",
      customer: { name: "عميل تجريبي تبع مينا", phone: "0909605576", address: "سوق البسطة" },
      items: [{ product_name: "بطارية", quantity: 10, unit_price: 20_000, foreign_price: 0, tax_amount: 0, discount: 0, total: 200_000 }],
      subtotal: 200_000, taxTotal: 0, discountTotal: 0, shipping: 0, grandTotal: 200_000,
      paidAmount: 0, notes: undefined, company: { company_name: "شركة البتول" },
      status: "pending", paymentMethod: "cash",
      previousDebt: 200_000, previousCredit: 0, currentNet: 400_000,
      packagingInfo: undefined, transportInfo: undefined, hiddenSections: [],
    } as any);
    expect(html).toBe(fromPreview);
  });
});

describe("التغليف والترحيل يمرّان بنفس المُنسِّق", () => {
  const html = buildSharedDocumentHTML(payload({
    packaging: [{ quantity: 1, packs_count: null, pieces_per_pack: null, weight: null, dimensions: null, cost: null, notes: null, packaging_types: null }],
    packaging_items: [{ product_name: "بطارية 125 سي جي", packs_count: 1, pieces_per_pack: 1, quantity: 1, packaging_types: { name: "كرتونة" } }],
    transports: [{ transporters: { name: "مرحّل", phone: "0912", address: null }, destinations: { name: "بورتسودان" } }],
  }));

  it("بنود التغليف تظهر — لا «لا توجد بيانات»", () => {
    // ورقة العميل تُبنى بقالب الطباعة نفسه، فتصلها جدولة التغليف كما هي
    expect(html).toContain("كرتونة");
    expect(html).toContain("كرتونة بطارية 125 سي جي");
    expect(html).toContain("قطعة");
    expect(html).not.toContain("لا توجد بيانات تغليف");
  });

  it("الترحيل بالوجهة", () => {
    expect(html).toContain("الاسم: مرحّل");
    expect(html).toContain("الوجهة: بورتسودان");
  });
});

describe("عرض السعر لا يدخل حساب العميل هنا أيضاً", () => {
  const html = buildSharedDocumentHTML(payload({
    doc_type: "quote",
    doc: { quote_number: "QT-1", date: "2026-08-02", subtotal: 100_000, discount: 0, total: 100_000 },
    prev_net: 200_000, current_net: 200_000,
  }));

  it("إجمالي العرض لا يُجمع على الرصيد", () => {
    expect(html).toContain("إجمالي عرض السعر");
    expect(html).not.toContain("جملة الحساب");
    expect(html).not.toContain("المدفوع");
  });
});

describe("الأقسام المخفيّة في المعاينة تُحذف من ورقة العميل", () => {
  it("لا تُخفى بالتنسيق بل تُحذف من المصدر", () => {
    const html = buildSharedDocumentHTML(payload({ hidden_sections: ["signatures", "transport"] }));
    expect(html).not.toContain("توقيع المستلم");
    expect(html).not.toContain("تفاصيل الترحيل");
    expect(html).toContain("تفاصيل التغليف");
  });
});

describe("الرفض يصل العميل بلغته", () => {
  it.each([
    ["expired", /انتهت صلاحية/],
    ["not_found", /غير صحيح/],
    ["doc_missing", /لم يعد موجوداً/],
  ])("%s", (code, pattern) => {
    expect(() => buildSharedDocumentHTML({ error: code } as any)).toThrow(SharedDocumentError);
    try {
      buildSharedDocumentHTML({ error: code } as any);
    } catch (e: any) {
      expect(e.message).toMatch(pattern);
      expect(e.code).toBe(code);
    }
  });

  it("حمولةٌ بلا مستند تُرفض بدل أن تُنتج ورقةً فارغة", () => {
    expect(() => buildSharedDocumentHTML({ doc_type: "invoice" } as any)).toThrow(/لم يعد موجوداً/);
  });
});

/**
 * حراسة: الهجرة موجودة ومصرَّحٌ تنفيذها لقارئٍ بلا حساب.
 *
 * **تُلتمس بمحتواها لا باسمها.** كان الفحص يبحث عن جزءٍ من اسم الملف، فلمّا
 * طُبّقت الهجرة من لوحة لافابل خرجت باسمٍ آخر (طابعٌ زمنيّ وUUID) — واسمٌ
 * لا يُطابق يعني فحصاً يسقط، أو أسوأ: ملفاً يُحذف وفحصاً يظنّ الدالّة ضائعة.
 *
 * والمحتوى هو الحقيقة: أيّ ملفٍّ يُعرّف الدالّة يُقبَل، مهما سُمّي.
 */
describe("دالّة القاعدة", () => {
  const migrationSql = async (): Promise<{ file: string; sql: string }> => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(process.cwd(), "supabase/migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    // الأحدث يُقرأ آخراً، فيغلب — كما تفعل القاعدة نفسها بـCREATE OR REPLACE
    const hits = files
      .map((f) => ({ file: f, sql: fs.readFileSync(path.join(dir, f), "utf8") }))
      .filter((x) => /CREATE OR REPLACE FUNCTION public\.get_shared_document/.test(x.sql));
    expect(hits.length, "لا هجرةَ تُعرّف get_shared_document").toBeGreaterThan(0);
    return hits[hits.length - 1];
  };

  it("الهجرة تمنح التنفيذ لـ`anon` وتتحقّق من انتهاء التوكن", async () => {
    const { sql } = await migrationSql();
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_shared_document\(text\) TO anon/);
    expect(sql).toContain("expires_at <= now()");
    // بحثٌ بالتوكن وحده — لا معرّف مستندٍ يأتي من المستدعي
    expect(sql).toContain("WHERE t.token = btrim(_token)");
  });

  /**
   * ونسخةٌ واحدة لا ثلاث: كانت في المجلد ثلاثةُ ملفاتٍ تُعرّف الدالّة نفسها
   * بنصٍّ متطابق. لا ضررَ منها في القاعدة (`CREATE OR REPLACE` يتحمّل
   * التكرار) لكنّها تُربك القارئ: أيُّها الحقيقة؟ فحُذف الزائد.
   */
  it("ولا تُعرَّف في أكثر من هجرة", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(process.cwd(), "supabase/migrations");
    const defining = fs.readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /CREATE OR REPLACE FUNCTION public\.get_shared_document/
        .test(fs.readFileSync(path.join(dir, f), "utf8")));
    expect(defining).toHaveLength(1);
  });

  /** والعقد الذي تقرؤه الواجهة — حقلاً بحقل، فلا يسقط أحدها بصمت. */
  it("وتُعيد كل حقلٍ تقرؤه الصفحة", async () => {
    const { sql } = await migrationSql();
    for (const key of [
      "doc_type", "hidden_sections", "doc", "items", "customer",
      "company", "packaging", "packaging_items", "transports",
      "prev_net", "current_net",
    ]) {
      expect(sql, `الحقل ${key} مفقود من الدالّة`).toContain(`'${key}',`);
    }
  });
});
