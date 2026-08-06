/**
 * عدُّ أسطر كتلة التغليف — مساعدٌ واحدٌ لكل من يعدّها.
 *
 * كانت الكتلةُ جدولاً فكان العدُّ `/<tr[ >]/g`، ثمّ صارت أسطراً في أعمدة
 * فبطل. وكان العدُّ مكتوباً في أربعة ملفّات، فسقطت أربعتها معاً على تغييرٍ
 * واحد في الشكل — ولن تسقط مرّةً أخرى: الشكل يُعرف من هنا وحده.
 *
 * والعدُّ بسمة `data-pkg-line` لا بوسم `<div>`: البندُ ذو الملاحظة يحمل
 * `<div>` ثانياً داخله، فعدُّ الوسوم يحسبه بندين.
 */
export const PKG_LINE_ATTR = "data-pkg-line";

export function pkgLines(html: string | undefined | null): number {
  if (!html) return 0;
  return (html.match(new RegExp(PKG_LINE_ATTR, "g")) || []).length;
}
