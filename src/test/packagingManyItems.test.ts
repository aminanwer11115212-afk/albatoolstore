/**
 * بنود التغليف الكثيرة في معاينة الفاتورة وطباعتها وورقة العميل.
 *
 * فاتورةٌ فيها عشرون صنفاً قد يُغلَّف كلٌّ منها بنوعٍ وعددٍ مختلف، فيصير صندوق
 * التغليف أطول من نصف الصفحة. وهنا يظهر ما لا يظهر ببندٍ واحد:
 *
 *   • هل تنجو البنود كلّها من `cleanExtraHTML` — أم يبتلع بعضَها تنظيفُ الـ`<br>`؟
 *   • وهل ينقسم الصندوق على الصفحات، أم يُدفع كلّه لصفحةٍ تالية فيترك بياضاً؟
 *
 * والثاني كان مختلاً: `.extra-row` كانت في قائمة «لا تنقسم» في قالب المشاركة
 * وحده. فورقة العميل تدفع الصندوق لصفحةٍ تالية بينما تقسمه المعاينة طبيعياً —
 * اختلافٌ لا يظهر إلا عند كثرة البنود، وهو ما سأل عنه صاحب المستودع.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { formatPackaging } from "@/utils/printExtras";
import { generatePrintHTML } from "@/utils/printTemplate";
import { buildDocHTML } from "../../supabase/functions/document-share/template";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/** عشرون بنداً كما تُدخلها شاشة التغليف، بعضها بملاحظة. */
const manyItems = Array.from({ length: 20 }, (_, i) => ({
  product_name: `صنف رقم ${i + 1}`,
  packs_count: i + 1,
  pieces_per_pack: 6,
  quantity: (i + 1) * 6,
  description: i % 4 === 0 ? `ملاحظة البند ${i + 1}` : null,
  packaging_types: { name: i % 2 ? "كرتونة" : "كيس" },
}));

const baseDoc = {
  type: "invoice" as const,
  number: "INV-49417",
  date: "2026-08-02",
  customer: { name: "عميل تجريبي تبع مينا" },
  items: [{ product_name: "بطارية", quantity: 4, unit_price: 50_000, tax_amount: 0, discount: 0, total: 200_000 }],
  subtotal: 200_000, taxTotal: 0, discountTotal: 0, grandTotal: 200_000,
  company: null,
};

describe("البنود الكثيرة تصل الورقة كاملة", () => {
  const packagingInfo = formatPackaging([], manyItems)!;

  it("المُنسِّق يُخرج سطراً لكل بند", () => {
    for (let i = 1; i <= 20; i++) expect(packagingInfo).toContain(`صنف رقم ${i}`);
  });

  it("ولا يبتلع تنظيفُ `cleanExtraHTML` أيَّ بند في الطباعة", () => {
    const html = generatePrintHTML({ ...baseDoc, packagingInfo } as any);
    const missing = Array.from({ length: 20 }, (_, i) => i + 1)
      .filter((i) => !html.includes(`صنف رقم ${i}`));
    expect(missing).toEqual([]);
  });

  it("ولا في ورقة العميل", () => {
    const html = buildDocHTML({
      docTitle: "فاتورة مبيعات", docNumber: "INV-49417", date: "2026-08-02",
      customer: { name: "عميل تجريبي تبع مينا" },
      items: [{ product_name: "بطارية", quantity: 4, unit_price: 50_000, total: 200_000 }],
      grandTotal: 200_000, company: null, packagingInfo,
    });
    const missing = Array.from({ length: 20 }, (_, i) => i + 1)
      .filter((i) => !html.includes(`صنف رقم ${i}`));
    expect(missing).toEqual([]);
  });

  it("الملاحظات تبقى ملتصقة ببنودها", () => {
    expect(packagingInfo).toContain("ملاحظة البند 1");
    expect(packagingInfo).toContain("ملاحظة البند 5");
  });

  it("عدد الصفوف = عدد البنود (لا دمج ولا إسقاط)", () => {
    // صفُّ الترويسة + عشرون بنداً + صفُّ المجموع
    expect(packagingInfo.match(/<tr[ >]/g)).toHaveLength(21);
  });

  it("والمجموع في الذيل = مجموع الطرود", () => {
    const total = manyItems.reduce((s, r) => s + r.packs_count, 0);
    expect(packagingInfo).toContain("قطعة");
    // السطر الأخير: «210 قطعة» — لا خليّةَ مستقلّة للرقم بعد صيرورته سطراً
    expect(packagingInfo).toContain(`${total} قطعة`);
  });

  it("مئة بند لا تكسر شيئاً", () => {
    const hundred = Array.from({ length: 100 }, (_, i) => ({
      product_name: `ص${i}`, packs_count: 1, pieces_per_pack: 1, quantity: 1,
      packaging_types: { name: "كرتونة" },
    }));
    const html = generatePrintHTML({ ...baseDoc, packagingInfo: formatPackaging([], hundred) } as any);
    expect(html).toContain("ص99");
    expect(html).toContain("توقيع المستلم"); // الورقة كاملة بعده
  });
});

/**
 * قواعد تقسيم الصفحات موحّدة بين القالبين — وإلا اختلفت الورقتان عند كثرة
 * البنود وحدها، وهو أصعب اختلافٍ يُكتشف لأنه لا يظهر في الحالات العادية.
 */
describe("تقسيم الصفحات موحّد بين المعاينة وورقة العميل", () => {
  const printCss = read("src/utils/printTemplate.ts");
  const shareCss = read("supabase/functions/document-share/template.ts");

  it("صندوقا التغليف والترحيل ينقسمان على الصفحات في القالبين", () => {
    for (const css of [printCss, shareCss]) {
      expect(css).toMatch(/\.extra-row, \.extra-box \{ page-break-inside: auto; break-inside: auto; \}/);
    }
  });

  it("و`.extra-row` ليست في قائمة «لا تنقسم» في أيٍّ منهما", () => {
    for (const css of [printCss, shareCss]) {
      const avoidLine = css.split("\n").find((l) => l.includes("page-break-inside: avoid") && l.includes(".total-row"))!;
      expect(avoidLine).toBeTruthy();
      expect(avoidLine).not.toContain(".extra-row");
    }
  });

  it("والتواقيع لا تنقسم في القالبين — كتلةٌ قصيرة يقبح شطرها", () => {
    for (const css of [printCss, shareCss]) {
      const avoidLine = css.split("\n").find((l) => l.includes("page-break-inside: avoid") && l.includes(".total-row"))!;
      expect(avoidLine).toContain(".signatures");
    }
  });
});
