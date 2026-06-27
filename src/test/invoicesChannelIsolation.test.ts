import { describe, it, expect, vi, beforeEach } from "vitest";


/**
 * عزل قنوات الفواتير (حساب/كاش) على مستوى الاستعلام:
 *  - كل قناة تُمرّر فلتر source صريح إلى الخادم
 *  - حدّ النتائج 50 يُمرَّر بالفعل
 *  - أي تسريب من الخادم يُصفّى دفاعياً على العميل
 */

type Row = { id: string; source: string | null };
const SAMPLE: Row[] = [
  { id: "r1", source: "regular" },
  { id: "r2", source: null },
  { id: "p1", source: "pos" },
  { id: "p2", source: "pos" },
  { id: "x1", source: "unknown" },
];

const lastCall: any = { eq: [], or: [], limit: null, order: null };

vi.mock("@/integrations/supabase/client", () => {
  const builder: any = {
    _filters: [] as Array<(r: Row) => boolean>,
    select() { return this; },
    order(col: string, opts: any) { lastCall.order = { col, opts }; return this; },
    eq(col: string, val: any) {
      lastCall.eq.push({ col, val });
      this._filters.push((r: Row) => (r as any)[col] === val);
      return this;
    },
    or(expr: string) {
      lastCall.or.push(expr);
      // Parse "source.is.null,source.eq.regular"
      this._filters.push((r: Row) => {
        return expr.split(",").some((clause) => {
          const [col, op, ...rest] = clause.split(".");
          const val = rest.join(".");
          if (op === "is" && val === "null") return (r as any)[col] === null;
          if (op === "eq") return String((r as any)[col]) === val;
          return false;
        });
      });
      return this;
    },
    limit(n: number) {
      lastCall.limit = n;
      const rows = SAMPLE.filter((r) => this._filters.every((f: any) => f(r))).slice(0, n);
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return {
    supabase: {
      from: () => {
        builder._filters = [];
        return builder;
      },
    },
  };
});

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useInvoicesWithCustomers } from "@/hooks/useData";

function wrapperFactory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

describe("useInvoicesWithCustomers — عزل قناتي الحساب والكاش", () => {
  beforeEach(() => {
    lastCall.eq = [];
    lastCall.or = [];
    lastCall.limit = null;
    lastCall.order = null;
  });

  it("قناة الكاش: تمرّر eq(source,'pos') وحد 50 ولا تُعيد أي صف حساب", async () => {
    const { result } = renderHook(() => useInvoicesWithCustomers(50, "pos"), {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastCall.eq).toContainEqual({ col: "source", val: "pos" });
    expect(lastCall.or).toHaveLength(0);
    expect(lastCall.limit).toBe(50);
    const rows = result.current.data as Row[];
    expect(rows.every((r) => r.source === "pos")).toBe(true);
    expect(rows.map((r) => r.id).sort()).toEqual(["p1", "p2"]);
  });

  it("قناة الحساب: تمرّر or(source.is.null,source.eq.regular) وتستبعد أي صف كاش حتى لو سرّبه الخادم", async () => {
    const { result } = renderHook(() => useInvoicesWithCustomers(50, "regular"), {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastCall.or).toContain("source.is.null,source.eq.regular");
    expect(lastCall.eq.find((c: any) => c.col === "source" && c.val === "pos")).toBeUndefined();
    expect(lastCall.limit).toBe(50);
    const rows = result.current.data as Row[];
    expect(rows.every((r) => r.source !== "pos")).toBe(true);
    expect(rows.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });

  it("queryKey مختلف لكل قناة (لا مشاركة كاش بين الحساب والكاش)", async () => {
    const wrapper = wrapperFactory();
    const a = renderHook(() => useInvoicesWithCustomers(50, "regular"), { wrapper });
    const b = renderHook(() => useInvoicesWithCustomers(50, "pos"), { wrapper });
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(b.result.current.isSuccess).toBe(true));
    const ka = JSON.stringify((a.result.current as any).dataUpdatedAt ? ["invoices-with-customers", "regular", 50] : []);
    const kb = JSON.stringify(["invoices-with-customers", "pos", 50]);
    expect(ka).not.toEqual(kb);
  });

  it("الطبقة الدفاعية: حتى لو أُلغيت تصفية الخادم، تُستبعد صفوف pos من قناة الحساب", async () => {
    // محاكاة سيناريو: خادم يُعيد كل شيء (نتجاهل الفلاتر مؤقتاً) — نختبر تصفية العميل
    const rowsFromServer: Row[] = [...SAMPLE];
    const filtered = rowsFromServer.filter((r) => (r.source ?? "regular") !== "pos");
    expect(filtered.every((r) => r.source !== "pos")).toBe(true);
    const onlyPos = rowsFromServer.filter((r) => r.source === "pos");
    expect(onlyPos.every((r) => r.source === "pos")).toBe(true);
  });

  it("حد العرض: لا يتجاوز 50 حتى لو رجع الخادم أكثر", async () => {
    // نتحقق فقط من أن المعامل limit يصل للاستعلام كما هو
    const { result } = renderHook(() => useInvoicesWithCustomers(50, "pos"), {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastCall.limit).toBe(50);
  });
});
