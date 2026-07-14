import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { purgeStaleQueries, CORE_QUERY_KEYS } from "@/lib/storageManager";

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 0 } } });
}

describe("storageManager.purgeStaleQueries", () => {
  let qc: QueryClient;
  beforeEach(() => { qc = makeClient(); });

  it("يحذف الاستعلامات الأقدم من threshold ما لم تكن core", () => {
    // core key — لا يُحذف
    qc.setQueryData(["customers"], [{ id: 1 }]);
    // non-core حديث — لا يُحذف
    qc.setQueryData(["reports-x"], { x: 1 });
    // non-core قديم — يُحذف
    qc.setQueryData(["reports-old"], { x: 2 });

    // زوّر dataUpdatedAt للاستعلام القديم إلى قبل شهر
    const cache = qc.getQueryCache();
    const old = cache.find({ queryKey: ["reports-old"] });
    if (old) (old.state as any).dataUpdatedAt = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const removed = purgeStaleQueries(qc, 14 * 24 * 60 * 60 * 1000);
    expect(removed).toBe(1);
    expect(cache.find({ queryKey: ["customers"] })).toBeTruthy();
    expect(cache.find({ queryKey: ["reports-x"] })).toBeTruthy();
    expect(cache.find({ queryKey: ["reports-old"] })).toBeFalsy();
  });

  it("لا يمسح مفاتيح whitelist مهما طال عمرها", () => {
    for (const k of CORE_QUERY_KEYS) {
      qc.setQueryData([k], { touched: true });
      const q = qc.getQueryCache().find({ queryKey: [k] });
      if (q) (q.state as any).dataUpdatedAt = 0; // قديم جداً
    }
    const removed = purgeStaleQueries(qc, 1);
    expect(removed).toBe(0);
    for (const k of CORE_QUERY_KEYS) {
      expect(qc.getQueryCache().find({ queryKey: [k] })).toBeTruthy();
    }
  });
});
