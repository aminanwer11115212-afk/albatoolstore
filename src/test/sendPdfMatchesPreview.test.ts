/**
 * زرُّ «إرسال PDF» يبني الورقةَ نفسَها التي تعرضها المعاينة.
 *
 * طلبه صاحبُ المستودع: «زر إرسال pdf اجعله يطابق المعاينة بعد التعديلات بنفس
 * كل شيء».
 *
 * ## ولمَ يفترقان أصلاً
 * الورقةُ واحدة (`generatePrintHTML`) لكنّ **من يملأ وسائطَها اثنان**:
 *   • صفحةُ المعاينة تقرأ الفاتورةَ من القاعدة وتملأ منها.
 *   • وشاشةُ الإدخال تملأ من حالة الشاشة — لتعمل قبل الحفظ وبعده.
 *
 * فقالبٌ واحدٌ لا يكفي: يكفي أن يسقط حقلٌ من أحد المُلَّاك حتى تفترق الورقتان.
 * وقد وقع هذا مرّتين قبل اليوم:
 *
 *   ١. **حساب العميل** — الشاشةُ لا تمرّره، فخرجت ورقةُ الزرّ بدَينٍ 377,860
 *      على عميلٍ له 47,740. عولج بـ`documentAccountArgs`.
 *   ٢. **ترقيمُ المعاينة** كان يُصوَّر داخل الملفّ.
 *
 * وثالثةٌ الآن: `dueDate` و`dueAmount` و`status` و`paymentMethod` — يمرّرها
 * المعاينةُ ولا تمرّرها الشاشة، والقالبُ يعلنها كلَّها في واجهته.
 *
 * ## ولهذا يُقاس التطابقُ بالحقول لا بالعين
 * يُقرأ استدعاءُ القالب في الموضعين، وتُستخرج أسماءُ الحقول الممرَّرة،
 * ويُقارَن الجمعان. فمن أضاف حقلاً في أحدهما غداً ونسي الآخر سقط الفحصُ
 * باسم الحقل.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/** يحذف التعليقات — التعليقُ العربي فيها أقواسٌ تُربك عدَّ العمق. */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/**
 * أسماءُ الحقول الممرَّرة إلى `generatePrintHTML` في نداءٍ بعينه.
 *
 * تُقرأ من المستوى الأوّل من الكائن وحده: `items` كائنٌ متداخل، وحقولُه ليست
 * حقولَ الورقة. فيُقسَّم الجسمُ بفواصلِ المستوى الأوّل، ويُؤخذ من كل مقطعٍ
 * صدرُه.
 *
 * **والاختصارُ يُقرأ كما تُقرأ الصيغةُ الكاملة**: `paymentMethod,` حقلٌ مثل
 * `paymentMethod: x`. واشتراطُ النقطتين أوّلَ مرّةٍ أسقط خمسةَ حقولٍ من
 * القراءة فبدت ناقصةً في الشاشة وهي فيها.
 */
function argKeysOf(src: string, callIndex = 0): Set<string> {
  const calls = [...src.matchAll(/generatePrintHTML\(\{/g)];
  const start = calls[callIndex].index! + calls[callIndex][0].length - 1;
  let depth = 0, end = start;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = stripComments(src.slice(start + 1, end));

  // تقسيمٌ بفواصلِ المستوى الأوّل
  const segments: string[] = [];
  let d = 0, last = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "{" || c === "[" || c === "(") d++;
    else if (c === "}" || c === "]" || c === ")") d--;
    else if (c === "," && d === 0) { segments.push(body.slice(last, i)); last = i + 1; }
  }
  segments.push(body.slice(last));

  const keys = new Set<string>();
  for (const seg of segments) {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(seg);
    if (m) keys.add(m[1]);
  }
  return keys;
}

/** النداءُ الذي يبني فاتورةً في صفحة المعاينة (بعد نداء عرض السعر). */
const PREVIEW = read("src/pages/DocumentPreviewPage.tsx");
const SCREEN = read("src/screens/InvoiceCreateScreen.tsx");

const previewInvoiceCall = (() => {
  const calls = [...PREVIEW.matchAll(/generatePrintHTML\(\{/g)];
  // نداءُ الفاتورة هو الذي يليه `type: "invoice"` مباشرةً
  const idx = calls.findIndex((c) =>
    /type:\s*"invoice"/.test(PREVIEW.slice(c.index!, c.index! + 200)));
  expect(idx, "لم يُعثر على نداء الفاتورة في صفحة المعاينة").toBeGreaterThan(-1);
  return idx;
})();

const previewKeys = argKeysOf(PREVIEW, previewInvoiceCall);
const screenKeys = argKeysOf(SCREEN, 0);

/* ═══════════ ١) القارئُ نفسُه يُثبَت أنّه يقرأ ═══════════ */

describe("قارئُ الحقول", () => {
  it("يرى حقولاً معروفةً في الموضعين — فلا يمرّ الفحصُ لأنّه أعمى", () => {
    for (const k of ["type", "number", "date", "items", "grandTotal", "company"]) {
      expect(previewKeys, `المعاينة: ${k}`).toContain(k);
      expect(screenKeys, `الشاشة: ${k}`).toContain(k);
    }
    expect(previewKeys.size).toBeGreaterThan(15);
    expect(screenKeys.size).toBeGreaterThan(15);
  });

  it("ولا يعدّ حقولَ الكائنات المتداخلة حقولاً للورقة", () => {
    // `product_name` داخل `items` — ليس حقلاً في وسائط الورقة
    expect(screenKeys).not.toContain("product_name");
    expect(previewKeys).not.toContain("product_name");
  });
});

/* ═══════════ ٢) والتطابق ═══════════ */

/**
 * حقولٌ تخصّ أحدَهما بحقّ:
 *   • `previousDebt`/`previousCredit`/`currentNet`/`oldBalance`/`paidAmount`
 *     تصل الشاشةَ عبر `...accountArgs` (نشرٌ لا مفتاح) — ومصدرُهما واحدٌ
 *     مفحوصٌ في `documentAccountArgs.test.ts`.
 *   • `taxTotal` تمرّرها المعاينةُ باسمه والشاشةُ كذلك.
 */
const VIA_SPREAD = new Set([
  "previousDebt", "previousCredit", "currentNet", "oldBalance", "paidAmount",
]);

describe("حقولُ الورقة واحدةٌ في الموضعين", () => {
  it("كلُّ ما تمرّره المعاينةُ تمرّره الشاشة", () => {
    const missing = [...previewKeys].filter((k) => !screenKeys.has(k) && !VIA_SPREAD.has(k));
    expect(missing, "حقولٌ تراها المعاينةُ ولا يراها زرُّ الإرسال").toEqual([]);
  });

  /** والحقولُ التي أسقطها الزرُّ فبلّغ عنها صاحبُ المستودع — بأسمائها. */
  it.each(["dueDate", "dueAmount", "status", "paymentMethod", "hidePaidBox"])(
    "%s يمرّ في زرّ الإرسال", (k) => {
      expect(screenKeys).toContain(k);
    },
  );

  /**
   * والشاشةُ تمرّر ما لا تمرّره المعاينة — وهذا مقبول: تعملُ قبل الحفظ فتحمل
   * ما لم يصل القاعدةَ بعد. لكن لا يُقبل صامتاً: كلُّ زائدٍ يُذكر بسببه.
   */
  it("وكلُّ ما تزيده الشاشةُ له سبب", () => {
    const EXTRA_OK = new Set([
      "isCash",       // الشاشةُ تعرف نوعها قبل الحفظ
      "shipping",     // تمرّرها المعاينةُ أيضاً — تُقرأ هنا من الحالة
      "variant", "noHeader",
    ]);
    const extra = [...screenKeys].filter((k) => !previewKeys.has(k) && !EXTRA_OK.has(k));
    expect(extra, "حقولٌ في الشاشة بلا سببٍ مذكور").toEqual([]);
  });
});

/* ═══════════ ٣) والزرُّ يبني بالقالب لا بيده ═══════════ */

describe("زرُّ الإرسال", () => {
  it("يمرّر ناتجَ القالب إلى المشارِك", () => {
    const fn = SCREEN.slice(SCREEN.indexOf("async function shareCurrentPdf"),
                            SCREEN.indexOf("function buildCurrentPrintHTML"));
    expect(fn).toContain("shareDocumentPdf");
    expect(fn).toContain("buildCurrentPrintHTML");
  });

  it("وبنفس الدالّة التي تبني المعاينةَ والطباعة — لا نسخةٍ ثانية", () => {
    // ثلاثةُ مستهلكين لبانٍ واحد
    expect((SCREEN.match(/buildCurrentPrintHTML\(/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});
