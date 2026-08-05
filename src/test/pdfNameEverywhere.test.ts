/**
 * اسم ملف الـPDF: **اسم العميل ومبلغ الفاتورة فقط** — من أيّ مكان.
 *
 * ## ما طلبه صاحب المستودع
 * «أيّ PDF ينزل أو يُشارَك الفاتورة من أيّ مكان يظهر بإسم العميل ومبلغ
 * الفاتورة فقط، سواء لابتوب أو هاتف».
 *
 * ## و«من أيّ مكان» هي الكلمة الصعبة
 * للفاتورة خمسةُ مخارج: زرّ التنزيل في المعاينة، ومشاركة الواتساب منها،
 * وصفحة رابط العميل، وصفحة الرابط القديمة (مسار السقوط)، وكلٌّ منها كان
 * يسمّي الملف بيده. فوقع ما يقع دائماً: صفحةُ الرابط القديمة تنزّل
 * `document-a1b2c3d4.pdf` — رمزُ توكينٍ لا يدلّ العميل على شيء ويتكرّر شكلُه
 * في كلّ ملف.
 *
 * فالفحص هنا **مسحٌ للمخارج كلّها** لا فحصٌ لواحد: أيّ `filename:` جديد
 * يسمّي بيده يسقط هنا قبل أن يصل العميل.
 *
 * ## والنسختان
 * المنطق مكتوبٌ مرّتين لا مفرّ: مرّةً في `documentFileName.ts` لصفحات React،
 * ومرّةً بـJavaScript خام داخل الورقة نفسها (شريط المعاينة يعيش في المستند
 * لا في التطبيق). فيُقارَن المساران هنا صراحةً — لا يُترك التطابق للحسن ظنّ.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildDocumentFileName } from "@/utils/documentFileName";
import { generatePrintHTML, buildPrintWindowHtml } from "@/utils/printTemplate";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/* ─────────── ١) القاعدة نفسها ─────────── */

describe("الاسم: العميل والمبلغ لا غير", () => {
  it("فاتورةٌ كاملة", () => {
    expect(buildDocumentFileName({
      docLabel: "فاتورة مبيعات", customerName: "أمين اسماعيل",
      docNumber: "INV-93158", total: 126000,
    })).toBe("أمين اسماعيل - 126,000.pdf");
  });

  it("والنوع والرقم لا يظهران مهما تغيّرا", () => {
    const a = buildDocumentFileName({ docLabel: "عرض سعر", docNumber: "QT-1", customerName: "ع", total: 10 });
    const b = buildDocumentFileName({ docLabel: "مرتجع", docNumber: "RT-9", customerName: "ع", total: 10 });
    expect(a).toBe(b);
    expect(a).toBe("ع - 10.pdf");
  });

  it("وبلا مبلغ: اسم العميل وحده — لا فاصلةَ معلّقة", () => {
    expect(buildDocumentFileName({ customerName: "أمين", total: 0 })).toBe("أمين.pdf");
    expect(buildDocumentFileName({ customerName: "أمين" })).toBe("أمين.pdf");
  });

  it("وبلا عميل: نوع المستند — لا «مستند» مجرّدة تتكرّر على كل ملف", () => {
    expect(buildDocumentFileName({ docLabel: "كشف حساب عميل", total: 0 })).toBe("كشف حساب عميل.pdf");
  });

  it("وبلا شيء أصلاً: اسمٌ محايد لا فراغ", () => {
    expect(buildDocumentFileName({})).toBe("مستند.pdf");
  });

  it("والمبلغ يُقرأ بالعربية أيضاً — لا يسقط بصمت", () => {
    // القيمة تصل نصّاً من meta الورقة أو من حقلٍ بلوحةٍ عربية
    expect(buildDocumentFileName({ customerName: "ع", total: "١٢٦٠٠٠" })).toBe("ع - 126,000.pdf");
    expect(buildDocumentFileName({ customerName: "ع", total: "126,000" })).toBe("ع - 126,000.pdf");
  });

  it("والمحارف غير المرئية لا تصل اسم الملف", () => {
    const name = buildDocumentFileName({ customerName: "ايهاب‏ الدين‮", total: 350000 });
    expect(name).toBe("ايهاب الدين - 350,000.pdf");
  });
});

/* ─────────── ٢) نسخة الورقة تطابق نسخة التطبيق ─────────── */

describe("المساران يعطيان الاسم نفسه", () => {
  const sheet = buildPrintWindowHtml(
    generatePrintHTML({
      type: "invoice", number: "INV-93158", date: "2026-08-04",
      customer: { name: "أمين اسماعيل" },
      items: [{ product_name: "صنف", quantity: 1, unit_price: 126000, tax_amount: 0, discount: 0, total: 126000 }],
      subtotal: 126000, taxTotal: 0, discountTotal: 0, grandTotal: 126000, company: null,
    } as any),
    true,
  );

  it("بانية الورقة تأخذ العميل والمبلغ", () => {
    expect(sheet).toContain("if (customerNm) parts.push(customerNm);");
    expect(sheet).toContain("if (docTotal) parts.push(docTotal);");
  });

  it("ولا تأخذ النوع ولا الرقم", () => {
    expect(sheet).not.toContain("parts.push(docNumber)");
    expect(sheet).not.toContain("var parts = [docLabel, customerNm];");
  });

  it("والنوع باقٍ احتياطاً وحده حين لا عميلَ ولا مبلغ", () => {
    expect(sheet).toContain("if (!name) name = docLabel;");
  });

  it("والبيانات التي يقرأ منها موجودةٌ في الورقة", () => {
    expect(sheet).toContain('<meta name="lov-customer-name" content="أمين اسماعيل">');
    expect(sheet).toContain('<meta name="lov-doc-total" content="126000">');
  });

  it("وكلّ مخارج الورقة تستدعي البانية الواحدة", () => {
    expect(sheet).not.toContain("buildWaFileName");
    expect((sheet.match(/buildDocFileName\(\)/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});

/* ─────────── ٣) مسحٌ لكل مخارج الفاتورة ─────────── */

describe("لا مخرجَ يسمّي بيده", () => {
  /** الصفحات التي تنزّل أو تشارك ورقةَ مستند. */
  const DOC_PAGES = [
    "src/pages/StandaloneShareDocument.tsx",
    "src/pages/PublicDocumentSharePage.tsx",
  ];

  it.each(DOC_PAGES)("%s تبني الاسم من المصدر الواحد", (file) => {
    expect(read(file)).toContain("buildDocumentFileName");
  });

  it("ولا اسمَ من توكين المشاركة — رمزٌ لا يدلّ العميل على شيء", () => {
    for (const file of DOC_PAGES) {
      const src = read(file);
      // كان: filename: `document-${token.slice(0, 8)}.pdf`
      expect(src).not.toMatch(/filename:\s*`document-\$\{/);
    }
  });

  it("وصفحة الكشف تبني اسمها من المصدر نفسه لا بنسخةٍ محلّية", () => {
    const src = read("src/pages/StatementPreviewPage.tsx");
    expect(src).toContain("buildDocumentFileName");
    // نسخةٌ محلّية من منظّف **أسماء الملفات** تنحرف عن أصلها مع أوّل تعديل.
    // (تطبيعُ أرقام الهاتف في `getWaPhone` شأنٌ آخر ويبقى.)
    expect(src).not.toContain("const clean = (raw?: string): string => {");
    expect(src).not.toContain("if (name.length > 120) name = name.slice(0, 120)");
  });

  it("وزرّ التنزيل واسمُ الملفّ المولَّد واحدٌ في صفحة الكشف", () => {
    const src = read("src/pages/StatementPreviewPage.tsx");
    // كان الـblob يُسمّى من docTitle والرابط من بانيةٍ أخرى — اسمان لملفٍّ واحد
    expect(src).not.toMatch(/filename:\s*`\$\{docTitle\}\.pdf`/);
    expect((src.match(/buildWaFileNameForStatement\("pdf"\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
