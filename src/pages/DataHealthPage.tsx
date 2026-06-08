import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { Loader2, RefreshCw, AlertTriangle, AlertCircle, Info, CheckCircle2, EyeOff, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";

type Anomaly = {
  id: string;
  category: "financial" | "pricing" | "stock" | "logical" | "data";
  severity: "critical" | "warning" | "info";
  rule_code: string;
  table_name: string;
  record_id: string | null;
  record_label: string | null;
  description: string;
  observed_value: any;
  status: "open" | "ignored" | "resolved";
  detected_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  ignored_at: string | null;
  ignored_reason: string | null;
};

type RunRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  triggered_by: string;
  rules_run: number | null;
  anomalies_found: number | null;
  anomalies_new: number | null;
  anomalies_resolved: number | null;
  duration_ms: number | null;
  status: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  financial: "مالي",
  pricing: "تسعير",
  stock: "مخزون",
  logical: "منطقي",
  data: "بيانات",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "حرج",
  warning: "تحذير",
  info: "معلومة",
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

function severityIcon(s: string) {
  if (s === "critical") return <AlertCircle className="w-4 h-4" />;
  if (s === "warning") return <AlertTriangle className="w-4 h-4" />;
  return <Info className="w-4 h-4" />;
}

function recordLink(table: string, id: string | null): string | null {
  if (!id) return null;
  if (table === "invoices" || table === "invoice_items") return `/invoices/view/${table === "invoice_items" ? "" : id}`.replace(/\/$/, id ? `/${id}` : "");
  if (table === "quotes" || table === "quote_items") return `/quotes/view/${id}`;
  if (table === "customers") return `/customers`;
  if (table === "products") return `/products`;
  return null;
}

export default function DataHealthPage() {
  const { isAdmin } = useUserRole();
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"open" | "ignored" | "resolved" | "all">("open");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    const [{ data: an }, { data: rn }] = await Promise.all([
      supabase
        .from("data_anomalies")
        .select("*")
        .order("last_seen_at", { ascending: false })
        .limit(2000),
      supabase
        .from("data_anomaly_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10),
    ]);
    setAnomalies((an as Anomaly[]) ?? []);
    setRuns((rn as RunRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function runScan() {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("data-anomaly-scanner", {
        body: {},
      });
      if (error) throw error;
      const found = (data as any)?.anomalies_found ?? 0;
      const fresh = (data as any)?.anomalies_new ?? 0;
      const resolved = (data as any)?.anomalies_resolved ?? 0;
      toast.success(`اكتمل الفحص: ${found} خطأ (${fresh} جديد، ${resolved} تم حله)`);
      await load();
    } catch (e: any) {
      toast.error(`فشل الفحص: ${e.message ?? e}`);
    } finally {
      setScanning(false);
    }
  }

  async function ignoreAnomaly(id: string) {
    const reason = window.prompt("سبب التجاهل (اختياري):") ?? "";
    const { error } = await supabase
      .from("data_anomalies")
      .update({
        status: "ignored",
        ignored_at: new Date().toISOString(),
        ignored_reason: reason || null,
      })
      .eq("id", id);
    if (error) {
      toast.error(`فشل: ${error.message}`);
      return;
    }
    toast.success("تم التجاهل");
    load();
  }

  async function resolveAnomaly(id: string) {
    const { error } = await supabase
      .from("data_anomalies")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error(`فشل: ${error.message}`);
      return;
    }
    toast.success("تم وضع علامة محلول");
    load();
  }

  const filtered = useMemo(() => {
    return anomalies
      .filter((a) => filterStatus === "all" || a.status === filterStatus)
      .filter((a) => filterSeverity === "all" || a.severity === filterSeverity)
      .filter((a) => filterCategory === "all" || a.category === filterCategory)
      .filter(
        (a) =>
          !search ||
          a.description.toLowerCase().includes(search.toLowerCase()) ||
          (a.record_label || "").toLowerCase().includes(search.toLowerCase()),
      )
      .sort((a, b) => {
        const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (s !== 0) return s;
        return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
      });
  }, [anomalies, filterStatus, filterSeverity, filterCategory, search]);

  const stats = useMemo(() => {
    const open = anomalies.filter((a) => a.status === "open");
    return {
      open: open.length,
      critical: open.filter((a) => a.severity === "critical").length,
      warning: open.filter((a) => a.severity === "warning").length,
      info: open.filter((a) => a.severity === "info").length,
      resolved: anomalies.filter((a) => a.status === "resolved").length,
      ignored: anomalies.filter((a) => a.status === "ignored").length,
    };
  }, [anomalies]);

  const lastRun = runs[0];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">فحص صحة البيانات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bot ذكي لكشف الأخطاء غير المنطقية في الفواتير والمخزون والأرصدة
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning || !isAdmin}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition"
          title={!isAdmin ? "للمدير فقط" : ""}
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {scanning ? "جاري الفحص..." : "افحص الآن"}
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard label="مفتوح" value={stats.open} color="text-foreground" />
        <StatCard label="حرج" value={stats.critical} color="text-red-500" />
        <StatCard label="تحذير" value={stats.warning} color="text-amber-500" />
        <StatCard label="معلومة" value={stats.info} color="text-blue-500" />
        <StatCard label="تم حله" value={stats.resolved} color="text-green-500" />
        <StatCard label="متجاهل" value={stats.ignored} color="text-muted-foreground" />
      </div>

      {/* Last run info */}
      {lastRun && (
        <div className="rounded-lg border border-border bg-card p-3 text-sm flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 text-muted-foreground">
            <span>آخر فحص: {new Date(lastRun.started_at).toLocaleString("ar-EG")}</span>
            <span>•</span>
            <span>{lastRun.triggered_by === "cron" ? "تلقائي" : "يدوي"}</span>
            <span>•</span>
            <span>{lastRun.rules_run ?? 0} قاعدة</span>
            <span>•</span>
            <span>{lastRun.duration_ms ?? 0}ms</span>
          </div>
          <div className="text-xs text-muted-foreground">
            +{lastRun.anomalies_new ?? 0} جديد • {lastRun.anomalies_resolved ?? 0} تم حله
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-lg border border-border bg-card p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث في الوصف أو السجل..."
            className="w-full pr-9 pl-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-3 py-2 rounded-md border border-input bg-background text-sm"
        >
          <option value="open">مفتوحة</option>
          <option value="ignored">متجاهلة</option>
          <option value="resolved">تم حلها</option>
          <option value="all">الكل</option>
        </select>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="px-3 py-2 rounded-md border border-input bg-background text-sm"
        >
          <option value="all">كل المستويات</option>
          <option value="critical">حرج</option>
          <option value="warning">تحذير</option>
          <option value="info">معلومة</option>
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 rounded-md border border-input bg-background text-sm"
        >
          <option value="all">كل الفئات</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="rounded-lg border border-border bg-card">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            جاري التحميل...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-foreground font-medium">لا توجد أخطاء مطابقة للمرشحات الحالية</p>
            <p className="text-sm text-muted-foreground mt-1">
              {anomalies.length === 0 ? 'اضغط "افحص الآن" للبدء' : "جرب تغيير المرشحات"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((a) => {
              const link = recordLink(a.table_name, a.record_id);
              return (
                <div key={a.id} className="p-4 hover:bg-accent/30 transition">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <SeverityBadge severity={a.severity} />
                        <CategoryBadge category={a.category} />
                        <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {a.rule_code}
                        </code>
                        {a.status === "ignored" && (
                          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            متجاهل
                          </span>
                        )}
                        {a.status === "resolved" && (
                          <span className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-600">
                            تم الحل
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-foreground">{a.description}</p>
                      {a.record_label && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          السجل: {link ? (
                            <Link to={link} className="text-primary hover:underline">{a.record_label}</Link>
                          ) : a.record_label}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        رُصد: {new Date(a.detected_at).toLocaleString("ar-EG")}
                        {a.last_seen_at !== a.detected_at && (
                          <> • آخر ظهور: {new Date(a.last_seen_at).toLocaleString("ar-EG")}</>
                        )}
                      </p>
                      {a.ignored_reason && (
                        <p className="mt-1 text-xs text-muted-foreground italic">
                          سبب التجاهل: {a.ignored_reason}
                        </p>
                      )}
                    </div>
                    {isAdmin && a.status === "open" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => resolveAnomaly(a.id)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-accent transition"
                          title="وضع علامة محلول"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          حُل
                        </button>
                        <button
                          onClick={() => ignoreAnomaly(a.id)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-accent transition"
                          title="تجاهل"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                          تجاهل
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-500/10 text-red-600 border-red-500/20",
    warning: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    info: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${map[severity]}`}>
      {severityIcon(severity)}
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
      {CATEGORY_LABELS[category]}
    </span>
  );
}
