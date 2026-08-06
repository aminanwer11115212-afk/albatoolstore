/**
 * customerTransportDefaults — منطق موحّد لجلب الناقل/الوجهة الافتراضيَين للعميل.
 *
 * الاستخدام موحّد بين:
 *  - ReadyToShipPanel (يقرأ من كاش React Query عبر resolveDefaultsFromCache)
 *  - InvoiceTransportPage / QuoteTransportPage / TransportDialog (يجلب مرة عبر fetchCustomerTransportDefaults)
 *
 * السلوك الأساسي:
 *  - إن لم يوجد `customer_preferred_transporter` للعميل → transporterId = null (فارغ).
 *  - إن لم توجد `customer_destinations.is_default` للعميل → destinationId = null (فارغ).
 *  - لا نُرجِع أول قيمة في النظام كسقوط تلقائي — الفراغ مقصود.
 */

import { supabase } from "@/integrations/supabase/client";

export type CustomerTransportDefaults = {
  transporterId: string | null;
  destinationId: string | null;
};

/** يعمل مع بيانات محمّلة مسبقاً في الكاش (بدون طلب شبكة). */
export function resolveDefaultsFromCache(
  customerId: string | null | undefined,
  cache: {
    prefTransporters?: Array<{ customer_id: string; transporter_id: string | null }> | null;
    custDestinations?: Array<{ customer_id: string; destination_id: string; is_default?: boolean | null }> | null;
  }
): CustomerTransportDefaults {
  if (!customerId) return { transporterId: null, destinationId: null };
  const pref = (cache.prefTransporters || []).find((p) => p.customer_id === customerId);
  const defDest = (cache.custDestinations || []).find(
    (d) => d.customer_id === customerId && d.is_default === true
  );
  return {
    transporterId: pref?.transporter_id ?? null,
    destinationId: defDest?.destination_id ?? null,
  };
}

/**
 * بذرُ ترحيل المستند من افتراضيات العميل — **كتابةً لا استنتاجاً وقتَ العرض**.
 *
 * ## العطل
 * المرحّل والوجهة يُسجَّلان للعميل في جدول العملاء، ثم تُنشأ له فاتورة فتخرج
 * ورقتُها بلا ترحيل: `loadInvoiceExtras` لا تقرأ إلا `invoice_transports`،
 * وهذا الجدول لا يُكتب فيه شيء ما لم يفتح المستخدم نافذة الترحيل ويحفظ.
 * فالبيانات موجودةٌ عند العميل ولا تصل فاتورته.
 *
 * ## ولماذا الكتابة لا السقوطُ عند القراءة
 * أسهلُ إصلاحٍ أن تسقط `loadInvoiceExtras` إلى افتراضيات العميل حين تجد
 * الجدول فارغاً. لكنّ ورقة العميل لا تمرّ بها: تقرأ `transports` من
 * `get_shared_document`، وهي دالّة قاعدةٍ لا تعرف هذا السقوط — ولا يملك
 * التوكن العامّ قراءة `customer_preferred_transporter` أصلاً. فتفترق الورقتان:
 * ترحيلٌ في المعاينة وفراغٌ عند العميل، وهو ما تمنعه «قاعدة الورقة الواحدة».
 *
 * فالبذرُ عند الحفظ يجعلها بياناً واحداً يقرؤه الجميع: المعاينة، والطباعة،
 * ورابط العميل، ونافذة الترحيل، ولوحة الجاهز للشحن.
 *
 * ## وحارسان
 * لا يُكتب فوق ترحيلٍ قائم — صفٌّ واحدٌ في الجدول يعني أن أحداً قرّر، ولو
 * تركه فارغاً. ولا يُكتب صفٌّ فارغ: عميلٌ بلا افتراضيات يبقى بلا ترحيل، لا
 * بصفٍّ لا يحمل شيئاً.
 *
 * ولا يرمي: فشلُ البذر لا يُسقِط حفظ الفاتورة — الفاتورة هي الأصل والترحيل
 * تكملةٌ تُستدرك من نافذتها.
 */
export type SeedTransportResult = {
  seeded: boolean;
  reason: "no-ids" | "already-set" | "no-defaults" | "insert-failed" | "ok";
};

const DOC_TABLES = {
  invoice: { table: "invoice_transports", fk: "invoice_id" },
  quote: { table: "quote_transports", fk: "quote_id" },
} as const;

export async function seedTransportFromCustomerDefaults(
  kind: "invoice" | "quote",
  docId: string | null | undefined,
  customerId: string | null | undefined
): Promise<SeedTransportResult> {
  if (!docId || !customerId) return { seeded: false, reason: "no-ids" };
  const { table, fk } = DOC_TABLES[kind];
  try {
    const { data: existing, error: readErr } = await (supabase as any)
      .from(table)
      .select("id")
      .eq(fk, docId)
      .limit(1);
    // القراءة الفاشلة لا تُقرأ «فارغاً»: لو رفضت السياسة القراءة لكتبنا صفّاً
    // فوق ترحيلٍ قائمٍ لا نراه. فعند الخطأ نمتنع.
    if (readErr) {
      console.warn("[seedTransportFromCustomerDefaults] تعذّرت قراءة الترحيل القائم", readErr);
      return { seeded: false, reason: "already-set" };
    }
    if ((existing || []).length > 0) return { seeded: false, reason: "already-set" };

    const { transporterId, destinationId } = await fetchCustomerTransportDefaults(customerId);
    if (!transporterId && !destinationId) return { seeded: false, reason: "no-defaults" };

    const { error: insErr } = await (supabase as any).from(table).insert({
      [fk]: docId,
      transporter_id: transporterId,
      destination_id: destinationId,
    });
    if (insErr) {
      console.warn("[seedTransportFromCustomerDefaults] تعذّرت كتابة الترحيل", insErr);
      return { seeded: false, reason: "insert-failed" };
    }
    return { seeded: true, reason: "ok" };
  } catch (e) {
    console.warn("[seedTransportFromCustomerDefaults] failed:", e);
    return { seeded: false, reason: "insert-failed" };
  }
}

/** يجلب الافتراضيات من قاعدة البيانات (للصفحات التي لا تستخدم React Query). */
export async function fetchCustomerTransportDefaults(
  customerId: string | null | undefined
): Promise<CustomerTransportDefaults> {
  if (!customerId) return { transporterId: null, destinationId: null };
  try {
    const [{ data: dests }, { data: pref }] = await Promise.all([
      supabase
        .from("customer_destinations")
        .select("destination_id, is_default")
        .eq("customer_id", customerId),
      (supabase as any)
        .from("customer_preferred_transporter")
        .select("transporter_id")
        .eq("customer_id", customerId)
        .maybeSingle(),
    ]);
    const def = ((dests as any[]) || []).find((d) => d.is_default === true);
    return {
      transporterId: (pref as any)?.transporter_id ?? null,
      destinationId: def?.destination_id ?? null,
    };
  } catch (e) {
    console.warn("[customerTransportDefaults] fetch failed:", e);
    return { transporterId: null, destinationId: null };
  }
}
