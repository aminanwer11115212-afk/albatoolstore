/**
 * معدّلُ التحويل يُحفظ مع الفاتورة — ولا يُعاد اشتقاقُه بالقسمة.
 *
 * ## العطل كما صوّره صاحبُ المستودع
 * «معدّل التحويل بتاع الفاتورة بيتغيّر لما تستدعي فاتورة». وفي صورته حقلُ
 * المعدّل يحمل **925.925926**، والبندُ: سعرٌ محلي 50000، سعرٌ أجنبي 54.
 *
 * وهذا الرقمُ ليس معدّلاً كتبه أحد — هو حاصلُ `50000 ÷ 54`.
 *
 * ## والسبب: العمودُ غيرُ موجود فيُعاد البناء بالقسمة
 * `invoice_items` فيه `unit_price` و`foreign_price` **ولا عمودَ للمعدّل**.
 * فكان يُرمى عند الحفظ ويُعاد بناؤه عند التحميل بـ`deriveRowRate(up, fp)`.
 * وأيُّ تعديلٍ يدويٍّ على السعر — أو تقريبٍ في الكسور — يجعل القسمة تُخرج
 * رقماً غيرَ الذي كتبه المستخدم. فيرى معدّلاً «تغيّر بنفسه».
 *
 * ## والعلاج بلا هجرة
 * في جدول `invoices` عمودٌ اسمه `exchange_rate` **موجودٌ ولا يُكتب ولا يُقرأ**.
 * فصار معدّلُ الفاتورة يُحفظ فيه ويُقرأ منه. والاشتقاقُ بالقسمة بقي للفواتير
 * التي حُفظت قبل ذلك وحدها.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { defaultRateDecision, deriveRowRate, deriveRateFromRows } from "@/utils/invoiceCreateHelpers";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/* ═══════════ ١) الرقمُ في الصورة ═══════════ */

describe("الرقم الذي رآه صاحب المستودع", () => {
  it("925.925926 هو ناتجُ القسمة لا معدّلٌ كتبه أحد", () => {
    expect(deriveRowRate(50000, 54)).toBeCloseTo(925.925926, 6);
  });

  /**
   * ولو كان معدّلُ الفاتورة 900 وعُدِّل السعرُ يدوياً إلى 50000، لخرج
   * الاشتقاقُ برقمٍ ثالثٍ لا يمتّ للمعدّل بصلة.
   */
  it("والاشتقاقُ ينحرف بأيّ تعديلٍ يدويٍّ على السعر", () => {
    const typedRate = 900;
    const foreign = 54;
    const auto = foreign * typedRate;              // 48,600
    expect(deriveRowRate(auto, foreign)).toBe(typedRate);      // ما دام لم يُمسّ
    // ثمّ يُدوَّر السعرُ يدوياً إلى 50,000
    expect(deriveRowRate(50000, foreign)).not.toBe(typedRate);
  });
});

/* ═══════════ ٢) قرارُ المعدّل ═══════════ */

describe("defaultRateDecision", () => {
  const G = 1200;   // المعدّل العام اليوم
  const D = 925.925926;   // المشتقّ من البنود
  const S = 900;    // المحفوظ مع الفاتورة

  it("المحفوظُ يسبق المشتقَّ والعامّ", () => {
    expect(defaultRateDecision({ editing: true, rowsReady: true, saved: S, derived: D, global: G })).toBe(S);
  });

  /**
   * ولا ينتظر البنود: معدّلُ الفاتورة يصل مع صفّها، والبنودُ استعلامٌ ثانٍ.
   * فلو انتظر لعاد السباقُ الذي عولج من قبل.
   */
  it("ولا ينتظر وصولَ البنود", () => {
    expect(defaultRateDecision({ editing: true, rowsReady: false, saved: S, derived: 0, global: G })).toBe(S);
  });

  it("وبلا محفوظٍ يُشتقّ من البنود — الفواتيرُ القديمة", () => {
    expect(defaultRateDecision({ editing: true, rowsReady: true, saved: 0, derived: D, global: G })).toBe(D);
  });

  it("وبلا بنودٍ أجنبيةٍ يسقط إلى العامّ", () => {
    expect(defaultRateDecision({ editing: true, rowsReady: true, saved: 0, derived: 0, global: G })).toBe(G);
  });

  /** والسباقُ المعالَجُ سابقاً باقٍ على حاله: لا قرارَ قبل البنود بلا محفوظ. */
  it("ولا يُقرَّر شيءٌ قبل البنود ما دام لا محفوظ", () => {
    expect(defaultRateDecision({ editing: true, rowsReady: false, saved: 0, derived: 0, global: G })).toBeNull();
  });

  it("والإنشاءُ يأخذ العامَّ دائماً", () => {
    expect(defaultRateDecision({ editing: false, rowsReady: false, saved: S, derived: D, global: G })).toBe(G);
  });
});

/* ═══════════ ٣) والشاشةُ تكتبه وتقرؤه ═══════════ */

describe("شاشةُ الفاتورة", () => {
  const SRC = read("src/screens/InvoiceCreateScreen.tsx");

  it("تكتب المعدّل في invoices.exchange_rate عند الحفظ", () => {
    expect(SRC).toMatch(/exchange_rate:\s*defaultRate\s*>\s*0\s*\?\s*defaultRate\s*:\s*null/);
  });

  it("وتقرؤه عند التحميل قبل أن تشتقّ من البنود", () => {
    expect(SRC).toMatch(/savedRateRef\.current\s*=\s*Number\(\(inv as any\)\.exchange_rate\)/);
    const load = SRC.indexOf("savedRateRef.current = Number((inv as any).exchange_rate)");
    const derive = SRC.indexOf("derivedRateRef.current = deriveRateFromRows(mapped)");
    expect(load, "الاشتقاقُ يسبق القراءة").toBeLessThan(derive);
  });

  it("وكلُّ مواضع القرار تمرّر المحفوظ", () => {
    const calls = [...SRC.matchAll(/defaultRateDecision\(\{[\s\S]{0,300}?\}\)/g)].map((m) => m[0]);
    expect(calls.length, "لا نداءَ للقرار").toBeGreaterThanOrEqual(2);
    for (const c of calls) expect(c, "نداءٌ بلا saved").toContain("saved:");
  });

  /** ولا يُكتب المعدّلُ فوق معدّلٍ لمسه المستخدم. */
  it("ولا يُكتب فوق ما لمسه المستخدم", () => {
    expect(SRC).toMatch(/savedRateRef\.current\s*>\s*0\s*&&\s*!rateTouchedRef\.current/);
  });
});

/* ═══════════ ٤) الاشتقاقُ باقٍ للقديم ═══════════ */

describe("الفواتيرُ القديمة", () => {
  it("تُشتقّ من أوّل بندٍ يحمل سعراً أجنبياً", () => {
    const rows = [
      { foreign_price: 0, exchange_rate: 1 },
      { foreign_price: 54, exchange_rate: 925.925926 },
    ];
    expect(deriveRateFromRows(rows)).toBeCloseTo(925.925926, 6);
  });

  it("ولا شيءَ يُشتقّ من فاتورةٍ محلّيةٍ بحتة", () => {
    expect(deriveRateFromRows([{ foreign_price: 0, exchange_rate: 1 }])).toBe(0);
  });
});
