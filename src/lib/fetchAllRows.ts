const PAGE = 1000;

/**
 * يجلب كل صفوف استعلامٍ متجاوزاً حدّ Supabase الافتراضي (1000 صف).
 *
 * ## العطل الذي عالجه
 * صفحة «إدارة عروض الأسعار» تقرأ العروض باستعلامٍ واحد بلا `range`، فتتوقّف
 * عند الألف الأولى صامتةً — لا خطأ ولا تنبيه، فقط عروضٌ ناقصة يظنّها المستخدم
 * محذوفة. والترتيب `created_at DESC` يجعل الناقص هو الأقدم، وهو أصعب ما
 * يُفتقد لأن أحداً لا يمرّ على آخر الصفحات ليعدّ.
 *
 * تُمرَّر دالةً تبني الاستعلام لكل دفعة — لأن باني Supabase يُستهلك بالتنفيذ
 * فلا يصلح استعماله مرّتين.
 *
 * @param buildQuery تبني استعلاماً جديداً محدوداً بـ`range(from, to)`
 */
export async function fetchAllRows<T = any>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: any; error: any }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    all.push(...rows);
    if (rows.length < PAGE) break; // وصلنا لآخر دفعة
  }
  return all;
}
