import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * اختبار تكامل: إدخال اسم عميل كنص حر يجب أن:
 * 1) يطبّع الاسم ويبحث عن عميل موجود (لتفادي التكرار)
 * 2) ينشئ عميلاً جديداً إذا لم يوجد
 * 3) يحفظ عرض السعر / الفاتورة بـ customer_id صحيح
 */

// ---------- Mock Supabase client ----------
type Row = Record<string, any>;
const db: { customers: Row[]; quotes: Row[]; invoices: Row[] } = {
  customers: [],
  quotes: [],
  invoices: [],
};

function makeQuery(table: keyof typeof db) {
  const state: any = { table, filters: [] as Array<(r: Row) => boolean>, _limit: 0, _single: false, _maybe: false };
  const api: any = {
    select: () => api,
    ilike: (col: string, pattern: string) => {
      // ilike: case-insensitive, supports % wildcard
      const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i");
      state.filters.push((r: Row) => re.test(String(r[col] ?? "")));
      return api;
    },
    eq: (col: string, val: any) => {
      state.filters.push((r: Row) => r[col] === val);
      return api;
    },
    or: (expr: string) => {
      const parts = expr.split(",").map((p) => p.trim());
      const matchers = parts.map((p) => {
        const m = p.match(/^([a-z_]+)\.ilike\.(.+)$/i);
        if (!m) return () => false;
        const col = m[1];
        const pat = m[2];
        const re = new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i");
        return (r: Row) => re.test(String(r[col] ?? ""));
      });
      state.filters.push((r: Row) => matchers.some((f) => f(r)));
      return api;
    },
    limit: (n: number) => { state._limit = n; return api; },
    maybeSingle: () => { state._maybe = true; return resolve(); },
    single: () => { state._single = true; return resolve(); },
    insert: (payload: Row | Row[]) => {
      const arr = Array.isArray(payload) ? payload : [payload];
      const inserted = arr.map((p) => ({ id: `id-${Math.random().toString(36).slice(2, 10)}`, created_at: new Date().toISOString(), ...p }));
      db[table].push(...inserted);
      const ins: any = {
        select: () => ({
          single: async () => ({ data: inserted[0], error: null }),
          maybeSingle: async () => ({ data: inserted[0], error: null }),
        }),
      };
      // also allow await on insert directly
      ins.then = (cb: any) => Promise.resolve({ data: inserted, error: null }).then(cb);
      return ins;
    },
  };
  function resolve() {
    let rows = db[table].slice();
    for (const f of state.filters) rows = rows.filter(f);
    if (state._limit) rows = rows.slice(0, state._limit);
    if (state._single) return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: "no rows" } });
    if (state._maybe) return Promise.resolve({ data: rows[0] ?? null, error: null });
    return Promise.resolve({ data: rows, error: null });
  }
  // make awaitable for plain `.select(...).ilike(...)` etc.
  api.then = (cb: any) => resolve().then(cb);
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: keyof typeof db) => makeQuery(table),
    auth: { getUser: async () => ({ data: { user: { id: "user-test-1" } } }) },
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { findExistingCustomerByName, normalizeCustomerName } from "@/utils/customerMatch";

// ---------- Replicates the saveQuote/saveInvoice resolution logic ----------
async function resolveCustomerByFreeName(freeNameRaw: string) {
  const freeName = (freeNameRaw || "").trim();
  if (!freeName) throw new Error("empty");
  const existing = await findExistingCustomerByName(freeName);
  if (existing) return existing;
  const { data: { user: cu } } = await supabase.auth.getUser();
  const { data: created, error } = await (supabase.from("customers") as any)
    .insert({ name: freeName, created_by_uid: cu?.id || null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return created;
}

beforeEach(() => {
  db.customers.length = 0;
  db.quotes.length = 0;
  db.invoices.length = 0;
});

describe("normalizeCustomerName", () => {
  it("يطبّع المسافات والأحرف العربية المتشابهة", () => {
    expect(normalizeCustomerName("  أمين   أنور  ")).toBe("امين انور");
    expect(normalizeCustomerName("إبراهيم")).toBe("ابراهيم");
    expect(normalizeCustomerName("علي")).toBe(normalizeCustomerName("علي "));
  });
});

describe("Free-text customer → save quote/invoice integration", () => {
  it("ينشئ عميلاً جديداً عند عدم وجود تطابق ويحفظ عرض السعر بـ customer_id", async () => {
    const customer = await resolveCustomerByFreeName("أمين أنور");
    expect(customer.id).toBeTruthy();
    expect(db.customers).toHaveLength(1);

    const { data: quote, error } = await (supabase.from("quotes") as any)
      .insert({ quote_number: "QT-001", customer_id: customer.id, total: 1000 })
      .select()
      .single();
    expect(error).toBeNull();
    expect(quote.customer_id).toBe(customer.id);
    expect(db.quotes).toHaveLength(1);
  });

  it("يعيد استخدام العميل الموجود مع اسم حر مختلف التشكيل/المسافات (بدون تكرار)", async () => {
    // Seed
    db.customers.push({ id: "cust-existing", name: "إبراهيم محمد", created_at: "" });

    const a = await resolveCustomerByFreeName("  ابراهيم   محمد ");
    const b = await resolveCustomerByFreeName("إبراهيم محمد");

    expect(a.id).toBe("cust-existing");
    expect(b.id).toBe("cust-existing");
    expect(db.customers).toHaveLength(1); // لا تكرار
  });

  it("يحفظ الفاتورة بـ customer_id من اسم حر جديد بدون أخطاء", async () => {
    const customer = await resolveCustomerByFreeName("شركة الاختبار");

    const { data: invoice, error } = await (supabase.from("invoices") as any)
      .insert({
        invoice_number: "INV-001",
        customer_id: customer.id,
        type: "sale",
        total: 5000,
        due_amount: 5000,
        status: "pending",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(invoice.customer_id).toBe(customer.id);
    expect(invoice.invoice_number).toBe("INV-001");
    expect(db.invoices).toHaveLength(1);
  });
});
