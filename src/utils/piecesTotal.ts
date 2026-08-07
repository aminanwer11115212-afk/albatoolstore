/**
 * عددُ القطع في صفّ تغليفٍ واحد — المصدرُ الواحد في النظام.
 *
 * ## العطل: رقمان لصفٍّ واحد
 * الورقةُ كانت تحسب `packs × pieces` دائماً، والعددُ يسقط أوّلاً إلى `quantity`
 * حين يغيب `packs_count`:
 *
 *     const packs = packs_count || quantity;
 *     total = packs * pieces;
 *
 * فصفٌّ فيه `packs_count = 0` و`pieces_per_pack = 3` و`quantity = 9` يخرج
 * **27** في الورقة و**9** في نافذة التغليف — والفرقُ ثلاثةُ أضعاف: `quantity`
 * حاصلُ ضربٍ أصلاً، فضُرب مرّةً ثانية.
 *
 * ## والقاعدة: العاملان إن حضرا، وإلا فالمخزَّن
 * `packs_count × pieces_per_pack` قيمةٌ **تُتحقَّق من عامليها**، فهي المصدرُ
 * حين يحضران. وإن غاب أحدُهما فلا ضربَ أصلاً: `quantity` هو ما خزّنته الشاشة
 * (`quantity: packs * pieces` في نافذة التغليف وصفحة تغليف العرض وتحويل
 * العرض إلى فاتورة)، أو عددُ الطرود في بياناتٍ سبقت العمودين.
 *
 * ## ولمَ وحدةٌ قائمةٌ بذاتها
 * كانت في `printExtras`، وهو يستورد عميل Supabase — فلا يُستورد من وحدةٍ لا
 * تحتاج قاعدةَ بيانات (تقريرُ الإرسال)، ولا من مصرِّف Playwright الذي يسقط
 * على `import.meta.env`. فصار الحسابُ وحدَه في ملفٍّ بلا تبعيّات، يستورده
 * كلُّ من يعرض «عدد القطع» — والورقةُ والتقريرُ لا يختلفان.
 *
 * يحرسه `src/test/packagingPiecesCount.test.ts`.
 */
export function piecesTotalOf(r: {
  packs_count?: any; pieces_per_pack?: any; quantity?: any;
}): number {
  const packs = Number(r.packs_count || 0);
  const pieces = Number(r.pieces_per_pack || 0);
  // ١) العاملان حاضران: القيمةُ محسوبةٌ منهما لا مأخوذةٌ من مخزَّنٍ قد يشيخ
  if (packs > 0 && pieces > 0) return packs * pieces;
  // ٢) طرودٌ بلا قطعٍ مسجَّلة: قطعةٌ في كل طرد — لا صفرٌ يبتلع البند
  if (packs > 0) return packs;
  // ٣) ولا عاملَ أصلاً: المخزَّنُ هو الخبر — ولا يُضرب في شيء
  return Number(r.quantity || 0);
}

/** مجموعُ القطع في صفوفٍ عدّة — بالقاعدة نفسها، فلا يُعاد جمعُها بيدٍ أخرى. */
export function piecesTotalSum(rows: Array<{
  packs_count?: any; pieces_per_pack?: any; quantity?: any;
}> | null | undefined): number {
  return (rows || []).reduce((s, r) => s + piecesTotalOf(r), 0);
}
