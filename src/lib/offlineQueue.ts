// Offline write queue — يحفظ عمليات الكتابة (insert/update/delete) في IndexedDB
// عندما ينقطع الاتصال، ويعيد إرسالها تلقائياً عند عودة الاتصال.
//
// كيفية الاستخدام في أي handler:
//   import { runOrQueue } from "@/lib/offlineQueue";
//   await runOrQueue({
//     table: "customers",
//     op: "insert",
//     payload: { name, phone },
//     label: "إضافة عميل",
//   });
//
// عند الاتصال: يُنفَّذ فوراً على Supabase ويعيد النتيجة.
// عند عدم الاتصال: يُخزَّن ويُرجع { queued: true } بدون رمي خطأ.
import { get, set } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";

const QUEUE_KEY = "albatool:offline-queue:v1";

export type QueueOp = "insert" | "update" | "delete" | "upsert";

export interface QueuedItem {
  id: string;
  createdAt: number;
  table: string;
  op: QueueOp;
  payload?: any;
  match?: Record<string, any>; // شرط WHERE للـ update/delete
  label?: string;              // تسمية عربية للعرض
  retries: number;
  lastError?: string;
}

type Listener = (items: QueuedItem[]) => void;
const listeners = new Set<Listener>();
let cache: QueuedItem[] = [];
let loaded = false;

async function load(): Promise<QueuedItem[]> {
  if (loaded) return cache;
  try {
    cache = (await get<QueuedItem[]>(QUEUE_KEY)) ?? [];
  } catch {
    cache = [];
  }
  loaded = true;
  return cache;
}

async function save(): Promise<void> {
  try {
    await set(QUEUE_KEY, cache);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[offlineQueue] save failed", e);
  }
  listeners.forEach((l) => {
    try { l([...cache]); } catch { /* noop */ }
  });
}

export function subscribeQueue(l: Listener): () => void {
  listeners.add(l);
  // Push initial snapshot
  load().then(() => l([...cache]));
  return () => { listeners.delete(l); };
}

export async function getQueue(): Promise<QueuedItem[]> {
  await load();
  return [...cache];
}

export async function getQueueCount(): Promise<number> {
  await load();
  return cache.length;
}

async function executeItem(item: QueuedItem): Promise<{ error: any }> {
  const t: any = (supabase as any).from(item.table);
  try {
    if (item.op === "insert") {
      const { error } = await t.insert(item.payload);
      return { error };
    }
    if (item.op === "upsert") {
      const { error } = await t.upsert(item.payload);
      return { error };
    }
    if (item.op === "update") {
      let q = t.update(item.payload);
      for (const [k, v] of Object.entries(item.match || {})) q = q.eq(k, v);
      const { error } = await q;
      return { error };
    }
    if (item.op === "delete") {
      let q = t.delete();
      for (const [k, v] of Object.entries(item.match || {})) q = q.eq(k, v);
      const { error } = await q;
      return { error };
    }
    return { error: new Error("عملية غير معروفة") };
  } catch (error) {
    return { error };
  }
}

async function enqueue(input: Omit<QueuedItem, "id" | "createdAt" | "retries">): Promise<QueuedItem> {
  await load();
  const item: QueuedItem = {
    id: (crypto as any)?.randomUUID?.() ?? String(Date.now() + Math.random()),
    createdAt: Date.now(),
    retries: 0,
    ...input,
  };
  cache.push(item);
  await save();
  return item;
}

export async function removeItem(id: string): Promise<void> {
  await load();
  cache = cache.filter((x) => x.id !== id);
  await save();
}

export async function clearQueue(): Promise<void> {
  cache = [];
  await save();
}

let flushing = false;

/**
 * تنفيذ كل العناصر في الطابور. يعيد { ok, failed }.
 * لا يرمي — يخزّن الأخطاء داخل item.lastError ويترك العنصر.
 */
export async function flushQueue(): Promise<{ ok: number; failed: number }> {
  if (flushing) return { ok: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: 0, failed: 0 };
  }
  flushing = true;
  let ok = 0;
  let failed = 0;
  try {
    await load();
    // نسخة لتفادي التعديل أثناء التكرار
    const items = [...cache];
    for (const item of items) {
      const { error } = await executeItem(item);
      if (!error) {
        cache = cache.filter((x) => x.id !== item.id);
        ok++;
      } else {
        item.retries = (item.retries || 0) + 1;
        item.lastError = (error as any)?.message || String(error);
        failed++;
      }
    }
    await save();
  } finally {
    flushing = false;
  }
  return { ok, failed };
}

/**
 * التنفيذ الفوري إذا كان الاتصال متاحاً، وإلا الإضافة للطابور.
 * يعيد { queued: true } عند التخزين، أو نتيجة Supabase عند التنفيذ.
 */
export async function runOrQueue<T = any>(input: {
  table: string;
  op: QueueOp;
  payload?: any;
  match?: Record<string, any>;
  label?: string;
}): Promise<{ queued: boolean; data?: T | null; error?: any }> {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  if (online) {
    const t: any = (supabase as any).from(input.table);
    try {
      if (input.op === "insert") {
        const { data, error } = await t.insert(input.payload).select().maybeSingle();
        return { queued: false, data, error };
      }
      if (input.op === "upsert") {
        const { data, error } = await t.upsert(input.payload).select().maybeSingle();
        return { queued: false, data, error };
      }
      if (input.op === "update") {
        let q = t.update(input.payload);
        for (const [k, v] of Object.entries(input.match || {})) q = q.eq(k, v);
        const { data, error } = await q.select().maybeSingle();
        return { queued: false, data, error };
      }
      if (input.op === "delete") {
        let q = t.delete();
        for (const [k, v] of Object.entries(input.match || {})) q = q.eq(k, v);
        const { error } = await q;
        return { queued: false, data: null, error };
      }
    } catch (error) {
      return { queued: false, error };
    }
  }
  await enqueue(input);
  return { queued: true };
}

// إعداد التدفق التلقائي عند عودة الاتصال + عند تحميل الصفحة إن كان online.
let initialized = false;
export function initOfflineFlush(onFlushed?: (r: { ok: number; failed: number }) => void): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const handler = async () => {
    const r = await flushQueue();
    if ((r.ok || r.failed) && onFlushed) onFlushed(r);
  };
  window.addEventListener("online", handler);
  // محاولة أولية عند التحميل
  if (navigator.onLine) {
    setTimeout(handler, 1200);
  }
  // إعادة محاولة كل دقيقتين للعناصر الفاشلة
  setInterval(() => {
    if (navigator.onLine && cache.length > 0) handler();
  }, 120_000);
}
