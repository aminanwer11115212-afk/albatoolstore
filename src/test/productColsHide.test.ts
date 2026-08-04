/**
 * إخفاء أعمدة المنتجات — كزرّ العملاء تماماً، ومن مصدرٍ واحد.
 *
 * طلبها صاحب المستودع: «أضف زرّ إخفاء الأعمدة في المنتجات مثل الذي في
 * العملاء».
 *
 * ## لماذا لم تُنسخ منظومة العملاء
 * كانت مكتوبةً لصفحة العملاء وحدها: خطّافٌ من ٢٩١ سطراً ولوحةٌ من ٢٤٦. ونسخُها
 * هو النمط الذي كرّر أعطال هذا المشروع — يُصلَح موضعٌ ويبقى توأمه. فاستُخرج
 * المنطق إلى `useTableColsPref` و`TableColsControl`، وصارت شاشة العملاء غلافاً
 * فوقه. ولهذا يحرس هذا الملفّ شيئين معاً: أن المنتجات تُخفي، وأن **العملاء لم
 * تتغيّر** — فالتعميم لا يُفسد ما كان يعمل.
 *
 * ## والعطل المُمكِن الذي يحرسه أدقُّ الفحوص هنا
 * جدولُ العملاء يُرسم من قائمة المفاتيح، فالإخفاء فيه بالمفتاح. أمّا جدولُ
 * المنتجات فأعمدتُه مكتوبةٌ في موضعها داخل ملفٍّ من ٢٩٠٠ سطر، فالإخفاء فيه
 * **بالموضع** (`nth-child`). وموضعٌ خاطئ يُخفي العمود الخطأ بصمت — لا خطأ نوع،
 * ولا استثناء، بل مستخدمٌ يضغط «إخفاء السعر» فيختفي المستودع.
 *
 * فتُشتقّ المواضع الحقيقية من الترويسة نفسها (`startColDrag(N)` مكتوبٌ في كل
 * `<th>` بترتيبه الصفري) وتُقارَن بخريطة `colPositions`. فإن أُضيف عمودٌ يوماً
 * أو أُزيح، سقط هذا الفحص قبل أن يرى المستخدمُ العمودَ الخطأ يختفي.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { success: () => {}, error: () => {} }),
}));

import { useProductColsPref, PRODUCTS_MIDDLE_KEYS, PRODUCTS_COL_LABELS } from "@/hooks/useProductColsPref";
import { useCustomerColsPref, CUSTOMERS_MIDDLE_KEYS, customerColsStorageKey } from "@/hooks/useCustomerColsPref";
import { tableColsStorageKey } from "@/hooks/useTableColsPref";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
const PRODUCTS_PAGE = read("src/pages/ProductsPage.tsx");

/* ─────────── ١) الخطّاف يعمل: يُخفي ويُظهر ويحفظ ─────────── */

describe("تفضيلات أعمدة المنتجات", () => {
  beforeEach(() => localStorage.clear());

  it("تبدأ كل الأعمدة ظاهرة", () => {
    const { result } = renderHook(() => useProductColsPref());
    expect(result.current.hidden).toEqual([]);
    expect(result.current.visibleOrder).toEqual([...PRODUCTS_MIDDLE_KEYS]);
  });

  it("والإخفاء يُخرج العمود من المعروض ويُبقيه في القائمة", () => {
    const { result } = renderHook(() => useProductColsPref());
    act(() => result.current.toggleHidden("foreign_price"));
    expect(result.current.isHidden("foreign_price")).toBe(true);
    expect(result.current.visibleOrder).not.toContain("foreign_price");
    // يبقى في اللوحة كي يُظهره المستخدم ثانيةً
    expect(result.current.order).toContain("foreign_price");
  });

  it("والضغطة الثانية تُعيده", () => {
    const { result } = renderHook(() => useProductColsPref());
    act(() => result.current.toggleHidden("supplier"));
    act(() => result.current.toggleHidden("supplier"));
    expect(result.current.hidden).toEqual([]);
  });

  it("ويُحفَظ فيصمد بعد إغلاق الصفحة", async () => {
    const first = renderHook(() => useProductColsPref());
    await waitFor(() => expect(first.result.current.hidden).toEqual([]));
    act(() => first.result.current.toggleHidden("brand"));
    await waitFor(() =>
      expect(localStorage.getItem(tableColsStorageKey("products", "u1", first.result.current.formFactor))).toBeTruthy(),
    );

    const second = renderHook(() => useProductColsPref());
    await waitFor(() => expect(second.result.current.hidden).toEqual(["brand"]));
  });

  it("و«افتراضي» تُظهر الكل", () => {
    const { result } = renderHook(() => useProductColsPref());
    act(() => result.current.toggleHidden("price"));
    act(() => result.current.toggleHidden("image"));
    act(() => result.current.reset());
    expect(result.current.hidden).toEqual([]);
  });

  it("ولكل عمودٍ تسميةٌ عربية — لا مفتاحَ يظهر خاماً في اللوحة", () => {
    for (const k of PRODUCTS_MIDDLE_KEYS) {
      expect(PRODUCTS_COL_LABELS[k]).toBeTruthy();
      expect(/^[a-z_]+$/.test(PRODUCTS_COL_LABELS[k])).toBe(false);
    }
  });
});

/* ─────────── ٢) الشاشتان لا تختلطان ─────────── */

describe("تفضيلات المنتجات والعملاء في دلوين منفصلين", () => {
  beforeEach(() => localStorage.clear());

  it("مفتاح التخزين مختلف", () => {
    expect(tableColsStorageKey("products", "u1", "desktop")).not.toBe(customerColsStorageKey("u1", "desktop"));
  });

  it("وإخفاء عمودٍ في المنتجات لا يمسّ العملاء", async () => {
    const prod = renderHook(() => useProductColsPref());
    const cust = renderHook(() => useCustomerColsPref());
    await waitFor(() => expect(cust.result.current.hidden).toEqual([]));

    act(() => prod.result.current.toggleHidden("name"));

    expect(prod.result.current.isHidden("name")).toBe(true);
    expect(cust.result.current.isHidden("name")).toBe(false);
    // ولا حتى بعد إعادة القراءة من التخزين
    const again = renderHook(() => useCustomerColsPref());
    await waitFor(() => expect(again.result.current.hidden).toEqual([]));
  });
});

/* ─────────── ٣) واجهة العملاء لم تتغيّر بالتعميم ─────────── */

describe("التعميم لم يُفسد شاشة العملاء", () => {
  beforeEach(() => localStorage.clear());

  it("مفتاح التخزين نفسه — تفضيلات المستخدمين المحفوظة تُقرأ كما كانت", () => {
    expect(customerColsStorageKey("u1", "mobile")).toBe("lov:u:u1:ff:mobile:customers:cols");
  });

  it("والأعمدة العشرة كما هي بترتيبها", () => {
    expect([...CUSTOMERS_MIDDLE_KEYS]).toEqual([
      "name", "address", "phone", "region", "state", "city",
      "locality", "group", "transporter", "destination",
    ]);
  });

  it("والترتيب بالسحب باقٍ للعملاء", () => {
    const { result } = renderHook(() => useCustomerColsPref());
    act(() => result.current.moveToEnd("name"));
    expect(result.current.order[result.current.order.length - 1]).toBe("name");
  });

  it("ولا نسخةَ ثانية من المنطق — كلتا الشاشتين فوق `useTableColsPref`", () => {
    for (const f of ["src/hooks/useCustomerColsPref.ts", "src/hooks/useProductColsPref.ts"]) {
      const src = read(f);
      expect(src).toContain("useTableColsPref");
      // النسخُ يُعرَف بأثره: قراءةٌ مباشرة من التخزين داخل الغلاف
      expect(src).not.toContain("localStorage.getItem");
    }
  });
});

/* ─────────── ٤) المواضع في الصفحة تطابق الترويسة الحقيقية ─────────── */

describe("خريطة المواضع مشتقّةٌ من الجدول لا مكتوبةٌ بالحدس", () => {
  /** `colPositions` كما هي مكتوبةٌ في الصفحة. */
  const positions: Record<string, number> = (() => {
    const start = PRODUCTS_PAGE.indexOf("const colPositions");
    expect(start).toBeGreaterThan(-1);
    const body = PRODUCTS_PAGE.slice(start, PRODUCTS_PAGE.indexOf("};", start));
    const out: Record<string, number> = {};
    for (const m of body.matchAll(/(\w+):\s*(\d+)/g)) out[m[1]] = Number(m[2]);
    return out;
  })();

  /**
   * المواضع الحقيقية: كل `<th>` في ترويسة «كل المنتجات» يحمل
   * `startColDrag(N)` بفهرسه الصفري، فالموضع في CSS هو `N + 1`.
   */
  const header = (() => {
    // آخر ذكرٍ للصنف هو على `<table>` نفسه — لا في نصّ CSS ولا في قالب الطباعة
    const from = PRODUCTS_PAGE.indexOf("<thead", PRODUCTS_PAGE.lastIndexOf("products-cols-scope"));
    const to = PRODUCTS_PAGE.indexOf("</thead>", from);
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    return PRODUCTS_PAGE.slice(from, to);
  })();

  /** ترتيب عناوين الأعمدة كما تُقرأ في الترويسة، مقابل مفاتيحها. */
  const HEADING_OF: Record<string, string> = {
    name: "اسم المنتج",
    image: "الصورة",
    category: "الفئة",
    brand: "الماركة",
    warehouse: "المستودع",
    // العنوانان أدناه ملتصقان بوسمهما عمداً: «السعر» جزءٌ من «السعر الأجنبي»،
    // و«تجميد» يرد في تلميح عمود الفهرس («Shift+Enter لتجميد المحدد»).
    price: "السعر<",
    foreign_price: "السعر الأجنبي",
    supplier: "المورد",
    frozen: " تجميد</span>",
  };

  it("كل مفتاحٍ قابلٍ للتخصيص له موضع", () => {
    for (const k of PRODUCTS_MIDDLE_KEYS) expect(positions[k]).toBeGreaterThan(0);
    expect(Object.keys(positions).sort()).toEqual([...PRODUCTS_MIDDLE_KEYS].sort());
  });

  it("ولا موضعَ مكرَّر — عمودان لا يتقاسمان `nth-child`", () => {
    const vals = Object.values(positions);
    expect(new Set(vals).size).toBe(vals.length);
  });

  /**
   * فهرس كل عمود مقابل نصّ خليّته.
   *
   * الترويسة فيها فروعٌ عدّة (تقرير الأسعار، المتوفّر، النافد…) تتكرّر فيها
   * العناوين، فلا يصحّ البحث في الترويسة كلّها. والمقبض `startColDrag(N)`
   * مكتوبٌ داخل `<th>` صاحبه — فيؤخذ نصُّ الخليّة من `<th>` السابق له وحده.
   */
  const cellOfIndex: Map<number, string> = (() => {
    const out = new Map<number, string>();
    for (const m of header.matchAll(/startColDrag\((\d+),/g)) {
      const thAt = header.lastIndexOf("<th", m.index!);
      out.set(Number(m[1]), header.slice(thAt, m.index!));
    }
    return out;
  })();

  it("والموضع يطابق فهرس العمود في الترويسة فعلاً", () => {
    for (const k of PRODUCTS_MIDDLE_KEYS) {
      const found = [...cellOfIndex.entries()].filter(([, text]) => text.includes(HEADING_OF[k]));
      expect(found.length, `عنوان «${HEADING_OF[k]}» يجب أن يخصّ عموداً واحداً`).toBe(1);
      expect(positions[k], `موضع «${k}»`).toBe(found[0][0] + 1);
    }
  });

  it("والطرفان خارج التخصيص: الفهرس أوّلاً والإعدادات آخراً", () => {
    // الفهرس عمود ١ — إخفاؤه يُضيّع العدّ، والإعدادات آخرها فلا يبقى زرّ للصفّ
    expect(Math.min(...Object.values(positions))).toBe(2);
    expect(header).toContain("startColDrag(10");             // عمود الإعدادات
    expect(Math.max(...Object.values(positions))).toBe(10);  // ...وهو خارج الخريطة
    expect(Object.values(positions)).not.toContain(11);
  });
});

/* ─────────── ٥) التوصيل في الصفحة ─────────── */

describe("الزرّ موصولٌ في شاشة المنتجات", () => {
  it("اللوحة معروضةٌ ببادئة اختبارٍ خاصّة بالمنتجات", () => {
    expect(PRODUCTS_PAGE).toMatch(/<TableColsControl\s+prefs=\{productCols\}\s+testPrefix="product"/);
  });

  it("والترتيب بالسحب مُعطَّل — الإخفاء بالموضع لا يحتمل ترتيباً متغيّراً", () => {
    // لو صار الترتيب قابلاً للتغيير هنا، لزحزح المواضع وأخفى العمود الخطأ
    expect(PRODUCTS_PAGE).toContain("reorderable={false}");
  });

  it("وقواعد الإخفاء محصورةٌ في جدول المنتجات لا تُسرّب لغيره", () => {
    expect(PRODUCTS_PAGE).toContain(".products-cols-scope tr > *:nth-child(");
    expect(PRODUCTS_PAGE).toContain("products-cols-scope");
  });

  it("والقاعدة تُخفي رأس العمود وخليّته معاً — `*` لا `td`", () => {
    // `tr > *` تشمل `<th>` و`<td>`: عمودٌ بلا رأس (أو رأسٌ بلا عمود) يُزيح الجدول
    const rule = PRODUCTS_PAGE.match(/\.products-cols-scope tr > \*:nth-child\(\$\{[^}]+\}\) \{ display: none; \}/);
    expect(rule).toBeTruthy();
  });
});
