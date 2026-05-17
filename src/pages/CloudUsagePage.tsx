import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Database, HardDrive, Activity, FileText, RefreshCw, AlertTriangle, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useCloudUsage, LIMITS, pct, severity, formatBytes } from "@/hooks/useCloudUsage";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const sevColor: Record<string, string> = {
  ok:   "hsl(142 71% 45%)",
  warn: "hsl(38 92% 50%)",
  crit: "hsl(0 84% 60%)",
};

const TABLE_PAGE_SIZE = 10;

function StatCard({
  icon: Icon, title, used, limit, formatter, hint,
}: {
  icon: any; title: string; used: number; limit: number;
  formatter: (n: number) => string; hint?: string;
}) {
  const p = pct(used, limit);
  const sev = severity(p);
  const color = sevColor[sev];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2"><Icon size={16} /> {title}</span>
          <span className="text-xs font-bold" style={{ color }}>{p.toFixed(1)}%</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-xl font-bold">{formatter(used)}</div>
        <div className="text-xs text-muted-foreground">من أصل {formatter(limit)}</div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div className="h-full transition-all" style={{ width: `${p}%`, background: color }} />
        </div>
        {hint && <div className="text-xs text-muted-foreground pt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export default function CloudUsagePage() {
  const { data, loading, error, refresh } = useCloudUsage();

  const [tableSearch, setTableSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const apiUsed = useMemo(() => {
    if (!data) return 0;
    // تقدير: عدد الفواتير في آخر 30 يوم × ~50 طلب/فاتورة (إنشاء+قراءة+تحديث+عرض)
    return data.invoices_last_30d * 50;
  }, [data]);

  const warnings = useMemo(() => {
    if (!data) return [] as { label: string; level: "warn" | "crit" }[];
    const list: { label: string; level: "warn" | "crit" }[] = [];
    const checks: [string, number, number][] = [
      ["حجم قاعدة البيانات", data.db_size_bytes, LIMITS.db_size_bytes],
      ["حجم التخزين", data.storage_bytes, LIMITS.storage_bytes],
      ["طلبات API الشهرية (تقديري)", apiUsed, LIMITS.api_requests_monthly],
    ];
    checks.forEach(([label, used, limit]) => {
      const s = severity(pct(used, limit));
      if (s !== "ok") list.push({ label, level: s as "warn" | "crit" });
    });
    return list;
  }, [data, apiUsed]);

  // Filter and paginate tables
  const filteredTables = useMemo(() => {
    if (!data) return [];
    const query = tableSearch.trim().toLowerCase();
    if (!query) return data.tables;
    return data.tables.filter(t => t.table_name.toLowerCase().includes(query));
  }, [data, tableSearch]);

  const totalTablePages = useMemo(() => Math.max(1, Math.ceil(filteredTables.length / TABLE_PAGE_SIZE)), [filteredTables.length]);

  const pagedTables = useMemo(() => {
    const start = (currentPage - 1) * TABLE_PAGE_SIZE;
    return filteredTables.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredTables, currentPage]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">استهلاك Cloud</h1>
          <p className="text-xs text-muted-foreground">
            آخر قياس: {data ? new Date(data.measured_at).toLocaleString("ar") : "—"}
          </p>
        </div>
        <Button onClick={refresh} disabled={loading} size="sm" variant="outline" className="gap-2">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> تحديث
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-md border border-destructive/50 bg-destructive/10 text-sm text-destructive">
          {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="p-3 rounded-md border bg-card flex items-start gap-2">
          <AlertTriangle size={18} className="text-amber-500 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold mb-1">تنبيه: تجاوزت الحد المريح للموارد التالية</div>
            <ul className="list-disc pr-5 space-y-0.5">
              {warnings.map((w) => (
                <li key={w.label} style={{ color: w.level === "crit" ? "hsl(0 84% 60%)" : "hsl(38 92% 50%)" }}>
                  {w.label} — {w.level === "crit" ? "حرج (≥95%)" : "تحذير (≥80%)"}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Database} title="حجم قاعدة البيانات"
              used={data.db_size_bytes} limit={LIMITS.db_size_bytes}
              formatter={formatBytes} hint={`${data.total_rows.toLocaleString()} صف تقريبي`} />
            <StatCard icon={HardDrive} title="حجم التخزين"
              used={data.storage_bytes} limit={LIMITS.storage_bytes}
              formatter={formatBytes} hint={`${data.storage_count.toLocaleString()} ملف`} />
            <StatCard icon={Activity} title="طلبات API (تقديري شهري)"
              used={apiUsed} limit={LIMITS.api_requests_monthly}
              formatter={(n) => n.toLocaleString()} hint={`${data.invoices_last_30d.toLocaleString()} فاتورة آخر 30 يوم`} />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText size={16} /> فواتير آخر 7 أيام
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.invoices_last_7d}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="day" tickFormatter={(d) => String(d).slice(5)} fontSize={10} />
                      <YAxis fontSize={10} width={24} />
                      <RTooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <CardTitle className="text-base">أكبر الجداول حجماً</CardTitle>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                  <Input
                    placeholder="بحث باسم الجدول..."
                    value={tableSearch}
                    onChange={(e) => { setTableSearch(e.target.value); setCurrentPage(1); }}
                    className="pr-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-right py-2 px-2">الجدول</th>
                      <th className="text-right py-2 px-2">عدد الصفوف (تقديري)</th>
                      <th className="text-right py-2 px-2">الحجم</th>
                      <th className="text-right py-2 px-2">% من القاعدة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedTables.map((t) => {
                      const p = pct(t.size_bytes, data.db_size_bytes);
                      return (
                        <tr key={t.table_name} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-2 font-medium">{t.table_name}</td>
                          <td className="py-2 px-2">{t.row_estimate.toLocaleString()}</td>
                          <td className="py-2 px-2">{formatBytes(t.size_bytes)}</td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]">
                                <div className="h-full bg-primary" style={{ width: `${p}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground w-10">{p.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {pagedTables.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-muted-foreground">
                          لا توجد نتائج مطابقة
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t">
                <div className="text-xs text-muted-foreground">
                  عرض {(currentPage - 1) * TABLE_PAGE_SIZE + 1} — {Math.min(currentPage * TABLE_PAGE_SIZE, filteredTables.length)} من {filteredTables.length} جدول
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                  >
                    <ChevronRight size={16} />
                  </Button>
                  <span className="text-sm font-medium px-2">
                    {currentPage} / {totalTablePages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalTablePages, p + 1))}
                    disabled={currentPage >= totalTablePages}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">نصائح لتقليل الاستهلاك</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              <p>• راجع المرفقات منتهية الصلاحية في صفحة العناصر المحذوفة لاسترداد مساحة التخزين.</p>
              <p>• احذف بيانات تجريبية من جداول الاختبار إن وُجدت.</p>
              <p>• الأرقام تقديرية وقد تختلف قليلاً عن الفواتير الفعلية لـ Cloud.</p>
              <p>• الحدود المعروضة قابلة للتخصيص في الكود (ملف <code>useCloudUsage.ts</code>).</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
