/**
 * مسحُ جدولٍ كاملاً — لأداة المطوّر المخفيّة (منطقة الخطر).
 *
 * ## لمَ فلترٌ أصلاً
 * PostgREST يرفض `delete()` بلا شرط — حمايةً من مسحٍ بالخطأ. فيُمرَّر شرطٌ
 * يشمل كلَّ الصفوف: id IS NOT NULL.
 *
 * ## العطل الأوّل: شرطُ السقوط معكوس
 * لا كلُّ جدولٍ فيه عمود id. فكُتب سقوطٌ إلى `created_at`، لكنّ شرطَه كُتب
 * **معكوساً**:
 *
 *     if (error && !/id.*does not exist/.test(error.message)) { …created_at… }
 *
 * فحين يكون الخطأُ «لا عمود id» — وهي الحالةُ الوحيدة التي كُتب السقوطُ
 * لأجلها — يكون الشرطُ كاذباً فيُتخطّى السقوط، **ولا يُرمى الخطأ**. فيمضي
 * التنفيذُ ويُعلن النجاح، والجدولُ كما هو.
 *
 * وله وجهٌ ثانٍ: خطأٌ حقيقي (رفضُ صلاحية، قيدُ مفتاح أجنبي) كان يقود إلى
 * `created_at`، فإن نجحت ابتُلع الخطأُ الأوّل ولم يُعرف.
 *
 * ## والعطل الثاني: حذفٌ لا يحذف ولا يُخطئ
 * سياسةُ الصفوف حين تمنع الحذف **لا تُرجع خطأً** — يُرجع الطلبُ نجاحاً بصفر
 * صفوفٍ محذوفة. وهذا موثَّقٌ في هذا المستودع من قبل: زرُّ حذف العرض كان يقول
 * «تم حذف العرض» ثمّ يعود العرضُ عند أوّل تحديث، حتى فُحص عددُ المحذوف
 * (`src/test/deleteSilentFailure.test.ts`).
 *
 * والمسحُ هنا كان يقرأ `error` وحده — فيرث العطلَ نفسَه، وأثرُه هنا أكبر: في
 * أداةٍ لا رجعةَ فيها، ولا مخرجَ لها إلّا رسالةُ نجاح.
 *
 * ## القاعدة
 *   • نجح ⇒ **يُتحقَّق أنّ الجدول فرغ فعلاً**.
 *   • فشل بسبب غياب id ⇒ أعِد المحاولة بـ`created_at`.
 *   • فشل لغير ذلك ⇒ **ارمِ الخطأ** — لا يُبتلع خطأُ حذفٍ أبداً.
 *
 * وفحصُ الفراغ أحاديُّ الجانب: صفوفٌ باقيةٌ بعد الحذف عطلٌ قطعاً، وفراغٌ
 * ظاهرٌ لا يُدّعى به شيء. فلا يُنذر إنذاراً كاذباً.
 *
 * يحرسه `src/test/wipeTable.test.ts`.
 */

/** أقلُّ ما نحتاجه من عميل القاعدة — كي يُفحص بمزدوجٍ بسيط. */
export interface WipeClient {
  from(table: string): {
    delete(): {
      not(col: string, op: string, val: unknown): Promise<{ error: any }>;
      gte(col: string, val: unknown): Promise<{ error: any }>;
    };
    select(cols: string, opts: { count: "exact"; head: true }): Promise<{
      count: number | null;
      error: any;
    }>;
  };
}

/** هل يقول الخطأُ إنّ العمود غيرُ موجود؟ */
function isMissingIdColumn(error: any): boolean {
  return /id.*does not exist/i.test(String(error?.message || ""));
}

/**
 * أبقيت صفوفاً؟
 *
 * لا يُرمى شيءٌ إن تعذّر العدّ نفسُه: العدُّ شاهدٌ لا حارس، وغيابُ الشاهد لا
 * يُدين. إنّما الصفوفُ الباقيةُ المرئيّةُ تُدين.
 */
async function assertEmptied(client: WipeClient, table: string): Promise<void> {
  let count: number | null = null;
  try {
    const r = await client.from(table).select("*", { count: "exact", head: true });
    if (r.error) return;
    count = r.count;
  } catch {
    return;
  }
  if (typeof count === "number" && count > 0) {
    throw new Error(
      `لم يُحذف شيءٌ من ${table} — بقي ${count} صفاً. سياسةُ الصلاحيات تمنع الحذف على الأرجح.`,
    );
  }
}

export async function wipeTable(
  client: WipeClient,
  table: string,
): Promise<{ via: "id" | "created_at" }> {
  const { error } = await client.from(table).delete().not("id", "is", null);
  if (!error) {
    await assertEmptied(client, table);
    return { via: "id" };
  }

  // خطأٌ لا علاقة له بغياب العمود: يُرمى ولا يُبتلع
  if (!isMissingIdColumn(error)) throw error;

  const { error: e2 } = await client.from(table).delete().gte("created_at", "1900-01-01");
  if (e2) throw e2;
  await assertEmptied(client, table);
  return { via: "created_at" };
}
