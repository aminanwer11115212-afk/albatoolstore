import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock idb-keyval بخريطة في الذاكرة ----
const mem = new Map<string, any>();
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (k: string) => mem.get(k)),
  set: vi.fn(async (k: string, v: any) => { mem.set(k, v); }),
  del: vi.fn(async (k: string) => { mem.delete(k); }),
}));

// ---- Mock supabase.from: يفشل insert أول مرة ثم ينجح ----
let insertCallCount = 0;
const insertMock = vi.fn(() => {
  insertCallCount++;
  const failFirst = insertCallCount === 1;
  return {
    select: () => ({
      maybeSingle: async () =>
        failFirst
          ? { data: null, error: { message: "insert failed" } }
          : { data: { id: "1" }, error: null },
    }),
    // shape used by flushQueue's executeItem (no .select chain)
    then: undefined,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: (payload: any) => {
        insertCallCount++;
        const failed = insertCallCount === 1;
        return failed
          ? Promise.resolve({ data: null, error: { message: "insert failed" } })
          : Promise.resolve({ data: { id: "1" }, error: null });
      },
    })),
  },
}));

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

describe("offlineQueue: runOrQueue + flushQueue", () => {
  beforeEach(() => {
    mem.clear();
    insertCallCount = 0;
    vi.resetModules();
  });

  it("يقوم بتخزين العملية في الطابور عندما لا يوجد اتصال", async () => {
    setOnline(false);
    const { runOrQueue, getQueueCount } = await import("@/lib/offlineQueue");

    const result = await runOrQueue({
      table: "customers",
      op: "insert",
      payload: { name: "أحمد" },
      label: "إضافة عميل",
    });

    expect(result.queued).toBe(true);
    expect(await getQueueCount()).toBe(1);
  });

  it("يزامن العنصر المؤجل بنجاح بعد عودة الاتصال، ويُبقي الفاشل مع attempts و lastError عند فشل أول محاولة", async () => {
    setOnline(false);
    const { runOrQueue, flushQueue, getQueue } = await import("@/lib/offlineQueue");

    await runOrQueue({
      table: "customers",
      op: "insert",
      payload: { name: "أحمد" },
      label: "إضافة عميل",
    });

    // أول محاولة مزامنة (بعد عودة الاتصال) — supabase mock سيفشل أول insert
    setOnline(true);
    const first = await flushQueue();
    expect(first.failed).toBe(1);
    expect(first.ok).toBe(0);

    const queueAfterFail = await getQueue();
    expect(queueAfterFail.length).toBe(1);
    expect(queueAfterFail[0].attempts).toBe(1);
    expect(queueAfterFail[0].lastError).toBeTruthy();

    // ثاني محاولة — supabase mock سينجح الآن
    const second = await flushQueue();
    expect(second.ok).toBe(1);
    expect(second.failed).toBe(0);

    const queueAfterSuccess = await getQueue();
    expect(queueAfterSuccess.length).toBe(0);
  });
});
