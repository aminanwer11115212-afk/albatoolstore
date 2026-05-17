// نظام قياس الأداء: Web Vitals + أزمنة التنقّل بين الصفحات
// يخزّن البيانات في localStorage (آخر 200 قياس) ويتيح قراءتها في صفحة التقرير

import { onCLS, onINP, onLCP, onFCP, onTTFB, type Metric } from "web-vitals";

const VITALS_KEY = "perf_vitals_v1";
const NAV_KEY = "perf_nav_v1";
const MAX_ENTRIES = 200;

export type VitalEntry = {
  name: string;          // CLS / INP / LCP / FCP / TTFB
  value: number;
  rating: string;        // good / needs-improvement / poor
  path: string;
  ts: number;
};

export type NavEntry = {
  from: string;
  to: string;
  duration: number;      // ms
  ts: number;
};

function readArr<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function pushEntry<T>(key: string, entry: T) {
  try {
    const arr = readArr<T>(key);
    arr.push(entry);
    if (arr.length > MAX_ENTRIES) arr.splice(0, arr.length - MAX_ENTRIES);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    /* ignore quota errors */
  }
}

let initialized = false;

export function initPerfMonitor() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const handler = (metric: Metric) => {
    pushEntry<VitalEntry>(VITALS_KEY, {
      name: metric.name,
      value: Math.round(metric.value * 100) / 100,
      rating: metric.rating,
      path: window.location.pathname,
      ts: Date.now(),
    });
  };

  onCLS(handler);
  onINP(handler);
  onLCP(handler);
  onFCP(handler);
  onTTFB(handler);
}

// قياس زمن التنقّل بين الصفحات
let lastPath = typeof window !== "undefined" ? window.location.pathname : "/";
let navStart = 0;

export function markNavStart(toPath: string) {
  if (toPath === lastPath) return;
  navStart = performance.now();
}

export function markNavEnd(toPath: string) {
  if (toPath === lastPath || navStart === 0) return;
  const duration = Math.round(performance.now() - navStart);
  pushEntry<NavEntry>(NAV_KEY, {
    from: lastPath,
    to: toPath,
    duration,
    ts: Date.now(),
  });
  lastPath = toPath;
  navStart = 0;
}

export function getVitals(): VitalEntry[] {
  return readArr<VitalEntry>(VITALS_KEY);
}

export function getNavigations(): NavEntry[] {
  return readArr<NavEntry>(NAV_KEY);
}

export function clearPerfData() {
  localStorage.removeItem(VITALS_KEY);
  localStorage.removeItem(NAV_KEY);
}
