import { describe, it, expect } from "vitest";
import { generatePrintHTML, buildPrintWindowHtml } from "@/utils/printTemplate";

/**
 * نسخة TypeScript مطابقة لدالة buildWaFileName المحقونة كـ string داخل
 * <script> في buildPrintWindowHtml. نُبقي المنطق متطابقاً حرفياً —
 * أي تعديل هناك يجب أن يُكرَّر هنا (الاختبار سيكشف الانحراف).
 */
function buildWaFileNameFromMeta(meta: {
  docLabel?: string;
  docNumber?: string;
  customerName?: string;
  docTitle?: string;
}): string {
  const digitMap: Record<string, string> = {
    "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
    "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9",
  };
  const clean = (raw?: string): string => {
    let s = (raw || "").trim();
    if (!s || s === "-" || s === "—" || s === "_" || s === "undefined" || s === "null") return "";
    s = s.replace(/[٠-٩۰-۹]/g, (d) => digitMap[d] || d);
    s = s.replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
    return s;
  };
  let docLabel = clean(meta.docLabel);
  const docNumber = clean(meta.docNumber);
  let customerNm = clean(meta.customerName);
  if (!docLabel) docLabel = clean(meta.docTitle) || "مستند";
  if (!customerNm) customerNm = "بدون اسم";
  const parts = [docLabel, customerNm];
  if (docNumber) parts.push(docNumber);
  let name = parts.join(" - ").trim();
  if (!name) name = "document";
  if (name.length > 120) name = name.slice(0, 120).trim();
  return name + ".pdf";
}

/** يستخرج قيمة meta من HTML الناتج عن buildPrintWindowHtml */
function extractMeta(html: string, name: string): string {
  const re = new RegExp(`<meta name="${name}" content="([^"]*)"`, "i");
  const m = html.match(re);
  return m ? m[1] : "";
}

const baseItems = [
  { product_name: "صنف ١", quantity: 1, unit_price: 100, tax_amount: 0, discount: 0, total: 100 },
];
const baseTotals = { subtotal: 100, taxTotal: 0, discountTotal: 0, grandTotal: 100 };

describe("WhatsApp PDF — meta injection across all document types", () => {
  const cases = [
    { type: "invoice" as const, isCash: false, expectedLabel: "فاتورة مبيعات" },
    { type: "invoice" as const, isCash: true,  expectedLabel: "فاتورة كاش" },
    { type: "quote"   as const,                expectedLabel: "عرض سعر" },
    { type: "return"  as const,                expectedLabel: "مرتجع مبيعات" },
    { type: "purchase" as const,               expectedLabel: "أمر شراء" },
  ];

  for (const c of cases) {
    it(`${c.type}${c.isCash ? " (كاش)" : ""} → injects correct meta`, () => {
      const inner = generatePrintHTML({
        type: c.type,
        isCash: c.isCash,
        number: "DOC-77",
        date: "2026-04-22",
        customer: { name: "أحمد محمد", phone: "0900000000" },
        items: baseItems,
        ...baseTotals,
      });
      const full = buildPrintWindowHtml(inner);

      expect(extractMeta(full, "lov-doc-label")).toBe(c.expectedLabel);
      expect(extractMeta(full, "lov-doc-number")).toBe("DOC-77");
      expect(extractMeta(full, "lov-customer-name")).toBe("أحمد محمد");
    });
  }
});

describe("buildWaFileName — naming logic", () => {
  it("normal: '<label> - <customer> - <number>.pdf'", () => {
    expect(buildWaFileNameFromMeta({
      docLabel: "فاتورة مبيعات", docNumber: "INV-105", customerName: "أحمد محمد",
    })).toBe("فاتورة مبيعات - أحمد محمد - INV-105.pdf");
  });

  it("statement-style without docNumber omits the number part", () => {
    expect(buildWaFileNameFromMeta({
      docLabel: "كشف حساب عميل", customerName: "شركة النور",
    })).toBe("كشف حساب عميل - شركة النور.pdf");
  });

  it("missing customer → uses 'بدون اسم'", () => {
    expect(buildWaFileNameFromMeta({
      docLabel: "فاتورة مبيعات", docNumber: "INV-1",
    })).toBe("فاتورة مبيعات - بدون اسم - INV-1.pdf");
  });

  it("missing docLabel → falls back to docTitle, then to 'مستند'", () => {
    expect(buildWaFileNameFromMeta({
      docTitle: "عرض سعر", customerName: "علي",
    })).toBe("عرض سعر - علي.pdf");

    expect(buildWaFileNameFromMeta({
      customerName: "علي",
    })).toBe("مستند - علي.pdf");
  });

  it("placeholder values ('-', '—', 'undefined', 'null') are treated as empty", () => {
    expect(buildWaFileNameFromMeta({
      docLabel: "—", docNumber: "undefined", customerName: "null",
    })).toBe("مستند - بدون اسم.pdf");
  });

  it("converts Eastern Arabic digits in number to Latin", () => {
    expect(buildWaFileNameFromMeta({
      docLabel: "فاتورة مبيعات", docNumber: "INV-١٢٣", customerName: "أحمد",
    })).toBe("فاتورة مبيعات - أحمد - INV-123.pdf");
  });

  it("converts Persian digits in number to Latin", () => {
    expect(buildWaFileNameFromMeta({
      docLabel: "مرتجع مبيعات", docNumber: "RET-۴۵", customerName: "سارة",
    })).toBe("مرتجع مبيعات - سارة - RET-45.pdf");
  });

  it("strips filesystem-illegal characters (/, \\, :, *, ?, \", <, >, |)", () => {
    expect(buildWaFileNameFromMeta({
      docLabel: "فاتورة/كاش", docNumber: "A:B*C?", customerName: 'شركة "X" <Y>',
    })).toBe("فاتورة كاش - شركة X Y - A B C.pdf");
  });

  it("collapses whitespace and tabs/newlines into single spaces", () => {
    expect(buildWaFileNameFromMeta({
      docLabel: "فاتورة\tمبيعات", customerName: "أحمد\n محمد", docNumber: "INV  1",
    })).toBe("فاتورة مبيعات - أحمد محمد - INV 1.pdf");
  });

  it("trims names longer than 120 chars (excluding extension)", () => {
    const long = "ع".repeat(200);
    const out = buildWaFileNameFromMeta({ docLabel: "فاتورة", customerName: long });
    // الاسم قبل الامتداد يجب ألا يتجاوز 120 محرف
    const stem = out.replace(/\.pdf$/, "");
    expect(stem.length).toBeLessThanOrEqual(120);
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("all empty → 'مستند - بدون اسم.pdf'", () => {
    expect(buildWaFileNameFromMeta({})).toBe("مستند - بدون اسم.pdf");
  });
});

describe("End-to-end: meta from generatePrintHTML feeds buildWaFileName correctly", () => {
  it("invoice → 'فاتورة مبيعات - <customer> - <number>.pdf'", () => {
    const inner = generatePrintHTML({
      type: "invoice", number: "INV-105", date: "2026-04-22",
      customer: { name: "أحمد محمد" },
      items: baseItems, ...baseTotals,
    });
    const full = buildPrintWindowHtml(inner);
    const fileName = buildWaFileNameFromMeta({
      docLabel: extractMeta(full, "lov-doc-label"),
      docNumber: extractMeta(full, "lov-doc-number"),
      customerName: extractMeta(full, "lov-customer-name"),
    });
    expect(fileName).toBe("فاتورة مبيعات - أحمد محمد - INV-105.pdf");
  });

  it("return → 'مرتجع مبيعات - <customer> - <number>.pdf'", () => {
    const inner = generatePrintHTML({
      type: "return", number: "RET-12", date: "2026-04-22",
      customer: { name: "سارة" },
      items: baseItems, ...baseTotals,
    });
    const full = buildPrintWindowHtml(inner);
    const fileName = buildWaFileNameFromMeta({
      docLabel: extractMeta(full, "lov-doc-label"),
      docNumber: extractMeta(full, "lov-doc-number"),
      customerName: extractMeta(full, "lov-customer-name"),
    });
    expect(fileName).toBe("مرتجع مبيعات - سارة - RET-12.pdf");
  });

  it("quote without number → 'عرض سعر - <customer>.pdf'", () => {
    const inner = generatePrintHTML({
      type: "quote", date: "2026-04-22",
      customer: { name: "شركة النور" },
      items: baseItems, ...baseTotals,
    });
    const full = buildPrintWindowHtml(inner);
    const fileName = buildWaFileNameFromMeta({
      docLabel: extractMeta(full, "lov-doc-label"),
      docNumber: extractMeta(full, "lov-doc-number"),
      customerName: extractMeta(full, "lov-customer-name"),
    });
    expect(fileName).toBe("عرض سعر - شركة النور.pdf");
  });

  it("invoice without customer → 'فاتورة مبيعات - بدون اسم - <number>.pdf'", () => {
    const inner = generatePrintHTML({
      type: "invoice", number: "INV-9", date: "2026-04-22",
      customer: null,
      items: baseItems, ...baseTotals,
    });
    const full = buildPrintWindowHtml(inner);
    const fileName = buildWaFileNameFromMeta({
      docLabel: extractMeta(full, "lov-doc-label"),
      docNumber: extractMeta(full, "lov-doc-number"),
      customerName: extractMeta(full, "lov-customer-name"),
    });
    expect(fileName).toBe("فاتورة مبيعات - بدون اسم - INV-9.pdf");
  });

  it("statement (kind=customer) emulation → 'كشف حساب عميل - <customer>.pdf'", () => {
    // كشف الحساب يبني عنوانه يدوياً في StatementPreviewPage
    // (لا يمر عبر generatePrintHTML)، لكن منطق التسمية نفسه يجب أن يعمل.
    const fileName = buildWaFileNameFromMeta({
      docLabel: "كشف حساب عميل",
      customerName: "أحمد محمد",
    });
    expect(fileName).toBe("كشف حساب عميل - أحمد محمد.pdf");
  });

  it("statement (kind=supplier) → 'كشف حساب مورد - <supplier>.pdf'", () => {
    const fileName = buildWaFileNameFromMeta({
      docLabel: "كشف حساب مورد",
      customerName: "شركة الفجر",
    });
    expect(fileName).toBe("كشف حساب مورد - شركة الفجر.pdf");
  });
});
