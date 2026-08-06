import { supabase } from "@/integrations/supabase/client";

const PAGE = 1000;

/**
 * كم دفعةً تُطلب معاً بعد الأولى.
 *
 * الأربعُ ليست رقماً بالذوق: هي موازنةٌ بين ذهابٍ وإيابٍ أقلّ وطلباتٍ مهدورة.
 * فبمخزونٍ 2,350 صنفاً تُطلب الأولى ثمّ أربعٌ معاً — رحلتان بدل ثلاث، وتُهدر
 * اثنتان ترجعان فارغتين لا يُنتظر أيٌّ منهما وحده. ورفعُها أكثر يهدر أكثر بلا
 * ربحٍ يُذكر، لأن الرحلة الواحدة تحمل الدفعات كلَّها في وقتِ أبطئِها.
 */
const BATCH = 4;

/**
 * يجلب كل المنتجات بدون التأثر بحدّ Supabase الافتراضي (1000 صف للاستعلام).
 *
 * ## لماذا التوازي — ولماذا يُحسّ في الاستعمال
 * كان الترقيمُ تسلسلياً: `await` داخل حلقةٍ تنتظر كلُّ دفعةٍ سابقتَها. فمخزونُ
 * خمسة آلاف صنفٍ خمسُ رحلاتٍ متتابعة، وكلُّ رحلةٍ على شبكة الهاتف بين
 * 200 و500 مللي — أي ثانيةً إلى ثانيتين ونصف **قبل أن تُفتح الشاشة**.
 *
 * وتُستدعى هذه الدالّة عند فتح كلّ شاشةِ إنشاء: الفاتورة، وعرض السعر، وأمر
 * الشراء، ومرتجع المخزون. فالتأخيرُ يقع في أكثر ما يُفتح في اليوم.
 *
 * فصارت الأولى وحدها، ثمّ ما بعدها معاً على دفعاتٍ من `BATCH`:
 *
 *     قبل  ▸ ①→②→③→④→⑤        خمسُ رحلاتٍ متتابعة
 *     بعد  ▸ ① ثمّ ②③④⑤ معاً    رحلتان
 *
 * ## والناتجُ نفسه حرفياً
 * الترتيبُ محفوظ: الدفعاتُ تُجمَّع بترتيب مداها لا بترتيب وصولها، ويُقصّ ما
 * بعد أوّل دفعةٍ ناقصة — فلا صفَّ يتكرّر ولا صفَّ يسقط. يحرسه
 * `fetchAllProducts.test.ts` بمقارنة الناتج والمدَيات معاً.
 */
export async function fetchAllProducts<T = any>(
  columns = "*",
  orderBy: { column: string; ascending?: boolean } = { column: "name", ascending: true },
): Promise<T[]> {
  const page = async (from: number): Promise<T[]> => {
    const { data, error } = await supabase
      .from("products")
      .select(columns)
      .order(orderBy.column, { ascending: orderBy.ascending ?? true, nullsFirst: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    return (data || []) as unknown as T[];
  };

  const first = await page(0);
  if (first.length < PAGE) return first;

  const all: T[] = [...first];
  let from = PAGE;
  for (;;) {
    const batch = await Promise.all(
      Array.from({ length: BATCH }, (_, i) => page(from + i * PAGE)),
    );
    // الضمُّ بترتيب المدى لا بترتيب الوصول — التوازي لا يُغيّر الترتيب
    for (const rows of batch) all.push(...rows);
    // أوّلُ دفعةٍ ناقصةٍ تُنهي الجلب: ما بعدها فارغٌ بالضرورة
    if (batch.some((rows) => rows.length < PAGE)) return all;
    from += BATCH * PAGE;
  }
}
