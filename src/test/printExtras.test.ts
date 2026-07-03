import { describe, it, expect, beforeEach, vi } from "vitest";

type TableData = Record<string, any[]>;

const tableData: TableData = {
  invoice_transports: [],
  invoice_packaging: [],
  quote_transports: [],
  quotes_packaging: [],
};

const fromCalls: string[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => ({
    select: () => ({
      eq: () => Promise.resolve({ data: tableData[table] ?? [], error: null }),
    }),
  });
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
  tableData.quote_transports = [];
  tableData.quotes_packaging = [];
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
    tableData.invoice_transports = [
      {
        transporters: { name: "Fast Co", phone: "0100000000", address: "Riyadh HQ" },
      },
    ];
    tableData.invoice_packaging = [
      {
        quantity: 5,
        weight: 12,
        dimensions: "10x10",
        cost: 50,
        notes: null,
        packaging_types: { name: "Box" },
      },
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
    tableData.quote_transports = [
      {
        vehicle_number: "XYZ-9",
        driver_name: "Sara",
        transport_date: "2025-02-02",
        cost: 200,
        notes: "ملاحظة",
        transporters: { name: "Speedy" },
        destinations: { name: "Jeddah" },
      },
    ];
    tableData.quotes_packaging = [
      {
        quantity: 3,
        weight: 7,
        dimensions: "5x5",
        cost: 25,
        notes: null,
        packaging_types: { name: "Crate" },
      },
    ];
    const res = await loadQuoteExtras("q-1");
    expect(res.transportInfo).toContain("Speedy");
    expect(res.transportInfo).toContain("Jeddah");
    expect(res.transportInfo).toContain("الإجمالي:");
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
