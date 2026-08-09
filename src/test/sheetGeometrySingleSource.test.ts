/**
 * هندسةُ الورقة رقمٌ واحد — لا رقمٌ لكل مخرَج.
 *
 * ## العطل الذي يحرسه
 * الورقةُ الواحدة كانت تُقاس بهامشين، كلٌّ في مكانه:
 *
 *   | المخرَج                         | الهامش | عرضُ المحتوى |
 *   |---------------------------------|--------|--------------|
 *   | المعاينة (`.page { padding }`)  | 10mm   | 190mm        |
 *   | الطباعة (`@page { margin }`)    | 10mm   | 190mm        |
 *   | الـPDF (`A4_MM.margin`)         | **8mm**| **194mm**    |
 *
 * والفرقُ 4mm لا يُرى رقماً بل يُرى **شكلاً**: المحتوى الذي يشغل 190mm على
 * الشاشة يُرسم في 194mm في الملفّ — تمدُّدٌ نحو 2% يغيّر عرضَ الأعمدة
 * ومواضعَ التفاف الأسطر. فتخرج ورقةُ الـPDF غيرَ الورقة التي عاينها صاحبُها،
 * وهو ما تكرّر البلاغُ عنه: «شكل المعاينة مقابل باقي الأشكال».
 *
 * وكان الانحرافُ **مقيَّداً باختبارين متناقضين**: `sheetPagePlan` يثبّت
 * الثمانية، و`printLayoutA4` يثبّت العشرة — وكلاهما أخضر، لأن أحداً لم
 * يقارنهما. فهذا الفحصُ يقارنهما.
 *
 * ## القاعدة
 * ينصّ CLAUDE.md: «ومقاسُ الورقة على الشاشة — 210mm بهامش 10mm — في القالب
 * كذلك، فيراه العميل كما يراه الـPDF». فالعشرة هي المرجع، ومن احتاج الهامش
 * قرأه من `A4_MM` لا كتبه رقماً.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { A4_MM } from "@/utils/sheetPagePlan";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const PRINT_TPL = read("src/utils/printTemplate.ts");
const SHARE_TPL = read("supabase/functions/document-share/template.ts");

describe("هامشُ الورقة واحدٌ في كل مخرَج", () => {
  it("المرجع 10mm — نفس ما ينصّ عليه CLAUDE.md", () => {
    expect(A4_MM.margin).toBe(10);
  });

  it("والطباعة تقرؤه: @page margin يساوي المرجع", () => {
    const re = new RegExp(`@page \\{ size: A4; margin: ${A4_MM.margin}mm; \\}`);
    for (const [name, src] of [["print", PRINT_TPL], ["share", SHARE_TPL]] as const) {
      expect({ name, ok: re.test(src) }).toEqual({ name, ok: true });
    }
  });

  it("وورقةُ الشاشة تقرؤه: padding يساوي المرجع", () => {
    // `.page { width: 210mm; … padding: 10mm }` — نفس الرقم
    expect(PRINT_TPL).toMatch(new RegExp(`padding:\\s*${A4_MM.margin}mm`));
    expect(PRINT_TPL).toMatch(/width:\s*210mm/);
  });

  it("والـPDF يقرؤه من `A4_MM` لا يكتبه رقماً", () => {
    // شريطُ المعاينة يحقن القيمة من المصدر الواحد
    expect(PRINT_TPL).toMatch(/margin:\s*\$\{A4_MM\.margin\}/);
    // ولا يبقى رقمُ هامشٍ مكتوبٌ بيده في خيارات html2pdf
    expect(PRINT_TPL).not.toMatch(/margin:\s*8,\s*\n?\s*filename/);
  });

  it("ودالّةُ الحافّة — لا تصلها الوحدات — تكتب نفس الرقم", () => {
    // لا استيرادَ لها من `src/`، فيُقيَّد الرقمُ هنا بدل أن ينفرد
    expect(SHARE_TPL).toMatch(new RegExp(`margin:\\s*${A4_MM.margin},\\s*filename`));
  });

  it("ولا مخرَجَ يستعمل الثمانية القديمة", () => {
    const offenders: string[] = [];
    for (const f of [
      "src/utils/printTemplate.ts",
      "src/utils/shareDocumentPdf.ts",
      "src/pages/StandaloneShareDocument.tsx",
      "src/pages/PublicDocumentSharePage.tsx",
      "supabase/functions/document-share/template.ts",
    ]) {
      // خيارُ html2pdf وحده — لا كل رقم 8 في الملفّ
      if (/margin:\s*8\s*,/.test(read(f))) offenders.push(f);
    }
    expect({ offenders }).toEqual({ offenders: [] });
  });
});

describe("المساحةُ الصالحة واحدةٌ للطباعة وللملفّ", () => {
  it("190×277 — وهي 210×297 ناقصَ هامشين", () => {
    expect(A4_MM.width - 2 * A4_MM.margin).toBe(190);
    expect(A4_MM.height - 2 * A4_MM.margin).toBe(277);
  });

  it("وعرضُ المحتوى في الملفّ يساوي عرضَه على الشاشة", () => {
    // الشاشة: 210mm ناقصَ padding مرّتين. الملفّ: 210mm ناقصَ margin مرّتين.
    const screenContent = 210 - 2 * A4_MM.margin;
    const pdfContent = A4_MM.width - 2 * A4_MM.margin;
    expect(pdfContent).toBe(screenContent);
  });
});
