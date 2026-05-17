import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  getVitals, getNavigations, clearPerfData,
  type VitalEntry, type NavEntry,
} from "@/lib/perfMonitor";
import {
  getPageStats, clearPageStats,
  saveSnapshot, getSnapshots, clearSnapshots,
  type PageStats, type PerfSnapshot,
} from "@/lib/pagePerf";
import { Activity, Gauge, Trash2, RefreshCw, Camera } from "lucide-react";

const VITAL_LABELS: Record<string, string> = {
  LCP: "أكبر عنصر مرئي (LCP)",
  FCP: "أول طلاء للمحتوى (FCP)",
  INP: "زمن الاستجابة للتفاعل (INP)",
  CLS: "إزاحة التخطيط (CLS)",
  TTFB: "زمن أول بايت (TTFB)",
};

function ratingColor(rating: string) {
  if (rating === "good") return "bg-green-500/15 text-green-700 dark:text-green-400";
  if (rating === "needs-improvement") return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-red-500/15 text-red-700 dark:text-red-400";
}

function fmt(name: string, v: number) {
  if (name === "CLS") return v.toFixed(3);
  return `${Math.round(v)} ms`;
}

export default function PerformanceReportPage() {
  const [vitals, setVitals] = useState<VitalEntry[]>([]);
  const [navs, setNavs] = useState<NavEntry[]>([]);
  const [pages, setPages] = useState<PageStats[]>([]);
  const [snaps, setSnaps] = useState<PerfSnapshot[]>([]);
  const [snapLabel, setSnapLabel] = useState("before");

  const refresh = () => {
    setVitals(getVitals());
    setNavs(getNavigations());
    setPages(getPageStats());
    setSnaps(getSnapshots());
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  // متوسط آخر قيمة لكل Vital
  const vitalsSummary = useMemo(() => {
    const map = new Map<string, { values: number[]; rating: string }>();
    for (const v of vitals) {
      if (!map.has(v.name)) map.set(v.name, { values: [], rating: v.rating });
      const rec = map.get(v.name)!;
      rec.values.push(v.value);
      rec.rating = v.rating;
    }
    return Array.from(map.entries()).map(([name, { values, rating }]) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const last = values[values.length - 1];
      return { name, avg, last, rating, count: values.length };
    });
  }, [vitals]);

  // أبطأ التنقلات
  const slowestNavs = useMemo(
    () => [...navs].sort((a, b) => b.duration - a.duration).slice(0, 15),
    [navs],
  );

  // متوسط زمن التنقّل لكل وجهة
  const navAverages = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>();
    for (const n of navs) {
      const rec = map.get(n.to) ?? { sum: 0, n: 0 };
      rec.sum += n.duration;
      rec.n += 1;
      map.set(n.to, rec);
    }
    return Array.from(map.entries())
      .map(([to, { sum, n }]) => ({ to, avg: Math.round(sum / n), n }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 15);
  }, [navs]);

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gauge className="w-6 h-6 text-primary" />
            تقرير الأداء
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            قياسات Web Vitals وزمن التنقّل بين الصفحات (محلياً على هذا الجهاز)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            value={snapLabel}
            onChange={(e) => setSnapLabel(e.target.value)}
            placeholder="اسم اللقطة (before / after)"
            className="border rounded px-2 text-sm h-9"
          />
          <Button
            variant="default"
            size="sm"
            onClick={() => { saveSnapshot(snapLabel || "snap"); refresh(); }}
          >
            <Camera className="w-4 h-4 ml-2" /> حفظ لقطة
          </Button>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="w-4 h-4 ml-2" /> تحديث
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { clearPerfData(); clearPageStats(); clearSnapshots(); refresh(); }}
          >
            <Trash2 className="w-4 h-4 ml-2" /> مسح كل البيانات
          </Button>
        </div>
      </div>

      {/* Web Vitals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5" /> Web Vitals
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vitalsSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              لم تُجمَع بيانات بعد. تصفّح بعض الصفحات ثم عُد لهذه الصفحة.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {vitalsSummary.map((v) => (
                <div key={v.name} className="border rounded-lg p-4 bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">
                      {VITAL_LABELS[v.name] || v.name}
                    </span>
                    <Badge className={ratingColor(v.rating)} variant="secondary">
                      {v.rating}
                    </Badge>
                  </div>
                  <div className="text-2xl font-bold">{fmt(v.name, v.last)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    المتوسط: {fmt(v.name, v.avg)} • عدد القياسات: {v.count}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* أبطأ التنقلات */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">أبطأ التنقّلات بين الصفحات</CardTitle>
        </CardHeader>
        <CardContent>
          {slowestNavs.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد بيانات تنقّل بعد.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">من</TableHead>
                  <TableHead className="text-right">إلى</TableHead>
                  <TableHead className="text-right">المدة</TableHead>
                  <TableHead className="text-right">الوقت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slowestNavs.map((n, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-mono">{n.from}</TableCell>
                    <TableCell className="text-xs font-mono">{n.to}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          n.duration > 1000
                            ? "bg-red-500/15 text-red-700"
                            : n.duration > 500
                            ? "bg-amber-500/15 text-amber-700"
                            : "bg-green-500/15 text-green-700"
                        }
                      >
                        {n.duration} ms
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(n.ts).toLocaleTimeString("ar")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* متوسط زمن التحميل لكل صفحة */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">متوسط زمن التحميل لكل صفحة</CardTitle>
        </CardHeader>
        <CardContent>
          {navAverages.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد بيانات بعد.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المسار</TableHead>
                  <TableHead className="text-right">المتوسط</TableHead>
                  <TableHead className="text-right">عدد الزيارات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {navAverages.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-mono">{p.to}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          p.avg > 1000
                            ? "bg-red-500/15 text-red-700"
                            : p.avg > 500
                            ? "bg-amber-500/15 text-amber-700"
                            : "bg-green-500/15 text-green-700"
                        }
                      >
                        {p.avg} ms
                      </Badge>
                    </TableCell>
                    <TableCell>{p.n}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* إحصاءات لكل صفحة (renders + network + CPU long tasks) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">إحصاءات لكل صفحة (تراكمية)</CardTitle>
        </CardHeader>
        <CardContent>
          {pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد بيانات بعد. تصفّح الصفحات.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المسار</TableHead>
                  <TableHead className="text-right">عدد re-renders</TableHead>
                  <TableHead className="text-right">طلبات الشبكة</TableHead>
                  <TableHead className="text-right">حجم الشبكة</TableHead>
                  <TableHead className="text-right">CPU long tasks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((p) => (
                  <TableRow key={p.path}>
                    <TableCell className="text-xs font-mono">{p.path}</TableCell>
                    <TableCell>{p.renders}</TableCell>
                    <TableCell>{p.netRequests}</TableCell>
                    <TableCell>{(p.netBytes / 1024).toFixed(1)} KB</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          p.longTaskMs > 500
                            ? "bg-red-500/15 text-red-700"
                            : p.longTaskMs > 100
                            ? "bg-amber-500/15 text-amber-700"
                            : "bg-green-500/15 text-green-700"
                        }
                      >
                        {p.longTaskMs} ms
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* مقارنة Snapshots (قبل/بعد) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">مقارنة اللقطات (Snapshots)</CardTitle>
        </CardHeader>
        <CardContent>
          {snaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              احفظ لقطة "before" قبل التغيير، ثم لقطة "after" بعده، وستظهر المقارنة هنا.
            </p>
          ) : (
            <div className="space-y-4">
              {snaps.slice().reverse().map((s, i) => (
                <div key={i} className="border rounded p-3 text-xs">
                  <div className="font-bold mb-2">
                    {s.label} • {new Date(s.ts).toLocaleString("ar")}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono">
                    {s.pages.map((p) => (
                      <div key={p.path} className="flex justify-between border-b py-1">
                        <span>{p.path}</span>
                        <span>
                          renders={p.renders} • net={p.netRequests} ({(p.netBytes/1024).toFixed(0)}KB) • cpu={p.longTaskMs}ms
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        تُحفظ القياسات محلياً على هذا الجهاز فقط ولا تُرسَل لأي خادم.
      </p>
    </div>
  );
}
