import { useState } from "react";
import { RefreshCw, CheckCircle2, XCircle, ChevronDown, ChevronUp, Activity, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { runAllInvariants, type FinanceHealthReport, type InvariantResult, type InvariantSeverity } from "@/lib/financeInvariants";

const SEV_STYLE: Record<InvariantSeverity, { badge: string; label: string }> = {
  critical: { badge: "bg-destructive/15 text-destructive border-destructive/30", label: "حرج" },
  high:     { badge: "bg-orange-500/15 text-orange-600 border-orange-500/30 dark:text-orange-400", label: "مرتفع" },
  medium:   { badge: "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400", label: "متوسط" },
  low:      { badge: "bg-muted text-muted-foreground border-border", label: "منخفض" },
};

const CAT_LABEL: Record<InvariantResult["category"], string> = {
  accounts: "الحسابات",
  customers: "العملاء",
  suppliers: "الموردون",
  invoices: "الفواتير",
  transactions: "المعاملات",
  pos: "الكاش (POS)",
  integrity: "التكامل",
};

type HistoryEntry = { at: string; pass: number; fail: number; ms: number };
const HISTORY_KEY = "lov:finance-health:history";

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}
function saveHistory(entry: HistoryEntry) {
  const cur = loadHistory();
  const next = [entry, ...cur].slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export default function FinanceHealthPage() {
  const [report, setReport] = useState<FinanceHealthReport | null>(null);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory());

  const run = async () => {
    if (running) return;
    setRunning(true);
    try {
      const r = await runAllInvariants();
      setReport(r);
      setHistory(saveHistory({ at: r.ranAt, pass: r.pass, fail: r.fail, ms: r.totalMs }));
      if (r.fail === 0) toast.success(`جميع القواعد الـ ${r.pass} سليمة`);
      else toast.warning(`${r.fail} قاعدة/قواعد بحاجة مراجعة`);
    } catch (e: any) {
      toast.error(e?.message || "فشل تشغيل الفحص");
    } finally {
      setRunning(false);
    }
  };

  const toggle = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const total = report?.results.length ?? 0;
  const passPct = total ? Math.round(((report?.pass ?? 0) / total) * 100) : 0;
  const healthy = report && report.fail === 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity size={22} /> صحة الحسابات المالية
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            قواعد ثابتة تتحقق من ربط الحسابات وأرصدة العملاء والموردين وعزل الكاش. قراءة فقط — لا تعديل.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          <RefreshCw size={16} className={running ? "animate-spin" : ""} />
          {running ? "جارٍ الفحص..." : report ? "إعادة الفحص" : "تشغيل الفحص"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="الحالة العامة" value={report ? (healthy ? "سليم" : "يحتاج مراجعة") : "—"}
          tone={report ? (healthy ? "ok" : "fail") : "muted"} />
        <SummaryCard label="قواعد ناجحة" value={report ? `${report.pass} / ${total}` : "—"} tone="ok" />
        <SummaryCard label="قواعد مخالفة" value={report ? String(report.fail) : "—"} tone={report && report.fail > 0 ? "fail" : "muted"} />
        <SummaryCard label="زمن التشغيل" value={report ? `${report.totalMs} ms` : "—"} tone="muted" />
      </div>

      {report && (
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={`h-full transition-all ${healthy ? "bg-emerald-500" : "bg-destructive"}`} style={{ width: `${passPct}%` }} />
        </div>
      )}

      {/* Results */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">القواعد ({report?.results.length ?? 0})</h3>
        </div>
        {!report ? (
          <div className="p-10 text-center text-muted-foreground text-sm">
            اضغط «تشغيل الفحص» لبدء تقييم اتساق البيانات.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {report.results.map(r => {
              const sev = SEV_STYLE[r.severity];
              const open = expanded.has(r.id);
              return (
                <li key={r.id}>
                  <button
                    onClick={() => toggle(r.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 text-right"
                  >
                    {r.pass ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0" /> : <XCircle size={18} className="text-destructive shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{r.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sev.badge}`}>{sev.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">{CAT_LABEL[r.category]}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{r.summary} · {r.ms}ms</div>
                    </div>
                    {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                  </button>
                  {open && (
                    <div className="px-4 pb-4 bg-muted/30">
                      {r.fixHint && (
                        <div className="text-xs text-muted-foreground mb-2 border-r-2 border-primary/40 pr-2">
                          <strong className="text-foreground">تلميح إصلاح:</strong> {r.fixHint}
                        </div>
                      )}
                      {r.offenders.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-2">لا صفوف مخالفة.</div>
                      ) : (
                        <div className="overflow-x-auto rounded border border-border">
                          <table className="w-full text-xs">
                            <thead className="bg-muted">
                              <tr>
                                {Object.keys(r.offenders[0]).map(k => (
                                  <th key={k} className="text-right px-3 py-2 font-semibold text-muted-foreground">{k}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {r.offenders.map((row, i) => (
                                <tr key={i} className="border-t border-border">
                                  {Object.keys(r.offenders[0]).map(k => (
                                    <td key={k} className="px-3 py-2 text-foreground">
                                      {typeof row[k] === "number" ? Number(row[k]).toLocaleString() : String(row[k] ?? "—")}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="text-[10px] text-muted-foreground p-2 text-center">
                            أول {r.offenders.length} صفوف كعيّنة
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* History */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">سجل التشغيلات (آخر {history.length})</h3>
        </div>
        {history.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">لا يوجد سجل بعد.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-right px-4 py-2 font-semibold text-muted-foreground">التاريخ</th>
                  <th className="text-right px-4 py-2 font-semibold text-muted-foreground">ناجحة</th>
                  <th className="text-right px-4 py-2 font-semibold text-muted-foreground">مخالفة</th>
                  <th className="text-right px-4 py-2 font-semibold text-muted-foreground">الزمن</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-4 py-2 text-foreground">{new Date(h.at).toLocaleString("ar-SA")}</td>
                    <td className="px-4 py-2 text-emerald-600 dark:text-emerald-400">{h.pass}</td>
                    <td className={`px-4 py-2 ${h.fail > 0 ? "text-destructive" : "text-muted-foreground"}`}>{h.fail}</td>
                    <td className="px-4 py-2 text-muted-foreground">{h.ms}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        الدفعة 3 القادمة: أدوات إصلاح آلية (recompute) واختبارات تكامل.
      </p>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "ok" | "fail" | "muted" }) {
  const toneCls =
    tone === "ok" ? "text-emerald-600 dark:text-emerald-400" :
    tone === "fail" ? "text-destructive" :
    "text-foreground";
  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneCls}`}>{value}</div>
    </div>
  );
}
