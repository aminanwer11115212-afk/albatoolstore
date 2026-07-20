import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, XCircle, Loader2, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { checkGeoGrants, GeoGrantsReport } from "@/lib/geoGrantsCheck";
import { toast } from "sonner";

type StepStatus = "idle" | "running" | "ok" | "fail";
type Step = { key: string; label: string; status: StepStatus; detail?: string };

const STAMP = () => Date.now().toString(36).slice(-6);

export default function CustomersGeoDiagnosticsPage() {
  const [grants, setGrants] = useState<GeoGrantsReport | null>(null);
  const [steps, setSteps] = useState<Step[]>([
    { key: "region", label: "إضافة اتجاه تجريبي", status: "idle" },
    { key: "state", label: "إضافة ولاية تحته", status: "idle" },
    { key: "city", label: "إضافة مدينة تحتها", status: "idle" },
    { key: "locality", label: "إضافة محلية تحتها", status: "idle" },
    { key: "readback", label: "استرجاع السلسلة كاملة من قاعدة البيانات", status: "idle" },
    { key: "cleanup", label: "تنظيف السجلات التجريبية", status: "idle" },
  ]);
  const [running, setRunning] = useState(false);

  useEffect(() => { checkGeoGrants(true).then(setGrants); }, []);

  const patch = (key: string, s: StepStatus, detail?: string) =>
    setSteps(prev => prev.map(x => (x.key === key ? { ...x, status: s, detail } : x)));

  const runAll = async () => {
    if (running) return;
    setRunning(true);
    setSteps(prev => prev.map(x => ({ ...x, status: "idle", detail: undefined })));
    const suffix = STAMP();
    const names = {
      region: `_تشخيص_اتجاه_${suffix}`,
      state: `_تشخيص_ولاية_${suffix}`,
      city: `_تشخيص_مدينة_${suffix}`,
      locality: `_تشخيص_محلية_${suffix}`,
    };
    let regionId: string | null = null;
    let stateId: string | null = null;
    let cityId: string | null = null;
    let localityId: string | null = null;
    try {
      patch("region", "running");
      const r = await (supabase as any).rpc("add_region", { p_name: names.region });
      if (r.error || !r.data) { patch("region", "fail", r.error?.message || "no_row"); throw new Error("region"); }
      regionId = r.data.id; patch("region", "ok", `id=${regionId}`);
      window.dispatchEvent(new CustomEvent("geo:changed"));

      patch("state", "running");
      const s = await (supabase as any).rpc("add_state", { p_name: names.state, p_region_id: regionId });
      if (s.error || !s.data) { patch("state", "fail", s.error?.message || "no_row"); throw new Error("state"); }
      stateId = s.data.id; patch("state", "ok", `id=${stateId}`);

      patch("city", "running");
      const c = await (supabase as any).rpc("add_city", { p_name: names.city, p_state_id: stateId });
      if (c.error || !c.data) { patch("city", "fail", c.error?.message || "no_row"); throw new Error("city"); }
      cityId = c.data.id; patch("city", "ok", `id=${cityId}`);

      patch("locality", "running");
      const l = await (supabase as any).rpc("add_locality", { p_name: names.locality, p_city_id: cityId });
      if (l.error || !l.data) { patch("locality", "fail", l.error?.message || "no_row"); throw new Error("locality"); }
      localityId = l.data.id; patch("locality", "ok", `id=${localityId}`);

      patch("readback", "running");
      const [rr, ss, cc, ll] = await Promise.all([
        (supabase as any).from("regions").select("id,name").eq("id", regionId).maybeSingle(),
        (supabase as any).from("states").select("id,name").eq("id", stateId).maybeSingle(),
        (supabase as any).from("cities").select("id,name").eq("id", cityId).maybeSingle(),
        (supabase as any).from("localities").select("id,name").eq("id", localityId).maybeSingle(),
      ]);
      const missing = [rr, ss, cc, ll].filter(x => !x.data).length;
      if (missing) patch("readback", "fail", `${missing} صفوف مفقودة`);
      else patch("readback", "ok", "السلسلة كاملة موجودة");
    } catch (_) {
      // continue to cleanup
    } finally {
      patch("cleanup", "running");
      try {
        if (localityId) await (supabase as any).from("localities").delete().eq("id", localityId);
        if (cityId) await (supabase as any).from("cities").delete().eq("id", cityId);
        if (stateId) await (supabase as any).from("states").delete().eq("id", stateId);
        if (regionId) await (supabase as any).from("regions").delete().eq("id", regionId);
        patch("cleanup", "ok", "تم حذف السجلات التجريبية");
      } catch (e: any) {
        patch("cleanup", "fail", e?.message || String(e));
      }
      window.dispatchEvent(new CustomEvent("geo:changed"));
      setRunning(false);
      toast.success("انتهى الفحص");
    }
  };

  const StatusIcon = ({ s }: { s: StepStatus }) =>
    s === "ok" ? <CheckCircle2 className="text-emerald-500" size={18} /> :
    s === "fail" ? <XCircle className="text-destructive" size={18} /> :
    s === "running" ? <Loader2 className="animate-spin text-primary" size={18} /> :
    <div className="w-[18px] h-[18px] rounded-full border border-border" />;

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">تشخيص الهيكل الجغرافي</h1>
          <p className="text-sm text-muted-foreground mt-1">
            يتحقّق من صلاحيات (GRANTs) وأنّ إضافة اتجاه/ولاية/مدينة/محلية تعمل من الواجهة.
          </p>
        </div>
        <Link to="/customers" className="text-sm text-primary flex items-center gap-1 hover:underline">
          <ArrowRight size={16} /> رجوع لإدارة العملاء
        </Link>
      </div>

      <div className={`rounded-xl border p-4 ${grants?.ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5"}`}>
        <div className="flex items-start gap-3">
          {grants ? <StatusIcon s={grants.ok ? "ok" : "fail"} /> : <Loader2 className="animate-spin" size={18} />}
          <div className="flex-1">
            <div className="font-semibold text-foreground">
              {grants == null ? "جارٍ فحص الصلاحيات…" : grants.ok ? "صلاحيات الجداول الجغرافية سليمة" : "صلاحيات ناقصة على الجداول الجغرافية"}
            </div>
            {grants && !grants.ok && (
              <div className="text-xs text-muted-foreground mt-1">
                {grants.error ? `خطأ: ${grants.error}` : `جداول تحتاج GRANT: ${grants.missing.join("، ") || "غير محددة"}`}
              </div>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={runAll}
        disabled={running}
        className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {running ? <Loader2 className="animate-spin" size={16} /> : <PlayCircle size={16} />}
        {running ? "جارٍ التشغيل…" : "تشغيل الفحص الكامل"}
      </button>

      <ol className="bg-card rounded-xl border border-border divide-y divide-border">
        {steps.map((st, i) => (
          <li key={st.key} className="flex items-start gap-3 p-4">
            <StatusIcon s={st.status} />
            <div className="flex-1">
              <div className="font-medium text-foreground">
                {i + 1}. {st.label}
              </div>
              {st.detail && (
                <div className={`text-xs mt-1 ${st.status === "fail" ? "text-destructive" : "text-muted-foreground"}`} dir="ltr">
                  {st.detail}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <p className="text-xs text-muted-foreground">
        عند الفشل: الغالب أنّ صلاحيات (GRANT) نقصت على جداول <code>regions/states/cities/localities</code>.
        راجع مهارة <code>albatool-customer-geo-grants</code> وأعِد تشغيل المِنَح.
      </p>
    </div>
  );
}
