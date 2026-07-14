// Offline write queue — v2
// طابور كتابات مع backoff تلقائي + سجل حالة كل عملية + كشف تعارضات.
//
// كيفية الاستخدام:
//   import { runOrQueue } from "@/lib/offlineQueue";
//   await runOrQueue({
//     table: "customers",
//     op: "insert",
//     payload: { name, phone },
//     label: "إضافة عميل",
//   });
//
// المتقدم — UPDATE مع كشف التعارض:
//   await runOrQueue({
//     table: "customers", op: "update",
//     payload: { name: "..." },
//     match: { id },
//     expectedUpdatedAt: customer.updated_at,   // إن اختلفت الآن → تعارض
//     label: "تعديل عميل",
//   });
import { get, set } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";

const QUEUE_KEY = "albatool:offline-queue:v2";

export type QueueOp = "insert" | "update" | "delete" | "upsert";
export type QueueStatus =
  | "pending"
  | "in_flight"
  | "failed_retryable"
  | "failed_permanent"
  | "conflict"
  | "done";

export interface QueuedItem {
  id: string;
  createdAt: number;
  table: string;
  op: QueueOp;
  payload?: any;
  match?: Record<string, any>;
  label?: string;
  /** إن رجع updated_at للسجل مختلفاً عن هذا → conflict (يُعالج عبر conflictResolver). */
  expectedUpdatedAt?: string | null;
  attempts: number;
  lastError?: string;
  nextRetryAt: number;
  status: QueueStatus;
}

type Listener = (items: QueuedItem[]) => void;
const listeners = new Set<Listener>();
let cache: QueuedItem[] = [];
let loaded = false;

// ---------------- Backoff ----------------
// 2s → 5s → 15s → 60s → 5m
const BACKOFF_MS = [2_000, 5_000, 15_000, 60_000, 300_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length;

export function backoffDelay(attempt: number): number {
  const idx = Math.min(Math.max(0, attempt), BACKOFF_MS.length - 1);
  return BACKOFF_MS[idx];
}

/** خطأ تحقُّق دائم لا يستفيد من إعادة المحاولة (شامل RLS + duplicate + FK + check). */
export function isPermanentError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || err.status || "");
  if (/^(2\d\d\d\d|4\d\d\d\d)$/.test(code)) return true; // PGRST 4xx, Postgres 23xxx/42xxx
  if (["23505", "23503", "23502", "23514", "42501", "42P01"].includes(code)) return true;
  const msg = String(err.message || "").toLowerCase();
  return /permission denied|violates|duplicate key|row-level security|invalid input/.test(msg);
}

// ---------------- Storage ----------------

async function load(): Promise<QueuedItem[]> {
  if (loaded) return cache;
  try {
    cache = (await get<QueuedItem[]>(QUEUE_KEY)) ?? [];
    // Migration من v1: أضف الحقول الجديدة
    cache = cache.map((i: any) => ({
      attempts: 0,
      nextRetryAt: 0,
      status: "pending",
      ...i,
    })) as QueuedItem[];
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
  load().then(() => l([...cache]));
  return () => { listeners.delete(l); };
}

export async function getQueue(): Promise<QueuedItem[]> {
  await load();
  return [...cache];
}

/** يعدّ العناصر النشطة (غير done/permanent). */
export async function getQueueCount(): Promise<number> {
  await load();
  return cache.filter((i) => i.status !== "done" && i.status !== "failed_permanent").length;
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

/** إعادة محاولة يدوية لعنصر واحد (يُعيد `status` إلى pending ويُصفّر nextRetryAt). */
export async function retryItem(id: string): Promise<void> {
  await load();
  const item = cache.find((x) => x.id === id);
  if (!item) return;
  item.status = "pending";
  item.nextRetryAt = 0;
  item.lastError = undefined;
  await save();
  await flushQueue();
}

// ---------------- Execute ----------------

interface ExecResult { error: any; conflict?: boolean; remote?: any }

async function checkConflict(item: QueuedItem): Promise<{ remote?: any; conflict: boolean }> {
  if (item.op !== "update" || !item.expectedUpdatedAt || !item.match?.id) {
    return { conflict: false };
  }
  try {
    const { data } = await (supabase as any)
      .from(item.table)
      .select("*")
      .eq("id", item.match.id)
      .maybeSingle();
    if (data && data.updated_at && data.updated_at !== item.expectedUpdatedAt) {
      return { remote: data, conflict: true };
    }
    return { remote: data, conflict: false };
  } catch {
    return { conflict: false };
  }
}

async function executeItem(item: QueuedItem): Promise<ExecResult> {
  // كشف تعارض قبل UPDATE
  const conf = await checkConflict(item);
  if (conf.conflict) {
    return { error: new Error("conflict"), conflict: true, remote: conf.remote };
  }
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

async function enqueue(input: Omit<QueuedItem, "id" | "createdAt" | "attempts" | "nextRetryAt" | "status">): Promise<QueuedItem> {
  await load();
  const item: QueuedItem = {
    id: (crypto as any)?.randomUUID?.() ?? String(Date.now() + Math.random()),
    createdAt: Date.now(),
    attempts: 0,
    nextRetryAt: 0,
    status: "pending",
    ...input,
  };
  cache.push(item);
  await save();
  return item;
}

// ---------------- Flush ----------------

let flushing = false;
type ConflictHandler = (item: QueuedItem, remote: any) => Promise<void> | void;
let conflictHandler: ConflictHandler | null = null;

export function setConflictHandler(fn: ConflictHandler | null): void {
  conflictHandler = fn;
}

export async function flushQueue(): Promise<{ ok: number; failed: number; conflicts: number }> {
  if (flushing) return { ok: 0, failed: 0, conflicts: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: 0, failed: 0, conflicts: 0 };
  }
  flushing = true;
  let ok = 0, failed = 0, conflicts = 0;
  try {
    await load();
    const now = Date.now();
    const items = cache.filter(
      (i) =>
        (i.status === "pending" || i.status === "failed_retryable") &&
        (i.nextRetryAt || 0) <= now,
    );
    for (const item of items) {
      item.status = "in_flight";
      const { error, conflict, remote } = await executeItem(item);
      if (!error) {
        item.status = "done";
        cache = cache.filter((x) => x.id !== item.id);
        ok++;
        continue;
      }
      if (conflict) {
        item.status = "conflict";
        item.lastError = "تعارض: عُدِّل السجل من مكان آخر";
        conflicts++;
        if (conflictHandler) {
          try { await conflictHandler(item, remote); } catch { /* noop */ }
        }
        continue;
      }
      item.attempts = (item.attempts || 0) + 1;
      item.lastError = (error as any)?.message || String(error);
      if (isPermanentError(error) || item.attempts >= MAX_ATTEMPTS) {
        item.status = "failed_permanent";
      } else {
        item.status = "failed_retryable";
        // أول محاولة إعادة تكون فورية؛ المحاولات اللاحقة تستخدم backoff تصاعدي.
        item.nextRetryAt = item.attempts <= 1 ? 0 : Date.now() + backoffDelay(item.attempts - 1);
      }
      failed++;
    }
    await save();
  } finally {
    flushing = false;
  }
  return { ok, failed, conflicts };
}

// ---------------- Public API ----------------

export async function runOrQueue<T = any>(input: {
  table: string;
  op: QueueOp;
  payload?: any;
  match?: Record<string, any>;
  label?: string;
  expectedUpdatedAt?: string | null;
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

// ---------------- Init / Loops ----------------

let initialized = false;
export function initOfflineFlush(onFlushed?: (r: { ok: number; failed: number; conflicts: number }) => void): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const handler = async () => {
    const r = await flushQueue();
    if ((r.ok || r.failed || r.conflicts) && onFlushed) onFlushed(r);
  };
  window.addEventListener("online", handler);
  if (navigator.onLine) setTimeout(handler, 1200);
  // كل 30 ثانية — يعالج نوافذ backoff الانتهت
  setInterval(() => {
    if (navigator.onLine) handler();
  }, 30_000);
}
