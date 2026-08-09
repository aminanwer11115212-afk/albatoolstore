/**
 * عمودُ الإجمالي بثقل جارَيه — في كل مسارٍ يُخرج ورقة.
 *
 * ## العطل الذي يحرسه
 * الكميةُ والسعر تأخذان ثقلَهما من قاعدةٍ في التنسيق (`.col-qty, .col-price`
 * بـ800)، والإجماليُّ كان يأخذه من **نمطٍ سطريّ** مكتوبٍ على الخليّة:
 *
 *     <td style="font-weight:700;">${it.total}</td>
 *
 * فيخرج أخفَّ من جارَيه في الصفّ الواحد — وهو أهمُّ رقمٍ في السطر. صوّره
 * صاحبُ المستودع مكبَّراً: «١٬٩٦٠» ثقيلةٌ وإلى جانبها «٣٬٩٢٠» أخفّ.
 *
 * ## ولمَ يُقاس الثقلُ ولا يُقرأ
 * البحثُ عن `font-weight:700` في نصّ القالب يجده في عشرة مواضع لا شأنَ لها
 * بالجدول، ولا يقول أيَّها يصيب خليّةَ الإجمالي. فتُبنى الورقةُ وتُحلَّل
 * وتُسأل الخليّةُ نفسُها عن ثقلها المُصرَّف — وهو ما يراه المستخدم.
 *
 * ## وفي كل المسارات
 * الورقةُ واحدةٌ في المعاينة والطباعة وواتساب-PDF وزرّ الإرسال ورابط العميل
 * الحيّ — كلُّها `generatePrintHTML`. ويبقى مسارُ سقوطٍ واحد لا يبلغه
 * الاستيراد: قالبُ دالّة الحافّة للروابط القديمة. فيُقاس هو أيضاً، وإلا
 * انفرد بشكلٍ آخر عند من فتح رابطاً قديماً.
 */
import { describe, it, expect } from "vitest";
import { generatePrintHTML } from "@/utils/printTemplate";
import { buildSharedDocumentHTML } from "@/utils/sharedDocumentHtml";
import { buildDocHTML } from "../../supabase/functions/document-share/template";

const company = { company_name: "شركة البتول لإسبيرات المواتر والتكاتك", phone: "0909605576" };
const customer = { name: "امين انور" };

/** بنودٌ بأرقامٍ من ورقةٍ حقيقية — الكمية والسعر والإجمالي كلُّها تظهر. */
const items = [
  { product_name: "لباد عجل خلفي ٣ عجل ٤٢×٥٥", quantity: 2, unit_price: 1960, tax_amount: 0, discount: 0, total: 3920 },
  { product_name: "استارتر ٢٠٠ زونجشن شاي لين اصلي", quantity: 1, unit_price: 64400, tax_amount: 0, discount: 0, total: 64400 },
];
const base = {
  number: "INV-65657",
  date: "2026-08-09",
  customer,
  items,
  subtotal: 68320,
  taxTotal: 0,
  discountTotal: 0,
  grandTotal: 68320,
  paidAmount: 0,
  company,
};

/**
 * جدولُ البنود. قالبُ الطباعة يسمّيه `items-table`، وقالبُ الحافّة يعرّفه
 * بـ`data-section="items"` — والمشتركُ بينهما هو الوسم.
 */
const ITEMS_TABLE = 'table[data-section="items"]';

/**
 * الثقلُ المُصرَّف لخلايا صفٍّ من البنود، كما يحسبه المتصفّح من التنسيق
 * والنمط السطريّ معاً.
 *
 * والورقةُ تُكتب في `iframe` لا تُحلَّل نصّاً: قواعدُ `<style>` لا تُطبَّق
 * حتى يصير المستندُ حيّاً، و`getComputedStyle` على مستندٍ محلَّلٍ يُرجع
 * الافتراضات وحدها فيمرّ العطلُ صامتاً.
 */
function rowWeights(html: string): { qty: string; price: string; total: string } {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const idoc = frame.contentDocument!;
  idoc.open();
  idoc.write(html);
  idoc.close();

  const table = idoc.querySelector(ITEMS_TABLE);
  if (!table) throw new Error("لا جدولَ بنودٍ في هذه الورقة");
  const heads = [...table.querySelectorAll("thead th")].map((th) => (th.textContent || "").trim());
  const row = table.querySelector("tbody tr:not(.total-row)");
  if (!row) throw new Error("لا صفَّ بندٍ في الجدول");
  const cells = [...row.children];

  /*
   * العمودُ يُعرَف بعنوانه لا بصنفه: لو نُزع الصنفُ غداً وعاد الثقلُ سطرياً
   * لوجب أن يسقط الفحصُ بفارق الثقل — لا أن يقول «لا خليّة بهذا الصنف».
   */
  const byHead = (...titles: string[]) => {
    const i = heads.findIndex((h) => titles.includes(h));
    if (i < 0) throw new Error(`لا عمودَ عنوانُه ${titles.join("/")} — العناوين: ${heads.join(" | ")}`);
    const el = cells[i];
    if (!el) throw new Error(`الصفُّ أقصرُ من عمود ${titles[0]}`);
    return idoc.defaultView!.getComputedStyle(el as Element).fontWeight;
  };

  // كشفُ الجرد يسمّي عمودَ الكمية «العدد» — والعمودُ واحدٌ والاسمان اثنان
  const out = { qty: byHead("الكمية", "العدد"), price: byHead("السعر"), total: byHead("الإجمالي") };
  frame.remove();
  return out;
}

/** كلُّ مسارٍ يُخرج ورقةَ بنود، ومن أين يبنيها. */
const PATHS: Array<{ name: string; html: () => string }> = [
  { name: "المعاينة / الطباعة — فاتورة", html: () => generatePrintHTML({ ...base, type: "invoice" } as any) },
  { name: "عرض سعر", html: () => generatePrintHTML({ ...base, type: "quote", number: "QT-11" } as any) },
  { name: "مرتجع", html: () => generatePrintHTML({ ...base, type: "return", number: "RET-3" } as any) },
  { name: "فاتورة شراء", html: () => generatePrintHTML({ ...base, type: "purchase", number: "PUR-7" } as any) },
  { name: "كشف الجرد (stocktake)", html: () => generatePrintHTML({ ...base, type: "invoice", variant: "stocktake" } as any) },
  {
    name: "رابط العميل الحيّ — من القالب نفسِه",
    html: () =>
      buildSharedDocumentHTML({
        doc_type: "invoice",
        doc: {
          invoice_number: "INV-65657", date: "2026-08-09",
          subtotal: 68320, discount: 0, shipping: 0, total: 68320, paid_amount: 0,
        },
        items,
        company,
        customer,
        prev_net: 0,
        current_net: 68320,
      } as any),
  },
  {
    name: "مسارُ السقوط — قالبُ دالّة الحافّة للروابط القديمة",
    html: () =>
      buildDocHTML({
        docTitle: "فاتورة مبيعات",
        docNumber: "INV-65657",
        date: "2026-08-09",
        customer,
        items,
        grandTotal: 68320,
        subtotal: 68320,
        company,
      }),
  },
];

describe("ثقلُ عمود الإجمالي يساوي الكمية والسعر", () => {
  it.each(PATHS)("$name", ({ html }) => {
    const w = rowWeights(html());
    expect(w).toEqual({ qty: w.qty, price: w.qty, total: w.qty });
  });

  it("والثقلُ المشترك هو 800 لا 700", () => {
    expect(rowWeights(generatePrintHTML({ ...base, type: "invoice" } as any)).total).toBe("800");
  });
});

/**
 * والثقلُ من التنسيق لا من نمطٍ سطريّ — وإلا عاد الانحرافُ من حيث أتى:
 * قاعدةٌ تُعدَّل في مكانٍ واحد وخليّةٌ لا تسمعها.
 */
describe("لا ثقلَ سطريٌّ على خليّة إجمالي", () => {
  it.each(PATHS)("$name", ({ html }) => {
    const doc = new DOMParser().parseFromString(html(), "text/html");
    // صفُّ الإجمالي العامّ ليس بنداً — ثقلُه من `.total-row td` وله شأنٌ آخر
    const offenders = [...doc.querySelectorAll(`${ITEMS_TABLE} tbody tr:not(.total-row) td`)]
      .filter((td) => /font-weight/i.test(td.getAttribute("style") || ""))
      .map((td) => td.getAttribute("style"));
    expect({ offenders }).toEqual({ offenders: [] });
  });
});
