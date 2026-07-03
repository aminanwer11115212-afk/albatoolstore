/**
 * يتحقق أن convertQuoteToInvoice يستخدم بادئة الفاتورة العادية (INV-)
 * بغض النظر عن قيمة is_side في العرض (عرض جانبي أو عادي).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
function table(name: string) {
  if (!db[name]) db[name] = [];
  return db[name];
}

const builder = (name: string) => {
  const filters: Array<(r: Row) => boolean> = [];
  let pendingInsert: Row | Row[] | null = null;
  let pendingUpdate: Row | null = null;
  let pendingDelete = false;
  const api: any = {
    select: () => api,
    eq: (col: string, val: any) => { filters.push((r) => r[col] === val); return api; },
    limit: () => api,
    insert: (row: Row | Row[]) => { pendingInsert = row; return api; },
    update: (row: Row) => { pendingUpdate = row; return api; },
    delete: () => { pendingDelete = true; return api; },
    single: async () => {
      if (pendingInsert) {
        const arr = Array.isArray(pendingInsert) ? pendingInsert : [pendingInsert];
        const inserted = arr.map((r) => ({ id: r.id || `id-${Math.random().toString(36).slice(2, 8)}`, ...r }));
        table(name).push(...inserted);
        return { data: inserted[0], error: null };
      }
      const rows = table(name).filter((r) => filters.every((f) => f(r)));
      return { data: rows[0] || null, error: rows[0] ? null : { message: "not found" } };
    },
    maybeSingle: async () => {
      const rows = table(name).filter((r) => filters.every((f) => f(r)));
      return { data: rows[0] || null, error: null };
    },
    then: (resolve: any) => {
      if (pendingInsert) {
        const arr = Array.isArray(pendingInsert) ? pendingInsert : [pendingInsert];
        const inserted = arr.map((r) => ({ id: r.id || `id-${Math.random().toString(36).slice(2, 8)}`, ...r }));
        table(name).push(...inserted);
        return Promise.resolve({ data: inserted, error: null }).then(resolve);
      }
      if (pendingUpdate) {
        const rows = table(name).filter((r) => filters.every((f) => f(r)));
        rows.forEach((r) => Object.assign(r, pendingUpdate));
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      }
      const rows = table(name).filter((r) => filters.every((f) => f(r)));
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  return api;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (name: string) => builder(name),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  },
}));

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
});

describe("convertQuoteToInvoice numbering", () => {
  it("ينتج فاتورة بترقيم INV- لعرض عادي (is_side=false)", async () => {
    table("company_settings").push({ invoice_prefix: "INV-", side_quote_prefix: "QTS-" });
    table("quotes").push({
      id: "q-normal", quote_number: "QT-100", customer_id: "c1",
      subtotal: 100, discount: 0, total: 100, is_side: false,
    });

    const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");
    const r = await convertQuoteToInvoice("q-normal");

    expect(r.alreadyConverted).toBe(false);
    expect(r.invoiceNumber.startsWith("INV-")).toBe(true);
    expect(r.invoiceNumber.startsWith("QTS-")).toBe(false);
  });

  it("ينتج فاتورة بترقيم INV- لعرض جانبي (is_side=true)", async () => {
    table("company_settings").push({ invoice_prefix: "INV-", side_quote_prefix: "QTS-" });
    table("quotes").push({
      id: "q-side", quote_number: "QTS-007", customer_id: "c1",
      subtotal: 200, discount: 0, total: 200, is_side: true,
    });

    const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");
    const r = await convertQuoteToInvoice("q-side");

    expect(r.alreadyConverted).toBe(false);
    expect(r.invoiceNumber.startsWith("INV-")).toBe(true);
    expect(r.invoiceNumber.startsWith("QTS-")).toBe(false);
    // الفاتورة المُنشأة في DB تحمل نفس الترقيم
    const inv = table("invoices").find((i) => i.id === r.invoiceId);
    expect(inv?.invoice_number).toBe(r.invoiceNumber);
    expect(inv?.invoice_number.startsWith("INV-")).toBe(true);
  });

  it("يحترم بادئة مخصصة من company_settings للعرض الجانبي أيضاً", async () => {
    table("company_settings").push({ invoice_prefix: "BILL-", side_quote_prefix: "QTS-" });
    table("quotes").push({
      id: "q-side-2", quote_number: "QTS-008", customer_id: "c1",
      subtotal: 50, discount: 0, total: 50, is_side: true,
    });

    const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");
    const r = await convertQuoteToInvoice("q-side-2");

    expect(r.invoiceNumber.startsWith("BILL-")).toBe(true);
    expect(r.invoiceNumber.startsWith("QTS-")).toBe(false);
  });
});
