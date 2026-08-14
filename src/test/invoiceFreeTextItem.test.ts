/**
 * تعديلُ اسم الصنف بيدٍ داخل الفاتورة — البندُ يبقى ولا يُمحى.
 *
 * ## العطل كما بلّغ عنه صاحبُ المستودع
 * «لمّا تعدّل اسم الصنف داخل الفاتورة — لو عدّلته بيدك — طلعت وجيت الفاتورة
 * بتلقاه اتمسح».
 *
 * ## والسبب: الاسمُ في حقلٍ، والحفظُ يقرأ حقلاً آخر
 * حقلُ الاسم في الصفّ مربوطٌ بـ`productSearch`، وتعديلُه يكتب:
 *
 *     updateRow(uid, { productSearch: value, product_id: null })
 *
 * فيقع أثران معاً:
 *   ١. `product_name` يبقى على الاسم القديم — والحفظُ كان يقرؤه هو.
 *   ٢. `product_id` يصير فارغاً — والحفظُ كان يُرشّح `rows.filter(r => r.product_id)`.
 *
 * فالصفُّ يسقط من **كل شيء**: من المجاميع، ومن البنود المحفوظة، ومن حساب
 * المخزون. ولا رسالةَ تقول إنّ سطراً حُذف، والإجماليُّ يتغيّر بصمت.
 *
 * ## وبابٌ ثانٍ للعطل نفسِه
 * لو صُحّح الترشيحُ وحدَه لبقي العطل: `invoiceItemsHash` كانت تقرأ
 * `product_name` أيضاً، فلا تتغيّر البصمةُ بتعديل الاسم، فيُتخطّى إعادةُ
 * كتابة البنود (`itemsUnchanged`) ويضيع التعديل من بابٍ آخر. فالبصمةُ تقرأ
 * الآن الاسمَ **كما يُحفظ**.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isSavableRow, savedItemName, invoiceItemsHash } from "@/utils/invoiceCreateHelpers";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/** صفٌّ كما يُحمَّل من فاتورةٍ محفوظة. */
const loaded = (over: Record<string, unknown> = {}) => ({
  product_id: "p1",
  product_name: "بطارية 125 سي جي",
  productSearch: "بطارية 125 سي جي",
  quantity: 10, unit_price: 50000, foreign_price: 54, discount: 0, unit: "قطعة",
  ...over,
});

/** وما يفعله حقلُ الاسم حين يُكتب فيه بيد. */
const typeName = (row: any, value: string) => ({ ...row, productSearch: value, product_id: null });

/* ═══════════ ١) العطل مُعادُ إنتاجه ═══════════ */

describe("تعديلُ الاسم بيد", () => {
  const edited = typeName(loaded(), "بطارية 125 سي جي / دايون صغير");

  it("بالترشيح القديم كان الصفُّ يسقط تماماً", () => {
    const rows = [loaded(), edited];
    expect(rows.filter((r) => r.product_id)).toHaveLength(1);   // ← المعدَّلُ ضاع
  });

  it("وبالقاعدة الجديدة يبقى", () => {
    expect(isSavableRow(edited)).toBe(true);
    expect([loaded(), edited].filter(isSavableRow)).toHaveLength(2);
  });

  it("ويُحفظ بالاسم المكتوب لا بالقديم", () => {
    expect(savedItemName(edited)).toBe("بطارية 125 سي جي / دايون صغير");
    // والحفظُ كان يقرأ `product_name` — وهو ما زال القديم
    expect(edited.product_name).toBe("بطارية 125 سي جي");
  });

  /**
   * والبابُ الثاني: لو لم تتغيّر البصمةُ لتُخطّيت إعادةُ الكتابة، فيضيع
   * التعديلُ ولو صحّ الترشيح.
   */
  it("والبصمةُ تتغيّر بتعديل الاسم — وإلا تُخطّيت الكتابة", () => {
    expect(invoiceItemsHash([edited])).not.toBe(invoiceItemsHash([loaded()]));
  });

  it("ولا تتغيّر بلا تعديل — فلا كتابةَ بلا سبب", () => {
    expect(invoiceItemsHash([loaded()])).toBe(invoiceItemsHash([loaded()]));
  });
});

/* ═══════════ ٢) وحدودُ القاعدة ═══════════ */

describe("ما يُحفظ وما لا يُحفظ", () => {
  it("صفٌّ فارغٌ تماماً لا يُحفظ — لا سطرَ لم يُكتب", () => {
    expect(isSavableRow({ product_id: null, product_name: "", productSearch: "" })).toBe(false);
    expect(isSavableRow({ product_id: null })).toBe(false);
  });

  it("وفراغاتٌ وحدها ليست اسماً", () => {
    expect(isSavableRow({ product_id: null, productSearch: "   " })).toBe(false);
  });

  it("وبندٌ حرٌّ كُتب اسمُه ولم يُختر من القائمة يُحفظ", () => {
    expect(isSavableRow({ product_id: null, productSearch: "مسمار قلاووظ" })).toBe(true);
    expect(savedItemName({ productSearch: "مسمار قلاووظ" })).toBe("مسمار قلاووظ");
  });

  it("وبندٌ مرتبطٌ بمنتجٍ يُحفظ ولو خلا اسمُه المكتوب", () => {
    expect(isSavableRow({ product_id: "p9", productSearch: "" })).toBe(true);
  });

  /** وبندان حرّان بنفس الكمية والسعر بندان لا واحد. */
  it("وبندان حرّان مختلفا الاسم لا يُدمجان", () => {
    const a = { product_id: null, product_name: "صنف أ", quantity: 1, unit_price: 100, discount: 0 };
    const b = { product_id: null, product_name: "صنف ب", quantity: 1, unit_price: 100, discount: 0 };
    const key = (it: any) => `${it.product_id || it.product_name}|${it.quantity}|${it.unit_price}|${it.discount}`;
    expect(key(a)).not.toBe(key(b));
    // وبالمفتاح القديم كانا سواءً فيُحذف أحدُهما
    const oldKey = (it: any) => `${it.product_id}|${it.quantity}|${it.unit_price}|${it.discount}`;
    expect(oldKey(a)).toBe(oldKey(b));
  });
});

/* ═══════════ ٣) والشاشةُ تمشي على القاعدة ═══════════ */

describe("شاشةُ الفاتورة", () => {
  const SRC = read("src/screens/InvoiceCreateScreen.tsx");

  it("لا تُرشّح البنودَ بـproduct_id وحده", () => {
    expect(SRC, "ترشيحٌ يُسقط البنودَ المكتوبة بيد")
      .not.toMatch(/rows\.filter\(\(r\) => r\.product_id\)/);
  });

  it("وتستعمل القاعدةَ الواحدة في الموضعين", () => {
    expect((SRC.match(/rows\.filter\(isSavableRow\)/g) || []).length).toBe(2);
  });

  it("وتحفظ الاسمَ المكتوب", () => {
    expect(SRC).toMatch(/product_name: savedItemName\(r\)/);
  });

  it("ومفتاحُ إزالة التكرار يشمل الاسم", () => {
    expect(SRC).toMatch(/it\.product_id \|\| it\.product_name/);
  });

  /** والمخزونُ يبقى محروساً: البندُ الحرُّ لا منتجَ له فلا يُخصم منه شيء. */
  it("والمخزونُ يتخطّى البنودَ بلا منتج", () => {
    expect(SRC).toMatch(/if \(r\.product_id\) newMap\.set/);
  });
});
