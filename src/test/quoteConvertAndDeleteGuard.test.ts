/**
 * يغطّي:
 * 1. التحويل المتكرر لعرض السعر → يكتشف `alreadyConverted` ولا يُنشئ فاتورة جديدة.
 * 2. بعد التحويل: علم `quoteGoneRef` يمنع أي حفظ خلفي (autosave) من التنفيذ.
 * 3. بعد المسح: محاولة حفظ ثانية تكتشف غياب العرض في DB وتتحول إلى INSERT
 *    بدل UPDATE — مما يمنع FK violations في `quote_items` / `invoice_items`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- mock supabase client (in-memory) ----
type Row = Record<string, any>;
const db: Record<string, Row[]> = {};

function table(name: string) {
  if (!db[name]) db[name] = [];
  return db[name];
}

const builder = (name: string) => {
  const filters: Array<(r: Row) => boolean> = [];
  const nullFilters: Array<(r: Row) => boolean> = [];
  let pendingInsert: Row | Row[] | null = null;
  let pendingUpdate: Row | null = null;
  let pendingDelete = false;
  let selectCalled = false;
  const api: any = {
    select: () => { selectCalled = true; return api; },
    eq: (col: string, val: any) => { filters.push((r) => r[col] === val); return api; },
    is: (col: string, val: any) => {
      nullFilters.push((r) => (val === null ? r[col] == null : r[col] === val));
      return api;
    },
    in: (col: string, vals: any[]) => { filters.push((r) => vals.includes(r[col])); return api; },
    like: () => api,
    limit: () => api,
    order: () => api,
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
        const rows = table(name).filter(
          (r) => filters.every((f) => f(r)) && nullFilters.every((f) => f(r)),
        );
        rows.forEach((r) => Object.assign(r, pendingUpdate));
        return Promise.resolve({ data: selectCalled ? rows : null, error: null }).then(resolve);
      }
      if (pendingDelete) {
        const remaining = table(name).filter((r) => !filters.every((f) => f(r)));
        db[name] = remaining;
        return Promise.resolve({ data: null, error: null }).then(resolve);
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
    rpc: async (_name: string, args: any) => {
      // apply_stock_delta — best-effort stock update in the in-memory db.
      const products = table("products");
      const p = products.find((r) => r.id === args._product_id);
      if (p) p.stock_quantity = Math.max(0, Number(p.stock_quantity || 0) + Number(args._delta || 0));
      return { data: null, error: null };
    },
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
  },
}));

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
});

// Helpers لمحاكاة منطق "guard ضد FK" المُطبَّق في صفحة عرض السعر
async function checkQuoteExists(quoteId: string): Promise<boolean> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await (supabase as any).from("quotes").select("id").eq("id", quoteId).maybeSingle();
  return !!data;
}

// محاكاة saveQuote بشكل مبسّط: يعكس منطق QuoteCreatePage.saveQuote
async function saveQuoteSim(opts: { editId?: string; quoteGone: boolean; payload: any }) {
  const { supabase } = await import("@/integrations/supabase/client");
  if (opts.quoteGone) return { skipped: true as const };

  let qid = opts.editId;
  let quoteStillExists = false;
  if (opts.editId) {
    quoteStillExists = await checkQuoteExists(opts.editId);
    if (!quoteStillExists) qid = undefined;
  }
  if (opts.editId && quoteStillExists) {
    await (supabase as any).from("quotes").update(opts.payload).eq("id", opts.editId);
  } else {
    const { data } = await (supabase as any).from("quotes").insert({ ...opts.payload, id: `new-${Date.now()}` }).select().single();
    qid = data.id;
  }
  // محاولة إدراج بند بـ quote_id = qid — إن لم نعمل الـ guard لكان qid يتيمًا
  await (supabase as any).from("quote_items").insert({ quote_id: qid, product_name: "p", quantity: 1, unit_price: 10, total: 10 });
  return { skipped: false as const, qid };
}

describe("Quote convert/delete FK guard", () => {
  it("التحويل المتكرر يُرجع alreadyConverted ولا يُنشئ فاتورة ثانية", async () => {
    table("quotes").push({
      id: "q1", quote_number: "QT-001", customer_id: "c1",
      subtotal: 100, discount: 0, total: 100,
      converted_to_invoice_id: "inv-existing",
    });
    table("invoices").push({ id: "inv-existing", invoice_number: "INV-001" });
    table("company_settings").push({ invoice_prefix: "INV-" });

    const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");
    const r1 = await convertQuoteToInvoice("q1");
    const r2 = await convertQuoteToInvoice("q1");

    expect(r1.alreadyConverted).toBe(true);
    expect(r2.alreadyConverted).toBe(true);
    expect(r1.invoiceId).toBe("inv-existing");
    expect(r2.invoiceId).toBe("inv-existing");
    // لم تُنشأ فاتورة إضافية
    expect(table("invoices").length).toBe(1);
  });

  it("بعد التحويل: علم quoteGone يمنع saveQuote من إعادة إنشاء العرض", async () => {
    const result = await saveQuoteSim({ editId: "q-converted", quoteGone: true, payload: { quote_number: "QT-X" } });
    expect(result.skipped).toBe(true);
    // لا توجد عروض ولا بنود مُنشأة
    expect(table("quotes").length).toBe(0);
    expect(table("quote_items").length).toBe(0);
  });

  it("بعد المسح: الحفظ يتحول من UPDATE إلى INSERT (لا FK violation)", async () => {
    // عرض كان موجوداً ثم حُذف من DB، لكن editId لا يزال في الـ URL
    const editId = "q-deleted";
    // (db فارغة من العرض)
    const result = await saveQuoteSim({
      editId,
      quoteGone: false,
      payload: { quote_number: "QT-002", customer_id: "c1" },
    });
    expect(result.skipped).toBe(false);
    // أُنشئ عرض جديد بمعرّف جديد ≠ editId الأصلي المحذوف
    expect(result.qid).toBeDefined();
    expect(result.qid).not.toBe(editId);
    // البند مرتبط بالعرض الجديد فقط (لا بمعرف يتيم)
    expect(table("quote_items").length).toBe(1);
    expect(table("quote_items")[0].quote_id).toBe(result.qid);
    // لا يوجد بند مرتبط بـ editId المحذوف
    expect(table("quote_items").some((it) => it.quote_id === editId)).toBe(false);
  });

  it("سيناريو متكامل: تحويل ثم محاولة حفظ — لا تُنشأ نسخة عن العرض المحوَّل", async () => {
    table("quotes").push({
      id: "q2", quote_number: "QT-002", customer_id: "c1",
      subtotal: 50, discount: 0, total: 50,
    });
    table("company_settings").push({ invoice_prefix: "INV-" });

    const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");
    await convertQuoteToInvoice("q2");
    // محاكاة الحذف اليدوي للعرض بعد التحويل (كما يفعل زر التحويل في QuoteCreatePage)
    const { supabase } = await import("@/integrations/supabase/client");
    await (supabase as any).from("quotes").delete().eq("id", "q2");

    // الآن محاولة حفظ خلفي مع quoteGoneRef = true → يجب أن تُلغى
    const r = await saveQuoteSim({ editId: "q2", quoteGone: true, payload: { quote_number: "QT-002" } });
    expect(r.skipped).toBe(true);
    // العرض لا يزال محذوفاً، لم يُعَد إنشاؤه
    expect(table("quotes").find((q) => q.id === "q2")).toBeUndefined();
  });
});
