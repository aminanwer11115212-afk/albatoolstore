/**
 * جلبُ المنتجات كلِّها — الناتجُ نفسه، والانتظارُ أقلّ.
 *
 * ## العطل: خمسُ رحلاتٍ متتابعة قبل أن تُفتح الشاشة
 * كان الترقيمُ تسلسلياً — `await` داخل حلقةٍ تنتظر كلُّ دفعةٍ سابقتَها. فمخزونُ
 * خمسة آلافٍ خمسُ رحلات، وكلُّ رحلةٍ على شبكة الهاتف 200–500 مللي: ثانيةٌ إلى
 * ثانيتين ونصف تسبق فتحَ شاشة الفاتورة أو عرض السعر أو أمر الشراء.
 *
 * ## والحرّاس هنا على **الناتج** لا على السرعة وحدها
 * أخطرُ ما في التوازي أن يقلب ترتيباً أو يُكرّر صفّاً أو يُسقطه. فأكثرُ هذا
 * الملفّ يفحص أن الناتج **حرفاً بحرف** كما كان: نفس العدد، ونفس الترتيب، بلا
 * تكرار، وبنفس المدَيات المطلوبة.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => ({
    select: () => ({
      order: () => ({
        range: (from: number, to: number) => {
          const g = globalThis as any;
          g.__rangeCalls.push({ from, to });
          return Promise.resolve({ data: (g.__rows as any[]).slice(from, to + 1), error: null });
        },
      }),
    }),
  });
  return { supabase: { from: () => builder() } };
});

import { fetchAllProducts } from "@/lib/fetchAllProducts";

const g = globalThis as any;
const calls = (): Array<{ from: number; to: number }> => g.__rangeCalls;

function seed(total: number) {
  g.__rows = Array.from({ length: total }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  g.__rangeCalls = [];
}

beforeEach(() => seed(2350));

/* ─────────── ١) الناتج كما كان ─────────── */

describe("الناتجُ لا يُغيّره التوازي", () => {
  it("يجلب الألفين وثلاثمئة وخمسين كلَّها", async () => {
    const rows = await fetchAllProducts<{ id: string; name: string }>("id,name");
    expect(rows).toHaveLength(2350);
  });

  it("وبترتيبها الأصلي من أوّلها إلى آخرها", async () => {
    const rows = await fetchAllProducts<{ id: string; name: string }>("id,name");
    expect(rows[0]).toEqual({ id: "p0", name: "P0" });
    expect(rows[999]).toEqual({ id: "p999", name: "P999" });
    // حدُّ الدفعة الأولى/الثانية — أخطرُ موضعٍ على الترتيب
    expect(rows[1000]).toEqual({ id: "p1000", name: "P1000" });
    expect(rows.at(-1)).toEqual({ id: "p2349", name: "P2349" });
  });

  it("ولا صفَّ تكرّر ولا صفَّ سقط", async () => {
    const rows = await fetchAllProducts<{ id: string }>("id,name");
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(g.__rows.map((r: any) => r.id));
  });

  it("والناتجُ مُطابقٌ لما كانت تُخرجه الحلقة التسلسلية", async () => {
    const parallel = await fetchAllProducts<{ id: string }>("id,name");
    const sequential: any[] = [];
    for (let from = 0; from < 2350; from += 1000) {
      sequential.push(...g.__rows.slice(from, from + 1000));
    }
    expect(parallel).toEqual(sequential);
  });
});

/* ─────────── ٢) المدَيات ─────────── */

describe("المدَيات المطلوبة", () => {
  it("تبدأ من الصفر وتتقدّم بألفٍ بلا فجوةٍ ولا تداخل", async () => {
    await fetchAllProducts("id,name");
    const sorted = [...calls()].sort((a, b) => a.from - b.from);
    expect(sorted[0]).toEqual({ from: 0, to: 999 });
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].from).toBe(sorted[i - 1].to + 1);
    }
  });

  it("وكلُّ مدىً بعرض الدفعة تماماً", async () => {
    await fetchAllProducts("id,name");
    for (const c of calls()) expect(c.to - c.from).toBe(999);
  });
});

/* ─────────── ٣) الرحلات لا الطلبات ─────────── */

describe("التوازي: رحلاتٌ أقلّ", () => {
  /**
   * المقياسُ ليس عددَ الطلبات — التوازي يزيدها — بل عددُ **الرحلات**: كم مرّةً
   * انتظر الرمزُ الشبكةَ قبل أن يطلب ما بعدها.
   */
  it("الأولى وحدها ثمّ ما بعدها معاً — رحلتان لا ثلاث", async () => {
    const sizes: number[] = [];
    const realAll = Promise.all.bind(Promise);
    const spy = vi.spyOn(Promise, "all").mockImplementation(((ps: any) => {
      if (Array.isArray(ps)) sizes.push(ps.length);
      return realAll(ps as any);
    }) as any);

    await fetchAllProducts("id,name");
    spy.mockRestore();

    // موجةٌ واحدة من أربع دفعاتٍ بعد الأولى ⇒ رحلتان إجمالاً
    expect(sizes).toEqual([4]);
  });

  it("ومخزونٌ دون الدفعة الواحدة رحلةٌ واحدة بلا توازٍ أصلاً", async () => {
    seed(120);
    const realAll = Promise.all.bind(Promise);
    const spy = vi.spyOn(Promise, "all").mockImplementation(((ps: any) => realAll(ps as any)) as any);
    const rows = await fetchAllProducts("id,name");
    expect(rows).toHaveLength(120);
    expect(calls()).toEqual([{ from: 0, to: 999 }]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("ومخزونٌ بدفعةٍ كاملةٍ تماماً لا يسقط منه شيء", async () => {
    seed(1000);
    const rows = await fetchAllProducts<{ id: string }>("id,name");
    expect(rows).toHaveLength(1000);
    expect(rows.at(-1)).toEqual({ id: "p999", name: "P999" });
  });

  it("ومخزونٌ يتجاوز الموجة الأولى يُكمل بموجةٍ ثانية", async () => {
    seed(6000); // ① ثمّ ②③④⑤ ممتلئة، ثمّ ⑥⑦⑧⑨
    const rows = await fetchAllProducts<{ id: string }>("id,name");
    expect(rows).toHaveLength(6000);
    expect(rows[0]).toEqual({ id: "p0", name: "P0" });
    expect(rows.at(-1)).toEqual({ id: "p5999", name: "P5999" });
    expect(new Set(rows.map((r) => r.id)).size).toBe(6000);
  });
});

/* ─────────── ٤) الخطأ لا يُبتلع ─────────── */

describe("الخطأ يُرمى كما كان", () => {
  it("خطأُ الشبكة لا يمرّ صامتاً", async () => {
    const mod = await import("@/integrations/supabase/client");
    const spy = vi.spyOn(mod.supabase, "from").mockReturnValue({
      select: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: { message: "انقطع" } }) }) }),
    } as any);
    await expect(fetchAllProducts("id,name")).rejects.toMatchObject({ message: "انقطع" });
    spy.mockRestore();
  });
});
