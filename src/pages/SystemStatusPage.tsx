import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  Database,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Cloud,
  Server,
  Loader2,
  ShieldCheck,
} from "lucide-react";

type CloudStats = {
  db_size_bytes: number;
  total_rows: number;
  storage_bytes: number;
  storage_count: number;
  invoices_last_30d: number;
  measured_at: string;
  tables: Array<{ table_name: string; size_bytes: number; row_estimate: number }>;
};

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  triggered_by: string;
  rules_run: number | null;
  anomalies_found: number | null;
  anomalies_new: number | null;
  duration_ms: number | null;
  error_message: string | null;
};

type AnomalyCounts = {
  total: number;
  open: number;
  resolved: number;
  ignored: number;
  critical: number;
  warning: number;
  info: number;
};

const EDGE_FUNCTIONS = [
  { name: "data-anomaly-scanner", desc: "فحص شذوذ البيانات" },
  { name: "create-document-share-token", desc: "إنشاء رابط مشاركة مستند" },
  { name: "document-share", desc: "عرض مستند مشترك" },
  { name: "document-share-meta", desc: "بيانات مستند مشترك" },
  { name: "create-staff-user", desc: "إنشاء مستخدم موظف" },
  { name: "customer-statement", desc: "كشف حساب عميل" },
  { name: "customer-statement-token", desc: "رابط كشف حساب عميل" },
];

function fmtBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${u[i]}`;
}

function fmtNum(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("ar-EG");
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} د`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `قبل ${hrs} س`;
  const days = Math.floor(hrs / 24);
  return `قبل ${days} يوم`;
}

export default function SystemStatusPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cloud, setCloud] = useState<CloudStats | null>(null);
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [recentRuns, setRecentRuns] = useState<Run[]>([]);
  const [counts, setCounts] = useState<AnomalyCounts>({
    total: 0,
    open: 0,
    resolved: 0,
    ignored: 0,
    critical: 0,
    warning: 0,
    info: 0,
  });
  const [authOk, setAuthOk] = useState<boolean | null>(null);

  async function load() {
    setRefreshing(true);
    try {
      const [{ data: stats }, { data: runs }, { data: anomalies }, { data: session }] =
        await Promise.all([
          supabase.rpc("get_cloud_usage_stats"),
          supabase
            .from("data_anomaly_runs")
            .select("*")
            .order("started_at", { ascending: false })
            .limit(10),
          supabase.from("data_anomalies").select("status,severity").limit(5000),
          supabase.auth.getSession(),
        ]);

      if (stats) setCloud(stats as any);
      if (runs && runs.length) {
        setLastRun(runs[0] as Run);
        setRecentRuns(runs as Run[]);
      }
      if (anomalies) {
        const c: AnomalyCounts = {
          total: anomalies.length,
          open: 0,
          resolved: 0,
          ignored: 0,
          critical: 0,
          warning: 0,
          info: 0,
        };
        for (const a of anomalies as any[]) {
          if (a.status === "open") c.open++;
          else if (a.status === "resolved") c.resolved++;
          else if (a.status === "ignored") c.ignored++;
          if (a.severity === "critical") c.critical++;
          else if (a.severity === "warning") c.warning++;
          else if (a.severity === "info") c.info++;
        }
        setCounts(c);
      }
      setAuthOk(!!session?.session);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const cloudHealthy = !!cloud && !!authOk;
  const lastRunOk = lastRun?.status === "completed";

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            حالة النظام
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            نظرة شاملة على Lovable Cloud وEdge Functions وصحة البيانات
          </p>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </div>

      {/* بطاقات الحالة العامة */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard
          title="Lovable Cloud"
          icon={<Cloud className="w-5 h-5" />}
          ok={cloudHealthy}
          okLabel="تشغيل طبيعي"
          failLabel="مشكلة في الاتصال"
          subtitle={cloud ? `آخر قياس: ${timeAgo(cloud.measured_at)}` : "—"}
        />
        <StatusCard
          title="نظام المصادقة"
          icon={<ShieldCheck className="w-5 h-5" />}
          ok={!!authOk}
          okLabel="مفعّل وآمن"
          failLabel="غير متصل"
          subtitle={authOk ? "جلستك نشطة" : "لا توجد جلسة"}
        />
        <StatusCard
          title="آخر فحص بيانات"
          icon={<Activity className="w-5 h-5" />}
          ok={lastRunOk}
          okLabel="مكتمل بنجاح"
          failLabel={lastRun?.status === "running" ? "قيد التشغيل" : "فشل / لم يبدأ"}
          subtitle={lastRun ? `${timeAgo(lastRun.started_at)} • ${fmtNum(lastRun.anomalies_found)} نتيجة` : "لم يُشغَّل بعد"}
        />
      </div>

      {/* إحصائيات Cloud */}
      {cloud && (
        <section className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              قاعدة البيانات والتخزين
            </h2>
            <Link to="/settings/cloud-usage" className="text-xs text-primary hover:underline">
              تفاصيل أكثر ←
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Metric label="حجم القاعدة" value={fmtBytes(cloud.db_size_bytes)} icon={<Database className="w-4 h-4" />} />
            <Metric label="إجمالي السجلات" value={fmtNum(cloud.total_rows)} icon={<Server className="w-4 h-4" />} />
            <Metric label="حجم الملفات" value={fmtBytes(cloud.storage_bytes)} icon={<HardDrive className="w-4 h-4" />} />
            <Metric label="عدد الملفات" value={fmtNum(cloud.storage_count)} icon={<HardDrive className="w-4 h-4" />} />
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="text-sm font-semibold mb-2 text-muted-foreground">أكبر 5 جداول</h3>
            <div className="space-y-1.5">
              {cloud.tables?.slice(0, 5).map(t => (
                <div key={t.table_name} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs">{t.table_name}</span>
                  <span className="text-muted-foreground">
                    {fmtBytes(t.size_bytes)} • {fmtNum(t.row_estimate)} سجل
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* صحة البيانات */}
      <section className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            ملخص فحص صحة البيانات
          </h2>
          <Link to="/data-health" className="text-xs text-primary hover:underline">
            فتح الصفحة الكاملة ←
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CountBox label="مفتوحة" value={counts.open} color="text-warning bg-warning/10" />
          <CountBox label="حلت" value={counts.resolved} color="text-success bg-success/10" />
          <CountBox label="حرجة" value={counts.critical} color="text-destructive bg-destructive/10" />
          <CountBox label="إجمالي" value={counts.total} color="text-primary bg-primary/10" />
        </div>

        {lastRun && (
          <div className="mt-4 pt-4 border-t border-border space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">آخر تشغيل:</span>
              <span className="font-medium">{new Date(lastRun.started_at).toLocaleString("ar-EG")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">المدة:</span>
              <span>{lastRun.duration_ms ? `${(lastRun.duration_ms / 1000).toFixed(1)} ثانية` : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">القواعد المنفّذة:</span>
              <span>{fmtNum(lastRun.rules_run)}</span>
            </div>
            {lastRun.error_message && (
              <div className="mt-2 p-2 bg-destructive/10 text-destructive rounded text-xs">
                {lastRun.error_message}
              </div>
            )}
          </div>
        )}

        {recentRuns.length > 1 && (
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="text-sm font-semibold mb-2 text-muted-foreground">آخر 10 عمليات فحص</h3>
            <div className="space-y-1">
              {recentRuns.map(r => (
                <div key={r.id} className="flex items-center justify-between text-xs py-1.5 px-2 hover:bg-muted/50 rounded">
                  <div className="flex items-center gap-2">
                    {r.status === "completed" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                    ) : r.status === "running" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                    )}
                    <span>{new Date(r.started_at).toLocaleString("ar-EG")}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{r.triggered_by}</span>
                    <span>{fmtNum(r.anomalies_found)} نتيجة</span>
                    {r.duration_ms && <span>{(r.duration_ms / 1000).toFixed(1)}s</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Edge Functions */}
      <section className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            Edge Functions المنشورة
          </h2>
          <span className="text-xs text-muted-foreground">{EDGE_FUNCTIONS.length} دالة</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {EDGE_FUNCTIONS.map(f => (
            <div
              key={f.name}
              className="flex items-center justify-between px-3 py-2.5 border border-border rounded-lg hover:bg-muted/30"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <div>
                  <div className="font-mono text-xs font-medium">{f.name}</div>
                  <div className="text-xs text-muted-foreground">{f.desc}</div>
                </div>
              </div>
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          الحالة معروضة من قائمة الدوال المنشورة في المشروع. لاختبار دالة محددة، افتح الصفحة المرتبطة بها.
        </p>
      </section>
    </div>
  );
}

function StatusCard({
  title,
  icon,
  ok,
  okLabel,
  failLabel,
  subtitle,
}: {
  title: string;
  icon: React.ReactNode;
  ok: boolean;
  okLabel: string;
  failLabel: string;
  subtitle: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {icon}
          {title}
        </div>
        {ok ? (
          <CheckCircle2 className="w-5 h-5 text-success" />
        ) : (
          <AlertCircle className="w-5 h-5 text-destructive" />
        )}
      </div>
      <div className={`font-bold ${ok ? "text-success" : "text-destructive"}`}>
        {ok ? okLabel : failLabel}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="font-bold text-lg">{value}</div>
    </div>
  );
}

function CountBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-lg p-3 ${color}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="font-bold text-2xl mt-1">{fmtNum(value)}</div>
    </div>
  );
}
