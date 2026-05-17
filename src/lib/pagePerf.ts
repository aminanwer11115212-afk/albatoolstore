/**
 * قياس أداء لكل صفحة:
 *   - عدد re-renders (يُجمَع عبر usePageRenderCount)
 *   - عدد طلبات الشبكة + إجمالي البايتات (PerformanceObserver: resource)
 *   - مجموع زمن "long tasks" بالمللي ثانية (PerformanceObserver: longtask) كمؤشر CPU
 *
 * البيانات تُخزَّن في localStorage تحت `page_perf_v1` بشكل تراكمي لكل path،
 * مع طابع زمني يتيح مقارنة قبل/بعد عبر "snapshots".
 *
 * كل القياسات تعمل تلقائياً بمجرد استدعاء initPagePerf() مرة واحدة في App.
 */

const KEY = "page_perf_v1";
const SNAP_KEY = "page_perf_snaps_v1";

export interface PageStats {
  path: string;
  renders: number;
  netRequests: number;
  netBytes: number;
  longTaskMs: number;
  lastSeen: number;
}

export interface PerfSnapshot {
  label: string;
  ts: number;
  pages: PageStats[];
}

type StatsMap = Record<string, PageStats>;

function readStats(): StatsMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StatsMap) : {};
  } catch {
    return {};
  }
}

function writeStats(m: StatsMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* ignore quota */
  }
}

function ensure(path: string, m: StatsMap): PageStats {
  if (!m[path]) {
    m[path] = {
      path,
      renders: 0,
      netRequests: 0,
      netBytes: 0,
      longTaskMs: 0,
      lastSeen: Date.now(),
    };
  }
  return m[path];
}

let initialized = false;

export function initPagePerf() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const PO = (window as unknown as { PerformanceObserver?: typeof PerformanceObserver })
    .PerformanceObserver;
  if (!PO) return;

  // Long tasks → مؤشر ضغط CPU
  try {
    const lt = new PO((list) => {
      const m = readStats();
      const path = window.location.pathname;
      const s = ensure(path, m);
      for (const e of list.getEntries()) {
        s.longTaskMs += Math.round(e.duration);
      }
      s.lastSeen = Date.now();
      writeStats(m);
    });
    lt.observe({ type: "longtask", buffered: true } as PerformanceObserverInit);
  } catch {
    /* longtask غير مدعوم في بعض المتصفحات */
  }

  // Resource entries → عدد الطلبات + الحجم
  try {
    const ro = new PO((list) => {
      const m = readStats();
      const path = window.location.pathname;
      const s = ensure(path, m);
      for (const e of list.getEntries()) {
        const r = e as PerformanceResourceTiming;
        // نتجاهل preflight/cache hits (transferSize=0 لا يعني خطأ، فقط نتجاهله للحجم)
        s.netRequests += 1;
        s.netBytes += r.transferSize || r.encodedBodySize || 0;
      }
      s.lastSeen = Date.now();
      writeStats(m);
    });
    ro.observe({ type: "resource", buffered: true } as PerformanceObserverInit);
  } catch {
    /* noop */
  }
}

/** يُستدعى من كل re-render في الصفحة لزيادة العدّاد. */
export function bumpPageRender(path: string) {
  const m = readStats();
  const s = ensure(path, m);
  s.renders += 1;
  s.lastSeen = Date.now();
  writeStats(m);
}

export function getPageStats(): PageStats[] {
  const m = readStats();
  return Object.values(m).sort((a, b) => b.lastSeen - a.lastSeen);
}

export function clearPageStats() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

/** Snapshot: يحفظ الحالة الحالية بعنوان (مثل "before" أو "after"). */
export function saveSnapshot(label: string) {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    const arr: PerfSnapshot[] = raw ? JSON.parse(raw) : [];
    arr.push({ label, ts: Date.now(), pages: getPageStats() });
    // نحتفظ بآخر 20 snapshot
    if (arr.length > 20) arr.splice(0, arr.length - 20);
    localStorage.setItem(SNAP_KEY, JSON.stringify(arr));
  } catch {
    /* noop */
  }
}

export function getSnapshots(): PerfSnapshot[] {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    return raw ? (JSON.parse(raw) as PerfSnapshot[]) : [];
  } catch {
    return [];
  }
}

export function clearSnapshots() {
  try {
    localStorage.removeItem(SNAP_KEY);
  } catch {
    /* noop */
  }
}
