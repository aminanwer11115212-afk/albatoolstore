/**
 * فحص أذونات (GRANTs) الجداول الجغرافية عبر RPC check_geo_grants.
 * يُستخدم عند فتح صفحة إدارة العملاء لضمان أنّ الإضافة/التعديل تعمل.
 * في وضع التطوير: يرمي خطأ لإسقاط الاختبارات والبناء إذا كانت الأذونات ناقصة.
 */
import { supabase } from "@/integrations/supabase/client";

export type GeoGrantsReport = { ok: boolean; missing: string[]; error?: string };

let cached: GeoGrantsReport | null = null;
let inflight: Promise<GeoGrantsReport> | null = null;

export async function checkGeoGrants(force = false): Promise<GeoGrantsReport> {
  if (!force && cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await (supabase as any).rpc("check_geo_grants");
      if (error) {
        const rep: GeoGrantsReport = { ok: false, missing: [], error: error.message };
        cached = rep;
        return rep;
      }
      const rep: GeoGrantsReport = {
        ok: Boolean((data as any)?.ok),
        missing: Array.isArray((data as any)?.missing) ? (data as any).missing : [],
      };
      cached = rep;
      return rep;
    } catch (e: any) {
      const rep: GeoGrantsReport = { ok: false, missing: [], error: e?.message || String(e) };
      cached = rep;
      return rep;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** إذا كانت الأذونات ناقصة في بيئة الاختبارات يرمي خطأ (يفشل البناء/الاختبار). */
export async function assertGeoGrantsOrThrow(): Promise<void> {
  const rep = await checkGeoGrants(true);
  if (!rep.ok) {
    const detail = rep.error ? ` (${rep.error})` : rep.missing.length ? ` — جداول ناقصة: ${rep.missing.join(", ")}` : "";
    throw new Error(`GEO_GRANTS_MISSING${detail}`);
  }
}
