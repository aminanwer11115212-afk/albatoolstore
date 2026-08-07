/**
 * «المدفوع» في ملخّص كشف الحساب — رقمان تحت اسمٍ واحد.
 *
 * ## العطل كما بلّغ عنه صاحب المستودع
 * «بالنسبة لكشف الحساب، ملخّص الحساب: المدفوع مكتوبٌ غلط».
 *
 * ## وموضعُه: صندوقُ الملخّص لا يجمع العمودَ الذي يلخّصه
 * الكشفُ الواحد يعرض «المدفوع» مرّتين:
 *
 *   • **في صندوق الملخّص** أعلى الصفحة — كان `Σ invoices.paid_amount`.
 *   • **في ذيل جدول الحساب** — `accountView.rowsPaid`، وهو نقدُ الفواتير
 *     **والشحنات** معاً.
 *
 * فالرقمان يختلفان في كشفٍ واحدٍ تحت اسمٍ واحد. والصندوقُ هو الخاطئ: عمودُ
 * `paid_amount` على الفاتورة لا يعرف إلا ما كُتب على الفاتورة نفسها، فيسقط
 * منه:
 *
 *   1. **شحناتُ الرصيد** — مالٌ دخل ولم يُكتب على فاتورة.
 *   2. **ما دُفع على الحساب القديم** — دفعةُ 600,000 على فاتورة 500,000
 *      وحسابٍ قديم 200,000 تُقسَّم: 500,000 على الفاتورة و100,000 على
 *      القديم. فيقرأ الملخّصُ «المدفوع 500,000» وقد دفع العميل 600,000.
 *
 * وهي العلّةُ نفسها التي عولجت في ورقة الفاتورة من قبل («المدفوع يُشتقّ من
 * الرصيد الفعلي لا من `paid_amount`») — بقيت هنا.
 *
 * ## والعلاج: مصدرٌ واحد
 * الصندوقُ يقرأ من `accountView` كالجدول تماماً. فيقفل الكشفُ على نفسه:
 * ما في الصندوق = ما في ذيل العمود.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
const PAGE = read("src/pages/CustomerStatementPage.tsx");

/* ─────────── ١) الأرقام من مصدرٍ واحد ─────────── */

describe("ملخّصُ الكشف يجمع العمودَ الذي يلخّصه", () => {
  it("«المدفوع» يُشتقّ من `rowsPaid` لا من مجموعِ paid_amount", () => {
    expect(PAGE).toMatch(/const totalPaid = accountView\.rowsPaid;/);
    // ولا يبقى مجموعٌ يدويّ لـ`paid_amount` يُعرض تحت هذا الاسم
    expect(PAGE).not.toMatch(/totalPaid\s*=\s*filteredInvoices\.reduce/);
  });

  it("و«إجمالي الفواتير» كذلك — العمودُ وذيلُه واحد", () => {
    expect(PAGE).toMatch(/const totalInvoices = accountView\.rowsValue;/);
    expect(PAGE).not.toMatch(/totalInvoices\s*=\s*filteredInvoices\.reduce/);
  });

  /**
   * الجدولُ يقفل على نفسه: Σ القيمة − Σ المدفوع = صافي الحساب. فإن قرأ
   * الصندوقُ من مصدرٍ آخر انكسر الطرحُ في عين القارئ وإن صحّ في الجدول.
   */
  it("فيقفل الكشفُ على نفسه: الصندوقُ يساوي ذيلَ عموده", () => {
    const summary = /summary:\s*\[([\s\S]*?)\]/.exec(PAGE)?.[1] || "";
    const tableTotals = /totals:\s*\{([\s\S]*?)\}/.exec(PAGE)?.[1] || "";
    // الصندوقُ يعرض المتغيّرين، وهما اسمان لِما في ذيل العمود
    expect(summary).toContain("totalInvoices");
    expect(summary).toContain("totalPaid");
    expect(tableTotals).toContain("accountView.rowsValue");
    expect(tableTotals).toContain("accountView.rowsPaid");
  });
});

/* ─────────── ٢) وصناديقُ الشاشة كصناديق الورقة ─────────── */

/**
 * الشاشةُ والورقةُ يقرؤهما نفسُ المستخدم في دقيقةٍ واحدة، فاختلافُهما أسوأ
 * من خطأٍ في أحدهما: لا يُعرف أيُّهما يُصدَّق.
 */
describe("شاشةُ الكشف تعرض ما تعرضه ورقتُه", () => {
  it("بطاقاتُ الشاشة تعرض نفسَ المتغيّرين", () => {
    const screen = PAGE.slice(PAGE.indexOf('data-section="summary"'));
    expect(screen).toContain("totalInvoices.toLocaleString()");
    expect(screen).toContain("totalPaid.toLocaleString()");
  });

  it("ولا مجموعَ يدويّ باقٍ في الملفّ", () => {
    expect(PAGE).not.toMatch(/inv\.paid_amount \|\| 0\), 0\)/);
  });
});
