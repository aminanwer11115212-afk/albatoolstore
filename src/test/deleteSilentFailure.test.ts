/**
 * البند 3 — زرّ الحذف الذي «فيه مشكلة».
 *
 * سياسة `RLS` للحذف على `quotes` مقصورةٌ على الأدمن:
 *
 *     CREATE POLICY "quotes_delete" ON public.quotes FOR DELETE TO authenticated
 *       USING (public.has_role(auth.uid(),'admin'));
 *
 * وحين تمنع السياسة الصفَّ **لا يأتي خطأ** — بل ينجح الطلب بصفر صفوف محذوفة.
 * فالمسار القديم `const { error } = await ...delete()` يرى `error === null`
 * فيمضي: رسالة «تم حذف العرض»، واختفاءٌ تفاؤلي من القائمة، ثم عودةُ العرض عند
 * أوّل تحديث. لا رسالة تشرح، فيبدو الزرّ معطوباً بلا سبب.
 *
 * العلاج: `.select("id")` يُرجع الصفوف المحذوفة فعلاً — وصفرُها خطأ صريح.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/** يحاكي ردّ PostgREST على حذفٍ منعته السياسة: بلا خطأ وبلا صفوف. */
function makeClient(deletedRows: any[]) {
  const chain: any = {
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    select: vi.fn(() => Promise.resolve({ data: deletedRows, error: null })),
  };
  return { from: vi.fn(() => chain), chain };
}

/** نفس منطق `remove` في `useTable` — مستخرجاً ليُختبر بلا React Query. */
async function removeRow(client: any, table: string, id: string) {
  const { data, error } = await client.from(table).delete().eq("id", id).select("id");
  if (error) throw error;
  if (Array.isArray(data) && data.length === 0) {
    throw new Error("لم يُحذف السجل — تحقّق من صلاحيتك أو أنه محذوف مسبقاً");
  }
}

describe("حذفٌ منعته سياسة RLS", () => {
  it("صفر صفوف محذوفة ⇒ خطأ صريح لا نجاحٌ كاذب", async () => {
    const client = makeClient([]);
    await expect(removeRow(client, "quotes", "q1")).rejects.toThrow(/لم يُحذف السجل/);
  });

  it("الرسالة تدلّ على السبب — الصلاحية — لا على عطلٍ مبهم", async () => {
    const client = makeClient([]);
    await expect(removeRow(client, "quotes", "q1")).rejects.toThrow(/صلاحيتك/);
  });
});

describe("حذفٌ ناجح", () => {
  it("صفٌّ محذوف ⇒ لا خطأ", async () => {
    const client = makeClient([{ id: "q1" }]);
    await expect(removeRow(client, "quotes", "q1")).resolves.toBeUndefined();
  });

  it("يطلب الصفوف المحذوفة فعلاً — بلا `select` لا سبيل للتمييز", async () => {
    const client = makeClient([{ id: "q1" }]);
    await removeRow(client, "quotes", "q1");
    expect(client.chain.select).toHaveBeenCalledWith("id");
  });
});

describe("خطأ صريح من الخادم يبقى كما هو", () => {
  it("لا يُبتلع ولا يُستبدل برسالة الصلاحية", async () => {
    const chain: any = {
      delete: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      select: vi.fn(() => Promise.resolve({ data: null, error: new Error("FK violation") })),
    };
    await expect(removeRow({ from: () => chain }, "quotes", "q1")).rejects.toThrow("FK violation");
  });
});

/** حراسة بنيوية: كل مسارات حذف العروض تتحقّق، لا واحدٌ منها فقط. */
describe("لا مسار حذفٍ متروك بلا تحقّق", () => {
  let read: (p: string) => string;
  beforeEach(async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
  });

  it("`useTable.remove` — زرّ الحذف في إدارة العروض وفواتيرها", () => {
    const src = read("src/hooks/useData.ts");
    expect(src).toMatch(/\.delete\(\)\.eq\("id", id\)\.select\("id"\)/);
  });

  it("العروض الجانبية — مسار حذفٍ مستقلّ بجدوله الخاص", () => {
    const src = read("src/pages/SideQuotesPage.tsx");
    expect(src).toMatch(/from\("quotes"\)\.delete\(\)\.eq\("id", id\)\.select\("id"\)/);
    expect(src).toContain("لم يُحذف العرض");
  });
});
