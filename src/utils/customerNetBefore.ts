/**
 * صافي حساب العميل **قبل لحظة معيّنة** — يُحسب بإعادة تشغيل الأحداث زمنياً.
 *
 * ## لماذا لا نطرح الفاتورة من الرصيد الحالي
 * الطريقة القديمة في `printInvoiceDirect` كانت:
 *   `prevDebt = max(customer.balance − متبقي هذه الفاتورة, 0)`
 * أي «اطرح هذه الفاتورة من الرصيد الحالي». وهي خاطئة لسببين:
 *   1. الرصيد الحالي يحمل **فواتير أُنشئت بعد** هذه الفاتورة، فتُحسب ضمن
 *      «الحساب القديم» رغم أنها لم تكن موجودة وقتها.
 *   2. القصّ عند الصفر (`max(…, 0)`) على المديونية والرصيد الدائن كلٍّ على حدة
 *      يشوّه الصافي حين يجتمع الاثنان.
 *
 * فالحساب هنا **تاريخي حقيقي**: مجموع أثر كل حدث وقع قبل اللحظة المطلوبة.
 *
 * ## الأحداث وأثرها (بإشارة الدفاتر: موجب = على العميل)
 *   إنشاء فاتورة          → +الإجمالي
 *   دفعة نقدية/بنكية      → −المبلغ
 *   شحن رصيد / فائض       → −المبلغ
 *   سداد من الرصيد        → 0 (المديونية والرصيد ينقصان معاً)
 *
 * قيدا السداد من الرصيد (`customer_credit` سالب + دفعة `credit_balance`)
 * متلازمان وأثرهما صفر، فيُستبعدان معاً — كما في `buildCustomerAccountView`.
 */

const num = (v: any) => Number(v || 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface NetBeforeInput {
  invoices?: any[];
  transactions?: any[];
}

/** طابع زمني قابل للمقارنة: `created_at` أدقّ، وإلا `date` وحده. */
export function stampKey(row: { date?: any; created_at?: any }): string {
  const created = row?.created_at ? String(row.created_at) : "";
  if (created) {
    const d = new Date(created);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const plain = row?.date ? String(row.date).slice(0, 10) : "";
  // تاريخ بلا وقت يُعامل كبداية اليوم — فيسبق أي حركة موقّتة في نفس اليوم
  return plain ? `${plain}T00:00:00.000Z` : "";
}

interface Event {
  at: string;
  effect: number;
}

/** كل الأحداث المؤثّرة على صافي الحساب مرتّبة زمنياً. */
export function accountEvents(input: NetBeforeInput): Event[] {
  const { invoices = [], transactions = [] } = input;
  const live = invoices.filter((i) => i.status !== "cancelled");

  // استبعاد زوج السداد من الرصيد: أثره صفر فلا يغيّر أي رصيد تاريخي.
  const consumptions = transactions.filter(
    (t) => t.category === "customer_credit" && num(t.amount) < 0,
  );
  const creditPayments = transactions.filter(
    (t) => t.category === "customer_payment" && t.method === "credit_balance",
  );
  const pairedPaymentIds = new Set<string>();
  for (const c of consumptions) {
    const amt = Math.abs(num(c.amount));
    const match = creditPayments.find(
      (p) =>
        !pairedPaymentIds.has(p.id) &&
        Math.abs(num(p.amount) - amt) < 0.01 &&
        (!c.reference_id || !p.reference_id || c.reference_id === p.reference_id),
    );
    if (match) pairedPaymentIds.add(match.id);
  }

  const events: Event[] = [];

  for (const inv of live) {
    events.push({ at: stampKey(inv), effect: r2(num(inv.total)) });
  }

  for (const t of transactions) {
    if (pairedPaymentIds.has(t.id)) continue; // النصف الآخر من زوج السداد
    const amt = num(t.amount);
    if (t.category === "customer_credit") {
      // السالب استهلاك (النصف الأول من الزوج) — أثره صفر مع دفعته
      if (amt < 0) continue;
      events.push({ at: stampKey(t), effect: -r2(amt) });
      continue;
    }
    if (t.category === "customer_payment") {
      // دفعة من الرصيد بلا قيد استهلاك مقابل: تبقى دفعة عادية
      events.push({ at: stampKey(t), effect: -r2(Math.abs(amt)) });
      continue;
    }
  }

  return events.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * صافي الحساب قبل اللحظة `at` — الأحداث **السابقة لها تماماً** فقط.
 * موجب «عليه»، سالب «له».
 */
export function customerNetBefore(at: string, input: NetBeforeInput): number {
  if (!at) return 0;
  return r2(
    accountEvents(input)
      .filter((e) => e.at < at)
      .reduce((s, e) => s + e.effect, 0),
  );
}

/**
 * صافي الحساب قبل إنشاء فاتورة بعينها.
 * تُعاد `null` إن لم تُوجد الفاتورة، فيميّز المستدعي «لا بيانات» عن «صفر».
 *
 * ## لماذا تُستبعد حركات الفاتورة نفسها بدل الاكتفاء بالطابع الزمني
 * قيدٌ يحمل `date` بلا `created_at` — وبيانات مُرحَّلة كثيرة كذلك — يُعامَل
 * كبداية اليوم، فيسبق فاتورةَ الساعة العاشرة من نفس اليوم ويُحسب ضمن
 * «الحساب القديم». فتظهر دفعةُ الفاتورة كأنها رصيدٌ سابق لها، ويرى العميل
 * في «القديم» مالاً دفعه على هذه الفاتورة نفسها.
 *
 * والحدّ هنا منطقي لا زمني: **دفعةٌ على فاتورة لا تسبق إنشاءها** مهما قال
 * الطابع. فتُستبعد كل حركة تشير إليها، ثم يُطبَّق الترتيب الزمني على الباقي.
 */
export function netBeforeInvoice(invoiceId: string, input: NetBeforeInput): number | null {
  const inv = (input.invoices || []).find((i) => String(i.id) === String(invoiceId));
  if (!inv) return null;
  const id = String(invoiceId);
  return customerNetBefore(stampKey(inv), {
    invoices: input.invoices,
    transactions: (input.transactions || []).filter(
      (t) => String(t?.reference_id || "") !== id,
    ),
  });
}
