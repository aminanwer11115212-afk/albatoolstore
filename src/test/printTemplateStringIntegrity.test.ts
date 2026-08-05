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
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const TPL = fs.readFileSync(path.resolve(process.cwd(), "src/utils/printTemplate.ts"), "utf8");

/** نصّ الورقة وحده: من بداية القالب حتى إغلاق سلسلته. */
const sheetSrc = (() => {
  const a = TPL.indexOf("return `<!DOCTYPE html>");
  const b = TPL.indexOf("</html>`;", a);
  return a < 0 || b < 0 ? "" : TPL.slice(a, b);
})();

const region = (from: string, to: string): string => {
  const a = sheetSrc.indexOf(from);
  return a < 0 ? "" : sheetSrc.slice(a, sheetSrc.indexOf(to, a));
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

const STYLE = region("<style>", "</style>");
const SCRIPT = region("<script>", "</script>");

describe("نصّ القالب موجودٌ فعلاً — فحصٌ لا يُفرَّغ صامتاً", () => {
  it("السلسلة تُعثر عليها بطرفيها", () => {
    expect(sheetSrc.length).toBeGreaterThan(5000);
  });

  it("وكتلتا التنسيق والسكربت داخلها", () => {
    expect(STYLE.length).toBeGreaterThan(1000);
    expect(SCRIPT.length).toBeGreaterThan(100);
  });
});

describe("لا backtick داخل تعليقات نصّ القالب", () => {
  it("لا في تعليقات CSS ولا في تعليقات السكربت", () => {
    const bad = [...commentLines(STYLE, "/*", "*/"), ...commentLines(SCRIPT, "/*", "*/")]
      .filter((l) => l.includes("`"))
      .map((l) => l.trim());
    expect(bad).toEqual([]);
  });

  it("ولا في تعليقات HTML", () => {
    const bad = commentLines(sheetSrc, "<!--", "-->")
      .filter((l) => l.includes("`"))
      .map((l) => l.trim());
    expect(bad).toEqual([]);
  });
});
