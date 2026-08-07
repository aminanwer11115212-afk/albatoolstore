/**
 * استدعاءُ فاتورةٍ للتعديل لا يغيّر معدّلَ تحويلها.
 *
 * ## العطل كما بلّغ عنه صاحب المستودع
 * «لمّا تستدعي فاتورة من شاشة آخر الفواتير في تعديل وإنشاء فاتورة، بيغيّر
 * معدّل التحويل بتاع الفاتورة براهو — يعني لو أضفت صنف بتتضاف بسعر التضريب
 * المغيَّر».
 *
 * وأثرُه في **المال**: فاتورةٌ بمعدّل 600 تُستدعى في يومٍ معدّلُه 650، فيُضاف
 * الصنفُ الجديد بـ650 بينما بقيّةُ بنودها بـ600 — فتخرج الفاتورة بأسعارٍ
 * متفاوتة لا يعرف صاحبُها من أين جاءت.
 *
 * ## والسبب سباقٌ بين أثرين
 * أثرٌ يقرأ المعدّل العام من `exchange_rates`، وأثرٌ يحمّل بنود الفاتورة
 * فيشتقّ منها معدّلها. وكلاهما غير متزامن. فحين يصل قارئُ العام **أخيراً**
 * يحسب بـ`derivedRateRef` وهو ما زال صفراً — البنودُ لم تصل — فيسقط إلى
 * العامّ ويكتبه فوق معدّل الفاتورة.
 *
 * ## والعلاج: حالةٌ تمنعه لا ترتيبٌ يُرجى
 * `defaultRateDecision` تُعيد `null` ما دامت البنودُ لم تصل في وضع التعديل —
 * أي «لا تكتب شيئاً بعد». فالسباقُ يصير غيرَ ذي أثر: أيُّهما سبق، لا قرار
 * قبل البنود.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { defaultRateDecision, resolveDefaultRate, deriveRateFromRows } from "@/utils/invoiceCreateHelpers";

const GLOBAL = 650;   // معدّل اليوم
const INVOICE = 600;  // معدّل الفاتورة المحفوظة

/* ─────────── ١) العطل بعينه: القارئُ العامّ يسبق البنود ─────────── */

describe("سباقُ المعدّل العام مع بنود الفاتورة", () => {
  /**
   * هذه هي اللحظةُ التي كان يقع فيها العطل: أثرُ المعدّل العام انتهى،
   * والبنودُ لم تصل بعد. فكان يُكتب 650 فوق 600.
   */
  it("قبل وصول البنود لا يُقرَّر شيء — وهنا كان يُكتب المعدّل العام", () => {
    expect(defaultRateDecision({ editing: true, rowsReady: false, derived: 0, global: GLOBAL })).toBeNull();
  });

  it("وبعد وصولها يُقرَّر معدّلُ الفاتورة لا معدّلُ اليوم", () => {
    expect(defaultRateDecision({ editing: true, rowsReady: true, derived: INVOICE, global: GLOBAL }))
      .toBe(INVOICE);
  });

  it("ولو وصل العامُّ بعد البنود فالنتيجةُ واحدة — الترتيبُ لا يغيّر شيئاً", () => {
    const early = defaultRateDecision({ editing: true, rowsReady: true, derived: INVOICE, global: 0 });
    const late = defaultRateDecision({ editing: true, rowsReady: true, derived: INVOICE, global: GLOBAL });
    expect(early).toBe(INVOICE);
    expect(late).toBe(INVOICE);
  });

  /**
   * والعطلُ يُعاد إنتاجه بالحساب القديم: `resolveDefaultRate` وحدها بمشتقٍّ
   * صفريٍّ تُعيد المعدّل العام — وهو ما كان يُكتب.
   */
  it("وبالحساب القديم يعود 650 فوق 600 — العطلُ نفسه", () => {
    expect(resolveDefaultRate(0, GLOBAL)).toBe(GLOBAL);
  });
});

/* ─────────── ٢) وفاتورةٌ بلا سعرٍ أجنبي ─────────── */

describe("فاتورةٌ لا يحمل أيُّ بندٍ فيها سعراً أجنبياً", () => {
  it("تأخذ المعدّل العام — لا 1، وإلا أُدرج الصنفُ بسعره الخام", () => {
    expect(defaultRateDecision({ editing: true, rowsReady: true, derived: 0, global: GLOBAL }))
      .toBe(GLOBAL);
  });

  it("ولا معدّلَ عامّاً ⇒ 1 ملاذاً أخيراً", () => {
    expect(defaultRateDecision({ editing: true, rowsReady: true, derived: 0, global: 0 })).toBe(1);
  });
});

/* ─────────── ٣) والإنشاء لا ينتظر بنوداً ─────────── */

describe("الفاتورة الجديدة", () => {
  it("تأخذ المعدّل العام فوراً — لا بنودَ تُنتظر", () => {
    expect(defaultRateDecision({ editing: false, rowsReady: false, global: GLOBAL })).toBe(GLOBAL);
  });

  it("ولا تتأثّر بمشتقٍّ عالق من فاتورةٍ سابقة", () => {
    expect(defaultRateDecision({ editing: false, rowsReady: true, derived: INVOICE, global: GLOBAL }))
      .toBe(GLOBAL);
  });
});

/* ─────────── ٤) والمشتقُّ يُقرأ من البنود كما هي ─────────── */

describe("المعدّل المشتقّ من بنود الفاتورة", () => {
  it("أوّلُ بندٍ يحمل سعراً أجنبياً ومعدّلاً", () => {
    expect(deriveRateFromRows([
      { foreign_price: 0, exchange_rate: 0 },
      { foreign_price: 10, exchange_rate: INVOICE },
      { foreign_price: 5, exchange_rate: 999 },
    ])).toBe(INVOICE);
  });

  it("وبلا بندٍ أجنبيٍّ يعود صفراً — فيُطلب العامّ", () => {
    expect(deriveRateFromRows([{ foreign_price: 0, exchange_rate: 1 }])).toBe(0);
  });
});

/* ─────────── ٥) والشاشة تستعمل القرار لا الحساب المكشوف ─────────── */

describe("شاشةُ الفاتورة تمرّ بالقرار", () => {
  const SRC = fs.readFileSync(
    path.resolve(process.cwd(), "src/screens/InvoiceCreateScreen.tsx"), "utf8",
  );

  it("تستدعي `defaultRateDecision` ولا تقرّر بنفسها", () => {
    expect(SRC).toContain("defaultRateDecision");
  });

  it("و`null` تعني «لا تكتب» — فتُفحص قبل الكتابة", () => {
    expect(SRC).toMatch(/=== null|!== null|== null|!= null/);
  });

  /**
   * ولا يُكتب المعدّل بعد أن يلمسه المستخدم: من غيّره بيده أعلمُ بما يريد
   * من أيّ اشتقاق.
   */
  it("ولا يُكتب فوق ما لمسه المستخدم", () => {
    expect(SRC).toContain("rateTouchedRef");
  });
});
