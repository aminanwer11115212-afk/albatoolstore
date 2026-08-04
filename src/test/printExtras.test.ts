import { describe, it, expect, beforeEach, vi } from "vitest";

type TableData = Record<string, any[]>;

/**
 * المحاكاة تُشبه القاعدة الحيّة: جداول التغليف والترحيل **بلا مفاتيح أجنبية**،
 * فصفوفها تحمل معرّفاتٍ لا كائناتٍ مربوطة، والأسماء تُجلب باستعلامٍ مستقلّ
 * بـ`.in("id", …)`. وكانت المحاكاة السابقة تردّ الكائنات المربوطة جاهزةً —
 * أي أنها تفترض ربطاً لا وجود له، فمرّ العطل من تحتها.
 */
const tableData: TableData = {
  invoice_transports: [],
  invoice_packaging: [],
  invoices_packaging_items: [],
  quote_transports: [],
  quotes_packaging: [],
  quotes_packaging_items: [],
  transporters: [],
  destinations: [],
  packaging_types: [],
};

const fromCalls: string[] = [];

vi.mock("@/integrations/supabase/client", () => {
  // جدول البنود يُقرأ بـ`.order()` بعد `.eq()`، وجداول الأسماء بـ`.in()` —
  // فالحلقة قابلة للانتظار وللترتيب وللتصفية معاً.
  const makeChain = (table: string) => {
    const rows = () => tableData[table] ?? [];
    const result = () => Promise.resolve({ data: rows(), error: null });
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: (_col: string, ids: string[]) =>
        Promise.resolve({ data: rows().filter((r: any) => ids.includes(r.id)), error: null }),
      order: () => result(),
      then: (onOk: any, onErr?: any) => result().then(onOk, onErr),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        fromCalls.push(table);
        return makeChain(table);
      },
    },
  };
});

import { loadInvoiceExtras, loadQuoteExtras, clearPrintExtrasCache } from "@/utils/printExtras";

beforeEach(() => {
  tableData.invoice_transports = [];
  tableData.invoice_packaging = [];
  tableData.invoices_packaging_items = [];
  tableData.quote_transports = [];
  tableData.quotes_packaging = [];
  tableData.quotes_packaging_items = [];
  tableData.transporters = [];
  tableData.destinations = [];
  tableData.packaging_types = [];
  fromCalls.length = 0;
  clearPrintExtrasCache();
});

describe("loadInvoiceExtras", () => {
  it("returns {} when invoiceId is empty", async () => {
    const res = await loadInvoiceExtras("");
    expect(res).toEqual({});
  });

  it("returns undefined fields when no records exist", async () => {
    const res = await loadInvoiceExtras("inv-1");
    expect(res.transportInfo).toBeUndefined();
    expect(res.packagingInfo).toBeUndefined();
  });

  it("returns HTML strings when records exist", async () => {
    // معرّفات لا كائنات — كما في القاعدة الحيّة
    tableData.transporters = [{ id: "tr1", name: "Fast Co", phone: "0100000000", address: "Riyadh HQ" }];
    tableData.packaging_types = [{ id: "pt1", name: "Box" }];
    tableData.invoice_transports = [{ transporter_id: "tr1", destination_id: null }];
    // الترويسة تحمل حقول المستند (وزن/أبعاد/تكلفة)، والبند يحمل تغليف المستخدم
    tableData.invoice_packaging = [
      { quantity: 5, weight: 12, dimensions: "10x10", cost: 50, notes: null, packaging_type_id: null },
    ];
    tableData.invoices_packaging_items = [
      { product_name: "Widget", packs_count: 2, pieces_per_pack: 5, quantity: 10, packaging_type_id: "pt1" },
    ];
    const res = await loadInvoiceExtras("inv-1");
    expect(res.transportInfo).toBeDefined();
    expect(res.transportInfo).toContain("الاسم:");
    expect(res.transportInfo).toContain("Fast Co");
    expect(res.transportInfo).toContain("الهاتف:");
    expect(res.transportInfo).toContain("0100000000");
    expect(res.transportInfo).toContain("العنوان:");
    expect(res.transportInfo).toContain("Riyadh HQ");
    // بيانات المركبة/السائق/التكلفة لم تعد تُطبع
    expect(res.transportInfo).not.toContain("المركبة:");
    expect(res.transportInfo).not.toContain("السائق:");

    expect(res.packagingInfo).toBeDefined();
    expect(res.packagingInfo).toContain("النوع:");
    expect(res.packagingInfo).toContain("Box");
    expect(res.packagingInfo).toContain("الكمية:");
    expect(res.packagingInfo).toContain("الوزن:");
    expect(res.packagingInfo).toContain("الإجمالي:");
  });
});

describe("loadQuoteExtras", () => {
  it("returns {} when quoteId is empty", async () => {
    const res = await loadQuoteExtras(null);
    expect(res).toEqual({});
  });

  it("returns undefined fields when no records exist", async () => {
    const res = await loadQuoteExtras("q-1");
    expect(res.transportInfo).toBeUndefined();
    expect(res.packagingInfo).toBeUndefined();
  });

  it("returns HTML strings when records exist", async () => {
    tableData.transporters = [{ id: "tr2", name: "Speedy", phone: "0200", address: "Jeddah St" }];
    tableData.packaging_types = [{ id: "pt2", name: "Crate" }];
    tableData.quote_transports = [{ transporter_id: "tr2", destination_id: null }];
    tableData.quotes_packaging = [
      { quantity: 3, weight: 7, dimensions: "5x5", cost: 25, notes: null, packaging_type_id: null },
    ];
    tableData.quotes_packaging_items = [
      { product_name: "Gadget", packs_count: 1, pieces_per_pack: 3, quantity: 3, packaging_type_id: "pt2" },
    ];
    const res = await loadQuoteExtras("q-1");
    expect(res.transportInfo).toContain("Speedy");
    expect(res.transportInfo).toContain("0200");
    expect(res.transportInfo).toContain("Jeddah St");
    expect(res.packagingInfo).toContain("Crate");
    expect(res.packagingInfo).toContain("الكمية:");
    expect(res.packagingInfo).toContain("الإجمالي:");
  });
});

describe("printExtras cache", () => {
  it("does not re-query supabase on second call with same invoice id", async () => {
    await loadInvoiceExtras("inv-cache");
    const callsAfterFirst = fromCalls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);
    await loadInvoiceExtras("inv-cache");
    expect(fromCalls.length).toBe(callsAfterFirst);
  });

  it("does not re-query supabase on second call with same quote id", async () => {
    await loadQuoteExtras("q-cache");
    const callsAfterFirst = fromCalls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);
    await loadQuoteExtras("q-cache");
    expect(fromCalls.length).toBe(callsAfterFirst);
  });

  it("re-queries after clearPrintExtrasCache", async () => {
    await loadInvoiceExtras("inv-clear");
    const callsAfterFirst = fromCalls.length;
    clearPrintExtrasCache("invoice", "inv-clear");
    await loadInvoiceExtras("inv-clear");
    expect(fromCalls.length).toBeGreaterThan(callsAfterFirst);
  });
});
