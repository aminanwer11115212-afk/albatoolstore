/**
 * كشف الحساب المُصدَّر PDF — لا NaN، شريط شحن الرصيد، وأسماء الملفات.
 *
 * العطل الذي ظهر للعميل فعلاً: العمود الرقمي في `financialReportPrintTemplate`
 * كان يمرّر أي قيمة عبر `Number(raw || 0)`، فالخلية التي لا رقم لها («—»)
 * تتحوّل إلى `NaN` وتُطبع كما هي في وجه العميل.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generateFinancialReportHTML, type FinancialReportData } from "@/utils/financialReportPrintTemplate";
import { generatePrintHTML, buildPrintWindowHtml } from "@/utils/printTemplate";
import { buildCustomerAccountView, signedBalanceText } from "@/utils/buildCustomerAccountView";

const base: FinancialReportData = {
  title: "كشف حساب عميل",
  subtitle: "أمين اسماعيل",
  company: { company_name: "شركة الاختبار" },
  sections: [],
};

describe("لا NaN في الأعمدة الرقمية", () => {
  const html = generateFinancialReportHTML({
    ...base,
    sections: [{
      key: "invoices",
      label: "الفواتير",
      columns: [
        { key: "when", label: "التاريخ", align: "center" },
        { key: "total", label: "الإجمالي", numeric: true },
        { key: "paid", label: "المدفوع", numeric: true },
      ],
      rows: [
        { when: "2026-07-30", total: 126000, paid: 126000 },
        // صف حركة: لا إجمالي له، والمدفوع قد يغيب أيضاً
        { when: "2026-07-30", total: "—", paid: "—" },
        { when: "2026-07-30", total: null, paid: undefined },
      ],
      totals: { when: "الإجمالي", total: 126000, paid: 126000 },
    }],
  });

  it("لا تظهر كلمة NaN إطلاقاً", () => {
    expect(html).not.toContain("NaN");
  });

  it("الخلية بلا رقم تُعرض شرطة", () => {
    expect(html).toContain("—");
  });

  it("الأرقام الحقيقية تبقى منسّقة", () => {
    expect(html).toContain("126,000");
  });
});

describe("شريط شحن الرصيد يمتد على كل الأعمدة", () => {
  const html = generateFinancialReportHTML({
    ...base,
    sections: [{
      key: "invoices",
      label: "الفواتير",
      columns: [
        { key: "when", label: "التاريخ", align: "center" },
        { key: "statement", label: "البيان", align: "right" },
        { key: "total", label: "الإجمالي", numeric: true },
      ],
      rows: [
        { when: "2026-07-30", statement: "فاتورة INV-1", total: 500 },
        { __band: "＋ تم شحن رصيدكم بمبلغ 4,000 — رقم العملية 6070", __bandStyle: "background:#e7f8ee;" },
      ],
    }],
  });

  it("يُرسم كخلية واحدة بعرض كل الأعمدة", () => {
    expect(html).toContain('colspan="3"');
    expect(html).toContain("تم شحن رصيدكم بمبلغ 4,000");
    expect(html).toContain("رقم العملية 6070");
  });

  it("يحمل تنسيقه الأخضر", () => {
    expect(html).toContain("background:#e7f8ee;");
  });

  it("لا يُنتج NaN رغم غياب أعمدته", () => {
    expect(html).not.toContain("NaN");
  });
});

describe("الجدول الزمني يضع الشحنة بين الفواتير", () => {
  const view = buildCustomerAccountView({
    invoices: [
      { id: "a", invoice_number: "A", date: "2026-01-01", total: 500, paid_amount: 0 },
      { id: "b", invoice_number: "B", date: "2026-03-01", total: 300, paid_amount: 0 },
    ],
    transactions: [
      { id: "ch", customer_id: "c1", category: "customer_credit", amount: 200, date: "2026-02-01", reference_no: "OP-7", description: "شحن رصيد" },
    ],
  });

  it("الترتيب: فاتورة ← شريط ← فاتورة", () => {
    expect(view.timeline.map((n) => n.type)).toEqual(["invoice", "credit_band", "invoice"]);
  });

  it("نص الشريط موجّه للعميل ويحمل المبلغ ورقم العملية", () => {
    const band = view.timeline[1];
    if (band.type !== "credit_band") throw new Error("توقّعنا شريطاً");
    expect(band.entry.customerText).toContain("تم شحن رصيدكم بمبلغ 200");
    expect(band.entry.customerText).toContain("رقم العملية OP-7");
    expect(band.entry.dayName).toBe("الأحد");
  });

  it("الرصيد الجاري يحترم موضع الشريط الزمني", () => {
    const band = view.timeline[1];
    if (band.type !== "credit_band") throw new Error("توقّعنا شريطاً");
    // بعد فاتورة 500 ثم شحن 200 ⇒ عليه 300
    expect(band.entry.runningBalance).toBe(300);
    expect(signedBalanceText(band.entry.runningBalance).text).toBe("عليه −300");
    // ثم فاتورة 300 ⇒ عليه 600 = إجمالي الحساب
    expect(view.accountTotal).toBe(600);
  });
});

describe("أسماء ملفات PDF", () => {
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

  it("كشف الحساب يحمل اسم العميل لا اسماً عاماً", () => {
    const src = read("src/pages/FinancialReportPreviewPage.tsx");
    expect(src).toContain('const pdfDocName = [docTitle, data?.subtitle].filter(Boolean).join(" - ")');
    // كل مخارج الـPDF تستخدمه
    expect(src).toContain('filename: cleanFileName(pdfDocName, "pdf")');
    expect(src).toContain('a.download = cleanFileName(pdfDocName, "pdf")');
    expect(src).toContain('new File([blob], cleanFileName(pdfDocName, "pdf")');
    expect(src).not.toContain('cleanFileName(docTitle, "pdf")');
  });

  it("الفاتورة تحمل اسم العميل ورقمها ومبلغها", () => {
    const html = buildPrintWindowHtml(
      generatePrintHTML({
        type: "invoice",
        number: "INV-93158",
        date: "2026-07-30",
        customer: { name: "أمين اسماعيل" },
        items: [],
        subtotal: 126000,
        taxTotal: 0,
        discountTotal: 0,
        grandTotal: 126000,
        company: { company_name: "شركة" },
      } as any),
      true,
    );
    expect(html).toContain('<meta name="lov-customer-name" content="أمين اسماعيل">');
    expect(html).toContain('<meta name="lov-doc-number" content="INV-93158">');
    expect(html).toContain('<meta name="lov-doc-total" content="126000">');
    // والبانية تأخذ منها اثنين فقط: العميل والمبلغ
    expect(html).toContain("if (customerNm) parts.push(customerNm);");
    expect(html).toContain("if (docTotal) parts.push(docTotal);");
    // والرقم بقي في meta ولم يعد يدخل الاسم
    expect(html).not.toContain("parts.push(docNumber)");
  });

  it("مبلغ صفر أو غير صالح لا يُضاف للاسم", () => {
    const html = buildPrintWindowHtml(
      generatePrintHTML({
        type: "quote", number: "QT-1", date: "2026-07-30", customer: { name: "ع" },
        items: [], subtotal: 0, taxTotal: 0, discountTotal: 0, grandTotal: 0, company: null,
      } as any),
      true,
    );
    expect(html).toContain('<meta name="lov-doc-total" content="0">');
    // الحارس داخل البانية يُسقط الصفر
    expect(html).toContain("isFinite(n) && n > 0 ? n.toLocaleString('en-US') : ''");
  });
});

describe("كل مسارات PDF للفواتير تحمل المبلغ", () => {
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

  it("قالب الطباعة الرسمي (زر تحميل PDF + واتساب PDF)", () => {
    const src = read("src/utils/printTemplate.ts");
    expect(src).toContain('<meta name="lov-doc-total"');
    expect(src).toContain("if (docTotal) parts.push(docTotal);");
  });

  it("قالب رابط المشاركة (الفاتورة التي يفتحها العميل)", () => {
    const src = read("supabase/functions/document-share/template.ts");
    expect(src).toContain('<meta name="lov-doc-total"');
    // المبلغ يُضاف بنفس قاعدة `formatAmountPart` في الواجهة، فلا يختلف اسم
    // الملف بين التطبيق وصفحة المشاركة
    expect(src).toContain("isFinite(__amt) && __amt > 0");
    expect(src).toContain("maximumFractionDigits: 2");
  });

  it("صفحة رابط العميل لا تسمّي الملف بالـtoken", () => {
    const src = read("src/pages/StandaloneShareDocument.tsx");
    expect(src).not.toContain("filename: `document-${token.slice(0, 8)}.pdf`");
    expect(src).toContain("filename: pdfFileNameFrom(doc, token)");
    expect(src).toContain('meta("lov-doc-total")');
  });

  it("كشف الحساب في رابط المشاركة يحمل اسم الجهة", () => {
    const src = read("supabase/functions/document-share/index.ts");
    expect(src).toContain("const pdfName = [title, party?.name]");
    expect(src).not.toContain('JSON.stringify(title + ".pdf")');
  });
});

describe("buildDocumentFileName", () => {
  it("يجمع العميل والمبلغ — ولا يجمع النوع ولا الرقم", async () => {
    const { buildDocumentFileName } = await import("@/utils/documentFileName");
    expect(buildDocumentFileName({
      docLabel: "فاتورة مبيعات", customerName: "أمين اسماعيل",
      docNumber: "INV-93158", total: 126000,
    })).toBe("أمين اسماعيل - 126,000.pdf");
  });

  it("يتجاهل الأجزاء الفارغة والمبلغ الصفري", async () => {
    const { buildDocumentFileName } = await import("@/utils/documentFileName");
    expect(buildDocumentFileName({ docLabel: "عرض سعر", customerName: "—", docNumber: "", total: 0 }))
      .toBe("عرض سعر.pdf");
  });

  it("يحوّل الأرقام العربية ويزيل المحارف الممنوعة", async () => {
    const { buildDocumentFileName } = await import("@/utils/documentFileName");
    expect(buildDocumentFileName({ docLabel: "فاتورة", customerName: 'أ/ب:ج', total: "١٢٣٤" }))
      .toBe("أ ب ج - 1,234.pdf");
  });

  it("وبلا عميلٍ ولا مبلغ يسقط إلى نوع المستند", async () => {
    const { buildDocumentFileName } = await import("@/utils/documentFileName");
    expect(buildDocumentFileName({ docLabel: "عرض سعر", docNumber: "QT-1" })).toBe("عرض سعر.pdf");
  });

  it("بلا أي جزء صالح يعطي اسماً محايداً لا فارغاً", async () => {
    const { buildDocumentFileName } = await import("@/utils/documentFileName");
    expect(buildDocumentFileName({})).toBe("مستند.pdf");
  });
});
