/**
 * ربطُ جداول التغليف والترحيل بأسمائها — في الواجهة لا في PostgREST.
 *
 * ## العطل الذي عالجه
 * صفحة معاينة الفاتورة كانت تقول «لا توجد بيانات تغليف لهذه الفاتورة» و«لا
 * توجد بيانات ترحيل» رغم أن المستخدم أدخلهما ورآهما في نافذتهما.
 *
 * والسبب ليس في البيانات: **جداول التغليف والترحيل بلا مفاتيح أجنبية في
 * القاعدة الحيّة**. راجع `types.ts` — `invoices_packaging_items` و
 * `invoice_packaging` و`invoice_transports` ونظائرها في العروض، كلّها
 * `Relationships: []`. والهجرة التي تُنشئها بمفاتيحها موجودةٌ في المستودع،
 * لكنّ الجدول الحيّ أُنشئ بمسارٍ آخر: الهجرة التالية تضيف
 * `ADD COLUMN IF NOT EXISTS invoice_packaging_id uuid` **بلا REFERENCES**
 * لأعمدةٍ كانت في الإنشاء الأصلي — دليلٌ قاطع على أن الحيّ يخالف المكتوب.
 *
 * وPostgREST لا يعرف ربطاً بلا مفتاح أجنبي. فطلبُ `packaging_types(name)`
 * يردّ خطأ `PGRST200`، والعميل يستخرج `data` فيجدها `null` — **بلا رمي
 * استثناء**. فلا `catch` يلتقطه ولا سطرَ في السجلّ: قراءةٌ فاشلة تُقرأ
 * «لا توجد بيانات».
 *
 * ## الحلّ
 * لا نطلب من PostgREST ما لا يقدر عليه. نقرأ الأعمدة المباشرة ومعها أعمدة
 * المعرّفات، ثم نجلب الأسماء باستعلامٍ واحدٍ لكل جدول مرجعي ونركّبها على
 * الصفوف **بنفس شكل الربط** (`row.packaging_types.name`) — فلا تتغيّر
 * الدوالّ التي تقرأها.
 *
 * وهذا يعالج **الفواتير الموجودة كلّها فوراً**: بياناتها في القاعدة سليمة،
 * وإنما كانت القراءة عاجزة. ولا يحتاج هجرةً ولا خطوةً يدوية.
 */
import { supabase } from "@/integrations/supabase/client";

export interface LookupSpec {
  /** عمود المعرّف في الصف، مثل `packaging_type_id` */
  idKey: string;
  /** المفتاح الذي يُركَّب عليه الناتج — بنفس اسم الربط المعتاد */
  as: string;
  /** الجدول المرجعي */
  table: string;
  /** الأعمدة المطلوبة منه (بلا `id` — يُضاف تلقائياً) */
  columns: string[];
}

/**
 * يركّب أسماء الجداول المرجعية على الصفوف.
 *
 * يعمل على نسخةٍ من الصفوف فلا يُعدَّل ما جاء من الكاش. والمفقود يبقى `null`
 * لا يُسقِط الصف: بندُ تغليفٍ بلا نوعٍ مسجَّل يظلّ بنداً بكمّيته واسم صنفه.
 */
export async function attachLookups<T extends Record<string, any>>(
  rows: T[] | null | undefined,
  specs: LookupSpec[],
): Promise<T[]> {
  const list = (rows || []).map((r) => ({ ...r }));
  if (list.length === 0) return list;

  await Promise.all(
    specs.map(async (spec) => {
      const ids = Array.from(
        new Set(list.map((r) => r[spec.idKey]).filter((v): v is string => !!v)),
      );
      if (ids.length === 0) {
        for (const r of list) (r as any)[spec.as] = null;
        return;
      }
      const { data, error } = await (supabase as any)
        .from(spec.table)
        .select(["id", ...spec.columns].join(", "))
        .in("id", ids);
      if (error) {
        // يُذكر ولا يُبتلع: القراءة الصامتة الفاشلة هي أصل هذا العطل كلّه.
        console.error(`[attachLookups] تعذّر جلب ${spec.table}`, error);
      }
      const byId = new Map<string, any>(
        (data || []).map((row: any) => [String(row.id), row]),
      );
      for (const r of list) {
        const id = r[spec.idKey];
        (r as any)[spec.as] = id ? byId.get(String(id)) || null : null;
      }
    }),
  );

  return list;
}

/* ─────────── الوصفات الجاهزة — مصدرٌ واحد لكل شاشة ─────────── */

/** نوع التغليف: يُقرأ من `row.packaging_types.name`. */
export const PACKAGING_TYPE_LOOKUP: LookupSpec = {
  idKey: "packaging_type_id",
  as: "packaging_types",
  table: "packaging_types",
  columns: ["name"],
};

/** اسم المنتج المرجعي: يُقرأ من `row.products.name`. */
export const PRODUCT_LOOKUP: LookupSpec = {
  idKey: "product_id",
  as: "products",
  table: "products",
  columns: ["name"],
};

/** المرحِّل باسمه وهاتفه وعنوانه: يُقرأ من `row.transporters`. */
export const TRANSPORTER_LOOKUP: LookupSpec = {
  idKey: "transporter_id",
  as: "transporters",
  table: "transporters",
  columns: ["name", "phone", "address"],
};

/** الوجهة: تُقرأ من `row.destinations.name`. */
export const DESTINATION_LOOKUP: LookupSpec = {
  idKey: "destination_id",
  as: "destinations",
  table: "destinations",
  columns: ["name"],
};
