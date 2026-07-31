import { cleanNamePart, buildDocumentFileName } from "@/utils/documentFileName";
/**
 * البند 4 — اسم ملف الـPDF يحتوي رقم المستند الكامل + زر «إرسال للعميل».
 *
 * قبل الإصلاح كان زر «تحميل PDF» يسمّي الملف من `document.title` بينما مشاركة
 * الواتساب وحدها تبني اسماً يحمل رقم المستند — فيخرج ملفان باسمين مختلفين،
 * وصفحة إنشاء الفاتورة لم تكن تمرّر الرقم أصلاً فيخرج بلا رقم.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generatePrintHTML, buildPrintWindowHtml } from "@/utils/printTemplate";

const html = buildPrintWindowHtml(
  generatePrintHTML({
    type: "invoice",
    number: "INV-2026-00042",
    date: "2026-07-30",
    customer: { name: "أحمد", phone: "0900000000" },
    items: [{ product_name: "صنف", quantity: 1, unit_price: 100, tax_amount: 0, discount: 0, total: 100 }],
    subtotal: 100,
    taxTotal: 0,
    discountTotal: 0,
    grandTotal: 100,
    company: { company_name: "شركة الاختبار" },
  } as any),
  true,
);

describe("اسم ملف الـPDF يحمل رقم المستند", () => {
  it("رقم المستند الكامل يصل إلى meta التي يبني منها اسم الملف", () => {
    expect(html).toContain('<meta name="lov-doc-number" content="INV-2026-00042">');
  });

  it("عنوان الصفحة يحمل الرقم الكامل بلا اقتطاع", () => {
    expect(html).toMatch(/<title>[^<]*INV-2026-00042[^<]*<\/title>/);
  });

  it("زر تحميل PDF يستخدم اسم الملف الحامل للرقم لا عنوان الصفحة", () => {
    // لا يبقى أي مسار تنزيل يعتمد على getDocTitle()
    expect(html).not.toContain("a.download = getDocTitle() + '.pdf'");
    expect(html).not.toContain("filename: getDocTitle() + '.pdf'");
    expect(html).toContain("a.download = buildDocFileName()");
    expect(html).toContain("filename: buildDocFileName()");
  });

  it("بانية الاسم تُدرج رقم المستند ضمن الأجزاء", () => {
    expect(html).toContain("var docNumber  = clean(getMeta('lov-doc-number'));");
    expect(html).toContain("if (docNumber) parts.push(docNumber);");
  });

  it("مشاركة الواتساب والتنزيل يستخدمان نفس الدالة — لا اسمان مختلفان", () => {
    expect(html).not.toContain("buildWaFileName");
    const uses = html.match(/buildDocFileName\(\)/g) || [];
    expect(uses.length).toBeGreaterThanOrEqual(4);
  });
});

describe("صفحات الإنشاء تمرّر رقم المستند للطباعة", () => {
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

  it("صفحة إنشاء الفاتورة تمرّر number", () => {
    const src = read("src/pages/InvoiceCreatePage.tsx");
    const call = src.slice(src.indexOf("openPrintWindow(generatePrintHTML({"));
    expect(call.slice(0, 400)).toContain("number: invoiceNumber");
  });

  it("صفحة إنشاء عرض السعر تمرّر number", () => {
    const src = read("src/pages/QuoteCreatePage.tsx");
    const call = src.slice(src.indexOf("openPrintWindow(generatePrintHTML({"));
    expect(call.slice(0, 400)).toContain("number: quoteNumber");
  });
});

describe("زر الإرسال للعميل في صفحات الفواتير وعروض الأسعار", () => {
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
  const pages = [
    "src/pages/InvoicesPage.tsx",
    "src/pages/InvoiceCreatePage.tsx",
    "src/pages/QuoteCreatePage.tsx",
    "src/pages/QuotesPage.tsx",
    "src/pages/SideQuoteDetailPage.tsx",
  ];

  it.each(pages)("%s يعرض «إرسال للعميل»", (p) => {
    expect(read(p)).toContain("إرسال للعميل");
  });

  it("القناة تبقى واضحة في التلميح — الإرسال عبر واتساب لا قناة أخرى", () => {
    for (const p of pages) {
      const src = read(p);
      const idx = src.indexOf("إرسال للعميل");
      // التلميح المجاور يذكر واتساب صراحةً
      expect(src.slice(Math.max(0, idx - 400), idx + 200)).toMatch(/واتساب/);
    }
  });
});

describe("اسم الملف لا يحمل محارف غير مرئية تفسده عند الإرسال", () => {
  // أسماء العملاء تُنسخ كثيراً من مصادر عربية فتحمل علامات اتجاه لا تُرى على
  // الشاشة، لكنها بايتات في اسم الملف تصل واتساب رموزاً غريبة.
  it("علامات الاتجاه والعرض الصفري تُزال من اسم العميل", () => {
    const dirty = "‏ايهاب‎ الدين‫ امدرمان‬";
    expect(cleanNamePart(dirty)).toBe("ايهاب الدين امدرمان");
  });

  it("علامة ترتيب البايتات (BOM) والشرطة اللينة تُزالان", () => {
    expect(cleanNamePart("﻿فاتورة­مبيعات")).toBe("فاتورةمبيعات");
  });

  it("الاسم الكامل يخرج نظيفاً رغم تلوّث كل أجزائه", () => {
    const name = buildDocumentFileName({
      docLabel: "‏فاتورة مبيعات",
      customerName: "ايهاب الدين‮ امدرمان",
      docNumber: "﻿INV-61463",
      total: 350000,
    });
    expect(name).toBe("فاتورة مبيعات - ايهاب الدين امدرمان - INV-61463 - 350,000.pdf");
    // لا يبقى أي محرف غير مرئي في الناتج
    expect(/[​-‏‪-‮⁦-⁩﻿­]/.test(name)).toBe(false);
  });

  it("التوحيد NFC يجعل الاسم واحداً مهما اختلف تركيبه", () => {
    // الألف بهمزة: مركّبة (حرف واحد) مقابل مفكّكة (ألف + همزة)
    const composed = cleanNamePart("أمين");
    const decomposed = cleanNamePart("أمين");
    expect(composed).toBe(decomposed);
  });

  it("الاسم السليم لا يتغيّر", () => {
    expect(cleanNamePart("ايهاب الدين امدرمان")).toBe("ايهاب الدين امدرمان");
  });
});
