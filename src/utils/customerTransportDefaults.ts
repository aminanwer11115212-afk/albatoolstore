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
