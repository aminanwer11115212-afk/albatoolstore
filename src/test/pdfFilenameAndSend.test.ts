import { cleanNamePart, buildDocumentFileName, formatAmountPart } from "@/utils/documentFileName";
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

  // بناء HTML الطباعة استُخرج في `buildCurrentPrintHTML` ليشترك فيه ثلاثة
  // أزرار (معاينة/طباعة/واتساب PDF) — فالفحص يتبع الدالة لا نداء openPrintWindow.
  it("صفحة إنشاء الفاتورة تمرّر number", () => {
    const src = read("src/pages/InvoiceCreatePage.tsx");
    const call = src.slice(src.indexOf("function buildCurrentPrintHTML"));
    expect(call.slice(0, 600)).toContain("number: invoiceNumber");
  });

  it("صفحة إنشاء عرض السعر تمرّر number", () => {
    const src = read("src/pages/QuoteCreatePage.tsx");
    const call = src.slice(src.indexOf("function buildCurrentPrintHTML"));
    expect(call.slice(0, 600)).toContain("number: quoteNumber");
  });

  it("الأزرار الثلاثة تبني الـHTML من نفس الدالة — فلا يختلف ما يُعاين عمّا يُرسل", () => {
    for (const page of ["src/pages/InvoiceCreatePage.tsx", "src/pages/QuoteCreatePage.tsx"]) {
      const src = read(page);
      expect(src).toContain("function buildCurrentPrintHTML");
      // لا نداء مباشر لـ generatePrintHTML خارج الدالة الموحّدة
      expect((src.match(/generatePrintHTML\(\{/g) || []).length).toBe(1);
      expect(src).toContain("buildCurrentPrintHTML(\"full\", false)");
    }
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

describe("زرّا «معاينة» و«واتساب PDF» في شاشات الإنشاء والتعديل", () => {
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
  // شاشة الفاتورة واحدة للإنشاء والتعديل (`editId`)، فالزران يظهران في الحالتين.
  const pages = ["src/pages/InvoiceCreatePage.tsx", "src/pages/QuoteCreatePage.tsx"];

  it.each(pages)("%s فيه زر معاينة يفتح نافذة المعاينة", (page) => {
    const src = read(page);
    expect(src).toContain('id: "preview"');
    expect(src).toContain("معاينة");
    expect(src).toMatch(/openPrintWindow\(\s*(await\s+)?buildCurrentPrintHTML/);
  });

  it.each(pages)("%s فيه زر واتساب PDF يمرّ من المسار الموحّد", (page) => {
    const src = read(page);
    expect(src).toContain('id: "wa-pdf"');
    expect(src).toContain("واتساب PDF");
    expect(src).toContain('import("@/utils/shareDocumentPdf")');
    expect(src).toContain("shareDocumentPdf({");
  });

  it.each(pages)("%s يمرّر نوع المستند ورقمه ومبلغه لاسم الملف", (page) => {
    const src = read(page);
    const call = src.slice(src.indexOf("shareDocumentPdf({"));
    for (const field of ["docLabel:", "customerName:", "docNumber:", "total:"]) {
      expect(call.slice(0, 700)).toContain(field);
    }
  });

  it.each(pages)("%s يمنع النقر المزدوج أثناء التوليد", (page) => {
    const src = read(page);
    expect(src).toContain("sharingPdf");
    expect(src).toContain("disabled={sharingPdf}");
  });

  it("عرض السعر يُسمّى «عرض سعر» لا «فاتورة»", () => {
    expect(read("src/pages/QuoteCreatePage.tsx")).toContain('docLabel: "عرض سعر"');
  });
});

describe("اسم PDF واحد من التطبيق ومن صفحة المشاركة", () => {
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

  /**
   * صفحة المشاركة تحمل زرَّي تحميل: واحد من الواجهة وآخر داخل إطار دالة Edge.
   * لو اختلفت قاعدة تنسيق المبلغ بينهما، خرج الملف باسمين مختلفين حسب الزر —
   * وهو ما ظهر كفرق بين اسم الملف من اللابتوب واسمه من الهاتف.
   */
  it("قاعدة تنسيق المبلغ في دالة Edge مطابقة لـ formatAmountPart", () => {
    const tpl = read("supabase/functions/document-share/template.ts");
    expect(tpl).toContain("Math.round(__amt * 100) / 100 === Math.round(__amt)");
    expect(tpl).toContain("maximumFractionDigits: 2");
    // لا استعمال للصيغة الافتراضية (ثلاث خانات)
    expect(tpl).not.toMatch(/__amt\.toLocaleString\('en-US'\)\s*\)/);
  });

  it("القاعدتان تعطيان النتيجة نفسها على مبالغ حقيقية", () => {
    // محاكاة قاعدة دالة Edge حرفياً
    const edge = (n: number) =>
      Math.round(n * 100) / 100 === Math.round(n)
        ? Math.round(n).toLocaleString("en-US")
        : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    for (const amount of [1596000, 350000, 126000.5, 99.999, 0.5, 1234567.891]) {
      expect(formatAmountPart(amount)).toBe(edge(amount));
    }
  });

  it("مبلغ الصورة يخرج بالاسم نفسه من المسارين", () => {
    expect(formatAmountPart(1596000)).toBe("1,596,000");
  });
});
