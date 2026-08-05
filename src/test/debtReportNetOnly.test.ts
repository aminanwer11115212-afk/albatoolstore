/**
 * تقرير المبالغ المستحقة: **صافي الحساب وحده**. ولا لفظَ «زائدة» في الكشف.
 *
 * ## ما طلبه صاحب المستودع
 *   • «تقرير المبالغ المستحقة يظهر فقط صافي حساب العميل الحالي — الذي أريده
 *     منهم أو الذي يريده مني. إلغاء فكرة التسوية وغيره».
 *   • «وتأكّد من عدم وجود كلمة دفعة زائدة في أيّ مكان في كشف الحساب».
 *
 * ## ولماذا التقسيم كان يُقرأ خطأً
 * كان الصفّ يعرض ثلاثة أرقام متجاورة: «المستحق من الفواتير»، و«رصيد دائن»،
 * و«الصافي». ورقمان متجاوران في صفٍّ واحد يوحيان بمبلغَين مستحقَّين —
 * والحقيقة أنّ أحدهما **يُطرح** من الآخر. فالتقرير الذي غرضه جوابُ سؤالٍ
 * واحد («كم لي عند هذا العميل؟») كان يطرح ثلاثة أرقامٍ ويترك الجمع للقارئ.
 *
 * والتفصيل لم يضِع: زرُّ «كشف حساب» على السطر نفسه.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { signedAmountText } from "@/utils/buildCustomerAccountView";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
const REPORT = read("src/pages/CustomerDebtReportPage.tsx");

/* ─────────── ١) التقرير: عمودُ الصافي وحده ─────────── */

describe("جدول المَدينين لا يقسّم الرقم", () => {
  it("لا عمودَ «المستحق من الفواتير»", () => {
    expect(REPORT).not.toContain("المستحق من الفواتير");
  });

  it("ولا عمودَ «رصيد دائن»", () => {
    expect(REPORT).not.toContain(">رصيد دائن<");
  });

  it("وعمودُ الصافي حاضرٌ باسمٍ يقول ما هو", () => {
    expect(REPORT).toContain("صافي الحساب");
  });

  it("ولا معادلةَ طرحٍ في الملخّص تشرح تقسيماً لم يعد موجوداً", () => {
    expect(REPORT).not.toContain("الصافي = المديونية من الفواتير");
  });

  it("وزرُّ كشف الحساب باقٍ — التفصيل مكانه لا في الصفّ", () => {
    expect(REPORT).toContain("كشف حساب");
  });

  it("وعددُ أعمدة صفّ الفراغ يطابق الترويسة", () => {
    // ترويسةٌ من خمسة أعمدة وصفُّ فراغٍ من سبعة يترك الجدول مائلاً
    const heads = (REPORT.match(/<th className="text-right px-4 py-3/g) || []).length;
    expect(heads).toBe(5);
    expect(REPORT).toContain("colSpan={5}");
  });
});

describe("والإشارة بلغة النظام الواحدة", () => {
  it("التقرير يستعمل `signedAmountText` لا تنسيقاً خاصّاً به", () => {
    expect(REPORT).toContain("signedAmountText(-c.net_balance)");
  });

  it("ويُبيّن الاتجاه بكلمةٍ: «عليه» أو «له»", () => {
    expect(REPORT).toContain('"عليه"');
    expect(REPORT).toContain('"له"');
  });

  it("والقاعدة كما في النظام: ما عليه أحمر، وما له أخضر", () => {
    // `signedAmountText` تقرأ الموجب لصالح العميل، فيُمرَّر الصافي معكوساً
    expect(signedAmountText(-1000).tone).toBe("debit");
    expect(signedAmountText(1000).tone).toBe("credit");
    expect(signedAmountText(0).tone).toBe("settled");
  });

  it("والصفر بلا إشارة — قاعدة المستودع", () => {
    expect(signedAmountText(0).text).not.toContain("+");
    expect(signedAmountText(0).text).not.toContain("−");
  });
});

/* ─────────── ٢) لا لفظَ «زائدة» في وجه العميل ─────────── */

/**
 * العميل دفع مرّةً واحدة، والزيادة تفصيلٌ محاسبيّ داخليّ لا يعنيه — يعنيه أنّ
 * له رصيداً. ولفظُ «زائدة» يوحي بخطأٍ في الدفع أو بمطالبةٍ ثانية، وكلاهما
 * غير واقع.
 */
describe("كشف الحساب بلا لفظ «دفعة زائدة»", () => {
  const VIEW = read("src/utils/buildCustomerAccountView.ts");

  /** النصوص المعروضة وحدها — لا التعليقات التي تشرح التاريخ. */
  const displayed = VIEW.split("\n")
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join("\n");

  it("لا في وصف الشحن", () => {
    expect(displayed).not.toContain("دفعة زائدة");
  });

  it("ولا في تسمية السطر", () => {
    expect(displayed).not.toContain("فائض دفعة");
  });

  it("ولا في النصّ الموجَّه للعميل", () => {
    expect(displayed).not.toContain("دفعتم زيادة");
  });

  it("وما يزيد الرصيد يُقال شحناً مهما كان مصدره", () => {
    expect(displayed).toContain('return `تم شحن +${money(amount)}`');
    expect(displayed).toContain('label: "شحن رصيد للعميل"');
  });

  it("والمصدر يبقى معروفاً برمجياً — لم يُفقد، بل غُيّب عن العين", () => {
    expect(VIEW).toContain('kind: isOverpay ? "overpay" : "credit_charge"');
  });
});

describe("ولا في سائر ما يقرؤه العميل", () => {
  const CUSTOMER_FACING = [
    "src/utils/buildCustomerAccountView.ts",
    "src/utils/buildCustomerLedger.ts",
    "src/pages/CustomerStatementPage.tsx",
    "src/pages/PublicCustomerStatementPage.tsx",
    "src/utils/statementPrintTemplate.ts",
  ];

  it.each(CUSTOMER_FACING)("%s", (file) => {
    const src = read(file);
    const displayed = src.split("\n")
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join("\n");
    expect(displayed).not.toContain("دفعة زائدة");
    expect(displayed).not.toContain("الدفعة الزائدة");
  });
});
