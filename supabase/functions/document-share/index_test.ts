// اختبارات قالب رابط العميل على جانب Deno.
//
// القالب صار **نسخةً من ورقة الطباعة**: نفس الأقسام ونفس الأرقام ونفس
// الإشارة. وكان يختلف عمداً — يعرض «المطلوب النهائي» مقصوصاً عند الصفر بينما
// تعرض الطباعة «رصيد العميل الحالي» موقّعاً — فمن دفع أكثر من فاتورته يقرأ في
// رابطه «0» ولا يرى رصيده، ومن عليه حسابٌ قديم لا يراه أصلاً.
//
// المقابل على جانب Node في `src/test/shareVsPrintTemplate.test.ts` يفحص أن
// `printTemplate.ts` يعطي النصّ نفسه — فأي انحرافٍ بين القالبين يسقط في أحد
// الجانبين.

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildDocHTML } from "./index.ts";

const baseArgs = {
  docTitle: "فاتورة مبيعات",
  docNumber: "INV-001",
  date: "2026-07-07",
  customer: { name: "أحمد علي", phone: "0100", address: "شارع 1" },
  items: [
    { product_name: "منتج 1", quantity: 2, unit_price: 100, total: 200 },
    { product_name: "منتج 2", quantity: 1, unit_price: 800, total: 800 },
  ],
  grandTotal: 1000,
  subtotal: 1000,
  company: { company_name: "شركة", address: "", phone: "" },
};

function readRaw(html: string, section: "paid-amount" | "final-total"): string {
  const m = html.match(
    new RegExp(`data-section="${section}"[\\s\\S]*?class="summary-box-value[^"]*"[^>]*>([^<]+)<`),
  );
  if (!m) throw new Error("missing " + section);
  return m[1].trim();
}

/** «ما على العميل» من نصٍّ موقّع بإشارة العميل: `−700` ⇒ 700، `+500` ⇒ −500. */
function readOwed(html: string, section: "paid-amount" | "final-total"): number {
  const t = readRaw(html, section).replace(/,/g, "").trim();
  if (t.includes("خالص")) return 0;
  if (/^[−-]/.test(t)) return Number(t.replace(/^[−-]\s*/, ""));
  if (/^\+/.test(t)) return -Number(t.replace(/^\+\s*/, ""));
  return -Number(t);
}

function readBox(html: string, section: "paid-amount" | "final-total"): number {
  return Number(readRaw(html, section).replace(/,/g, ""));
}

Deno.test("رابط العميل: المدفوع + رصيد العميل = جملة الفاتورة", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 300 });
  assertEquals(readBox(html, "paid-amount"), 300);
  assertEquals(readOwed(html, "final-total"), 700);
});

Deno.test("رابط العميل: بلا دفعة ⇒ الرصيد كامل الفاتورة", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 0 });
  assertStringIncludes(html, 'data-section="paid-amount"');
  assertEquals(readOwed(html, "final-total"), baseArgs.grandTotal);
});

Deno.test("رابط العميل: مسدَّدة بالكامل ⇒ «خالص»", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 1000 });
  assertStringIncludes(readRaw(html, "final-total"), "خالص");
});

Deno.test("رابط العميل: الفائض رصيدٌ للعميل — لا يُقصّ عند الصفر", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 1500 });
  assertEquals(readOwed(html, "final-total"), -500);
  assert(readRaw(html, "final-total").startsWith("+"), "الفائض يُعرض بإشارة موجبة");
});

Deno.test("رابط العميل: لون الإشارة يطابق معناها", () => {
  const owes = buildDocHTML({ ...baseArgs, paidAmount: 300 });
  assert(/data-section="final-total"[^>]*color:#c0392b/.test(owes), "الدَّين أحمر");
  const credit = buildDocHTML({ ...baseArgs, paidAmount: 1500 });
  assert(/data-section="final-total"[^>]*color:#16a34a/.test(credit), "الفائض أخضر");
});

Deno.test("رابط العميل: الحساب القديم يظهر كما في الطباعة", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 0, previousDebt: 700 });
  assertStringIncludes(html, "الحساب القديم");
  assertStringIncludes(html, "جملة الحساب");
  // 1000 + 700 = 1700 عليه
  assertEquals(readOwed(html, "final-total"), 1700);
});

Deno.test("رابط العميل: عرض السعر لا يدخل حساب العميل", () => {
  const html = buildDocHTML({ ...baseArgs, docTitle: "عرض سعر", isQuote: true, previousDebt: 300 });
  assertStringIncludes(html, "إجمالي عرض السعر");
  assert(!html.includes("جملة الحساب"), "لا جملة حساب في عرض السعر");
  assert(!html.includes("المدفوع"), "لا صفَّ مدفوع لمستندٍ لا يُدفع");
});

Deno.test("رابط العميل: يعرض meta لتسمية الـPDF", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 0 });
  assertStringIncludes(html, '<meta name="lov-doc-label" content="فاتورة مبيعات">');
  assertStringIncludes(html, '<meta name="lov-doc-number" content="INV-001">');
  assertStringIncludes(html, '<meta name="lov-customer-name" content="أحمد علي">');
});

Deno.test("رابط العميل: اسم ملف الـPDF 'label - customer - number.pdf'", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 0 });
  assertStringIncludes(html, '"فاتورة مبيعات"');
  assertStringIncludes(html, '"INV-001"');
  assertStringIncludes(html, '"أحمد علي"');
  assertStringIncludes(html, "__parts.join(' - ')");
});

Deno.test("رابط العميل: كل أقسام ورقة الطباعة حاضرة", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 250 });
  for (
    const key of [
      "header",
      "items",
      "grand-total",
      "account-summary",
      "invoice-value",
      "majmoo-row",
      "paid-amount",
      "final-total",
      "packaging",
      "transport",
      "signatures",
    ]
  ) {
    assertStringIncludes(html, `data-section="${key}"`);
  }
  assertStringIncludes(html, "توقيع المستلم");
  assertStringIncludes(html, "تفاصيل التغليف");
  assertStringIncludes(html, "معلومات الترحيل");
});

Deno.test("رابط العميل: الشحن يدخل «قيمة الفاتورة»", () => {
  // كانت `invoiceValue` هنا تقرأ `subtotal` وحده وقالبُ الطباعة يقرأ
  // `subtotal + shipping`. ولا يظهر الفرق على صفٍّ متّسق — لأن
  // `grandTotal + discount` يساويهما — بل على صفٍّ لا تحمل `total` فيه الشحن.
  const html = buildDocHTML({
    ...baseArgs, subtotal: 1000, shipping: 250, grandTotal: 1000, paidAmount: 0,
  });
  const m = html.match(
    /data-section="invoice-value"[\s\S]*?class="summary-box-value"[^>]*>([^<]*)</,
  );
  assertEquals(m![1].trim(), "1,250");
});

Deno.test("رابط العميل: فيه تكبير وتصغير وطباعة", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 0 });
  assertStringIncludes(html, 'id="__zoom_in"');
  assertStringIncludes(html, 'id="__zoom_out"');
  assertStringIncludes(html, 'id="__zoom_reset"');
  assertStringIncludes(html, 'id="__btn_print"');
});

Deno.test("رابط العميل: إخفاء قسم من المعاينة يُخفيه هنا", () => {
  const html = buildDocHTML({ ...baseArgs, hiddenSections: ["signatures", "transport"] });
  assert(!html.includes("توقيع المستلم"));
  assert(!html.includes("معلومات الترحيل"));
  assertStringIncludes(html, "تفاصيل التغليف");
});

// ---------------------------------------------------------------------------
// دقّة الأرقام — تحمي من انحرافٍ يُظهر للعميل مبلغاً غير الذي في الطباعة.
// ---------------------------------------------------------------------------

Deno.test("رابط العميل: 0.1 + 0.2 لا يُسرّب 0.30000000000000004", () => {
  const html = buildDocHTML({ ...baseArgs, grandTotal: 0.1 + 0.2, subtotal: 0.1 + 0.2, paidAmount: 0.1 });
  assertEquals(readOwed(html, "final-total"), 0.2);
});

Deno.test("رابط العميل: دفعةٌ تزيد بكسرٍ ⇒ «خالص» لا رقمٌ سالبٌ تافه", () => {
  const html = buildDocHTML({ ...baseArgs, grandTotal: 1000.005, subtotal: 1000.005, paidAmount: 1000.006 });
  assertStringIncludes(readRaw(html, "final-total"), "خالص");
});

Deno.test("رابط العميل: المبالغ الكبيرة بفواصل الآلاف", () => {
  const big = 12_345_678_901.5;
  const html = buildDocHTML({ ...baseArgs, grandTotal: big, subtotal: big, paidAmount: 1 });
  assertStringIncludes(readRaw(html, "final-total"), ",");
  assertEquals(readOwed(html, "final-total"), big - 1);
});

Deno.test("رابط العميل: دفعات كسرية متعدّدة تُصالح ضمن دقّة العرض", () => {
  const partials = [123.45, 67.89, 200.11, 8.55];
  const paidAmount = partials.reduce((s, x) => s + x, 0);
  const grandTotal = 1000;
  const html = buildDocHTML({ ...baseArgs, grandTotal, subtotal: grandTotal, paidAmount });
  const paid = readBox(html, "paid-amount");
  const owed = readOwed(html, "final-total");
  const drift = Math.abs(paid + owed - grandTotal);
  assert(drift < 0.005, "المدفوع + الرصيد يقفلان ضمن دقّة العرض، drift=" + drift);
});

Deno.test("رابط العميل: `paid_amount` سالب في صفٍّ تالف لا يكسر الورقة", () => {
  const html = buildDocHTML({ ...baseArgs, grandTotal: 500, subtotal: 500, paidAmount: -50 });
  // المدفوع لا ينزل تحت الصفر، والرصيد يبقى ديناً على العميل.
  assert(readBox(html, "paid-amount") >= 0);
  assert(readOwed(html, "final-total") >= 500);
});
