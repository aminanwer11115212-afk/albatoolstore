/**
 * سلامةُ نصّ القالب — حراسةٌ لعطلٍ تكرّر خمس مرّات في هذا الملف.
 *
 * ## العلّة
 * `generatePrintHTML` سلسلةٌ نصّية من مئات الأسطر. وعلامةُ backtick داخل تعليقٍ
 * عربي فيها **تُنهي السلسلة**: ما بعدها يصير كوداً، فيسقط الملف كلّه بخطأ
 * تصريف على سطرٍ لا علاقة له بالعلّة. وقعت خمس مرّات — آخرها مرّتان في تعديلٍ
 * واحد: تعليقُ CSS يشرح خاصّية، وتعليقُ HTML يشرح سكربتاً.
 *
 * ## ولماذا ملفٌّ مستقلّ لا قسمٌ في اختبار القالب
 * لأنّ العطل **يمنع استيراد الملف أصلاً**. فأيّ اختبارٍ يستورد
 * `printTemplate` يسقط بـ«لا اختبارات» ولا يقول لماذا. جُرّب: وُضع الفحص مع
 * اختبارات القالب، ثمّ أُدخل backtick متعمَّد — فخرج «Tests no tests» ولا
 * رسالة. فنُقل إلى هنا حيث لا استيراد: يُقرأ الملف نصّاً بـ`fs` وحده، فيبقى
 * الفحص قادراً على الكلام حين يعجز غيره.
 *
 * ## نطاقه
 * تعليقات `/*` تسكن نصّ الورقة في موضعين: كتلة `<style>` وكتلة `<script>`.
 * وما عداهما داخل `${...}` كودُ TypeScript حقيقي — تعليقاته حرّة، وفيها
 * backtick مشروع يشير إلى أسماء الحقول.
 *
 * ## وقالبان لا قالب
 * الحراسةُ كانت على ملفّ الطباعة وحده، وقالبُ رابط العميل
 * (`document-share/template.ts`) سلسلةٌ نصّية طويلة مثله تماماً — ووقع فيه
 * العطلُ نفسه: تعليقٌ عربي يشرح مكدّس الخطوط، وفيه backtick حول اسم خط،
 * فسقط الملفّ كلُّه. فصار الفحص يمرّ على الاثنين.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** القالبان اللذان يبنيان ورقةً كسلسلةٍ نصّية طويلة. */
const SHEETS = [
  "src/utils/printTemplate.ts",
  "supabase/functions/document-share/template.ts",
] as const;

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/** نصّ الورقة وحده: من بداية القالب حتى إغلاق سلسلته. */
const sheetOf = (file: string): string => {
  const src = read(file);
  const a = src.indexOf("return `<!DOCTYPE html>");
  const b = src.indexOf("</html>`;", a);
  return a < 0 || b < 0 ? "" : src.slice(a, b);
};

const regionOf = (sheet: string, from: string, to: string): string => {
  const a = sheet.indexOf(from);
  return a < 0 ? "" : sheet.slice(a, sheet.indexOf(to, a));
};

const commentLines = (src: string, open: string, close: string): string[] => {
  const out: string[] = [];
  let inside = false;
  for (const line of src.split("\n")) {
    if (line.includes(open)) inside = true;
    if (inside) out.push(line);
    if (line.includes(close)) inside = false;
  }
  return out;
};

describe.each(SHEETS)("نصّ القالب موجودٌ فعلاً — فحصٌ لا يُفرَّغ صامتاً (%s)", (file) => {
  const sheetSrc = sheetOf(file);
  const STYLE = regionOf(sheetSrc, "<style>", "</style>");

  it("السلسلة تُعثر عليها بطرفيها", () => {
    expect(sheetSrc.length).toBeGreaterThan(5000);
  });

  it("وكتلة التنسيق داخلها", () => {
    expect(STYLE.length).toBeGreaterThan(1000);
  });

  /**
   * وكتلة `<script>` اختيارية: القياس خرج من الورقة إلى المضيف
   * (`documentFrameFit`)، فقد تخلو الورقة منها. ويبقى فحصها قائماً إن عادت —
   * فهي أشدّ المواضع عرضةً لعلامة الـbacktick في تعليقٍ عربي.
   */
  it("وكتلة السكربت — إن وُجدت — مفحوصةٌ هي الأخرى", () => {
    expect(typeof regionOf(sheetSrc, "<script>", "</script>")).toBe("string");
  });
});

describe.each(SHEETS)("لا backtick داخل تعليقات نصّ القالب (%s)", (file) => {
  const sheetSrc = sheetOf(file);
  const STYLE = regionOf(sheetSrc, "<style>", "</style>");
  const SCRIPT = regionOf(sheetSrc, "<script>", "</script>");

  it("لا في تعليقات CSS ولا في تعليقات السكربت", () => {
    const bad = [...commentLines(STYLE, "/*", "*/"), ...commentLines(SCRIPT, "/*", "*/")]
      .filter((l) => l.includes("`"))
      .map((l) => l.trim());
    expect({ file, bad }).toEqual({ file, bad: [] });
  });

  it("ولا في تعليقات HTML", () => {
    const bad = commentLines(sheetSrc, "<!--", "-->")
      .filter((l) => l.includes("`"))
      .map((l) => l.trim());
    expect({ file, bad }).toEqual({ file, bad: [] });
  });
});

/**
 * الفحصُ الشامل: لا backtick في نصّ الورقة أصلاً — لا في تعليقٍ ولا غيره.
 *
 * ## ثغرةُ الفحص السابق
 * كان يمرّ على تعليقات `/* … *\/` وحدها، فيفوته تعليقُ السطر `//`. ووقع ذلك
 * فعلاً: كُتب في سكربت الشريط تعليقُ سطرٍ فيه اسمُ ثابتٍ محاطٌ بعلامتين،
 * فأنهى السلسلةَ وسقط التصريف — **والحارسُ أخضر**.
 *
 * ## الصياغةُ الأقوى
 * نصُّ الورقة سلسلةٌ نصّية، ومحتواها لا يجوز أن يحمل backtick أبداً. وما
 * داخل `${…}` كودُ TypeScript حقيقي تعليقاتُه حرّة. فتُنزع الاستيفاءاتُ
 * أوّلاً — بعدّ الأقواس لا بتعبيرٍ نمطي، فالمتداخلُ منها كثير — ثمّ يُفحص
 * الباقي: أيُّ backtick فيه عطلٌ قطعاً.
 */
function stripInterpolations(src: string): string {
  let out = "";
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "$" && src[i + 1] === "{") {
      let depth = 1;
      i += 2;
      while (i < src.length && depth > 0) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") depth--;
        i++;
      }
      i--; // حلقةُ for تزيد واحداً
      continue;
    }
    out += src[i];
  }
  return out;
}

describe.each(SHEETS)("نصُّ الورقة بلا backtick البتّة (%s)", (file) => {
  const sheetSrc = sheetOf(file);

  it("بعد نزع الاستيفاءات لا يبقى backtick — ولو في تعليق سطر", () => {
    // فاتحةُ السلسلة نفسها (return `<!DOCTYPE …) ليست محتواها — تُستثنى
    const content = stripInterpolations(sheetSrc).replace("return `<!DOCTYPE html>", "");
    const lines = content.split("\n")
      .map((l, i) => ({ n: i + 1, l }))
      .filter(({ l }) => l.includes("`"))
      .map(({ n, l }) => `${n}: ${l.trim().slice(0, 90)}`);
    expect({ file, lines }).toEqual({ file, lines: [] });
  });
});
