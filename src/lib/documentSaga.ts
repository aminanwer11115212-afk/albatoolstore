// documentSaga — كتابة مستندات متعددة الجداول ذرّياً (مع دعم أوفلاين)
//
// الصيغة:
//   const saga = buildInvoiceSaga({ header, items, transports, packaging });
//   await runDocumentSaga(saga);
//
// - أونلاين: تنفّذ العمليات بترتيب، مع FK resolution ($tempId → uuid حقيقي).
//   عند فشل جزئي: rollback ما أُدرج.
// - أوفلاين: تُخزَّن كوحدة في IDB، وعند العودة تُعاد الكرّة كاملةً مع backoff.
import { get, set } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";
import { backoffDelay, MAX_ATTEMPTS, isPermanentError } from "./offlineQueue";

const KEY = "albatool:saga-queue:v1";

export type SagaKind = "invoice" | "quote" | "purchase" | "stock_return";

export interface SagaOp {
  op: "insert" | "update" | "delete";
  table: string;
  /** اسم متغير اختياري نُخزّن به id السجل المُدرج ($X). */
  tempId?: string;
  /** payload: أي قيمة "$X" تُستبدل بـ id الحقيقي بعد تنفيذ العملية ذات tempId="X". */
  payload?: any;
  match?: Record<string, any>;
}

export interface SagaEnvelope {
  id: string;
  kind: SagaKind;
  label?: string;
  createdAt: number;
  operations: SagaOp[];
  attempts: number;
  lastError?: string;
  nextRetryAt: number;
  status: "pending" | "in_flight" | "failed_retryable" | "failed_permanent" | "done";
  /** ids المُدرجة فعلياً في الجولة الحالية (لأغراض rollback). */
  inserted?: Array<{ table: string; id: string }>;
}

type Listener = (items: SagaEnvelope[]) => void;
const listeners = new Set<Listener>();
let cache: SagaEnvelope[] = [];
let loaded = false;

async function load(): Promise<SagaEnvelope[]> {
  if (loaded) return cache;
  try { cache = (await get<SagaEnvelope[]>(KEY)) ?? []; } catch { cache = []; }
  loaded = true;
  return cache;
}
async function save(): Promise<void> {
  try { await set(KEY, cache); } catch { /* noop */ }
  listeners.forEach((l) => { try { l([...cache]); } catch { /* noop */ } });
}

export function subscribeSagas(l: Listener): () => void {
  listeners.add(l);
  load().then(() => l([...cache]));
  return () => { listeners.delete(l); };
}

export async function getSagaQueue(): Promise<SagaEnvelope[]> {
  await load();
  return [...cache];
}

export async function getSagaQueueCount(): Promise<number> {
  await load();
  return cache.filter((i) => i.status !== "done" && i.status !== "failed_permanent").length;
}

// -------- Placeholder resolution: يستبدل "$X" في أي عمق بـ ids[X] --------
function resolvePlaceholders(payload: any, ids: Record<string, string>): any {
  if (payload == null) return payload;
  if (typeof payload === "string") {
    if (payload.startsWith("$")) {
      const key = payload.slice(1);
      return ids[key] ?? payload;
    }
    return payload;
  }
  if (Array.isArray(payload)) return payload.map((p) => resolvePlaceholders(p, ids));
  if (typeof payload === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(payload)) out[k] = resolvePlaceholders(v, ids);
    return out;
  }
  return payload;
}

// -------- Execute one saga --------
async function executeSaga(envelope: SagaEnvelope): Promise<{ error?: any }> {
  const ids: Record<string, string> = {};
  const inserted: Array<{ table: string; id: string }> = [];
  envelope.inserted = inserted;
  for (const op of envelope.operations) {
    const resolvedPayload = resolvePlaceholders(op.payload, ids);
    const resolvedMatch = resolvePlaceholders(op.match, ids);
    const t: any = (supabase as any).from(op.table);
    try {
      if (op.op === "insert") {
        const { data, error } = await t.insert(resolvedPayload).select("id").maybeSingle();
        if (error) return { error };
        if (data?.id) {
          inserted.push({ table: op.table, id: data.id });
          if (op.tempId) ids[op.tempId] = data.id;
        }
      } else if (op.op === "update") {
        let q = t.update(resolvedPayload);
        for (const [k, v] of Object.entries(resolvedMatch || {})) q = q.eq(k, v);
        const { error } = await q;
        if (error) return { error };
      } else if (op.op === "delete") {
        let q = t.delete();
        for (const [k, v] of Object.entries(resolvedMatch || {})) q = q.eq(k, v);
        const { error } = await q;
        if (error) return { error };
      }
    } catch (error) { return { error }; }
  }
  return {};
}

async function rollback(envelope: SagaEnvelope): Promise<void> {
  const inserted = envelope.inserted || [];
  // احذف بعكس ترتيب الإدراج
  for (const ent of [...inserted].reverse()) {
    try {
      await (supabase as any).from(ent.table).delete().eq("id", ent.id);
    } catch { /* noop */ }
  }
  envelope.inserted = [];
}

export async function enqueueSaga(envelope: Omit<SagaEnvelope, "id" | "createdAt" | "attempts" | "nextRetryAt" | "status">): Promise<SagaEnvelope> {
  await load();
  const item: SagaEnvelope = {
    id: (crypto as any)?.randomUUID?.() ?? String(Date.now() + Math.random()),
    createdAt: Date.now(),
    attempts: 0, nextRetryAt: 0, status: "pending",
    ...envelope,
  };
  cache.push(item);
  await save();
  return item;
}

/** التنفيذ الفوري إن أونلاين، أو الإضافة للطابور. */
export async function runDocumentSaga(env: Omit<SagaEnvelope, "id" | "createdAt" | "attempts" | "nextRetryAt" | "status">): Promise<{ queued: boolean; error?: any; ids?: Record<string, string> }> {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  if (online) {
    const envelope: SagaEnvelope = {
      id: (crypto as any)?.randomUUID?.() ?? String(Date.now()),
      createdAt: Date.now(), attempts: 0, nextRetryAt: 0, status: "in_flight",
      ...env,
    };
    const { error } = await executeSaga(envelope);
    if (error) {
      await rollback(envelope);
      return { queued: false, error };
    }
    return { queued: false };
  }
  await enqueueSaga(env);
  return { queued: true };
}

let flushing = false;
export async function flushSagas(): Promise<{ ok: number; failed: number }> {
  if (flushing) return { ok: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: 0, failed: 0 };
  flushing = true;
  let ok = 0, failed = 0;
  try {
    await load();
    const now = Date.now();
    const items = cache.filter(
      (i) => (i.status === "pending" || i.status === "failed_retryable") && (i.nextRetryAt || 0) <= now,
    );
    for (const env of items) {
      env.status = "in_flight";
      const { error } = await executeSaga(env);
      if (!error) {
        env.status = "done";
        cache = cache.filter((x) => x.id !== env.id);
        ok++; continue;
      }
      // rollback ثم backoff
      await rollback(env);
      env.attempts = (env.attempts || 0) + 1;
      env.lastError = (error as any)?.message || String(error);
      if (isPermanentError(error) || env.attempts >= MAX_ATTEMPTS) {
        env.status = "failed_permanent";
      } else {
        env.status = "failed_retryable";
        env.nextRetryAt = Date.now() + backoffDelay(env.attempts);
      }
      failed++;
    }
    await save();
  } finally { flushing = false; }
  return { ok, failed };
}

export async function removeSaga(id: string): Promise<void> {
  await load();
  cache = cache.filter((x) => x.id !== id);
  await save();
}

export async function retrySaga(id: string): Promise<void> {
  await load();
  const env = cache.find((x) => x.id === id);
  if (!env) return;
  env.status = "pending";
  env.nextRetryAt = 0;
  env.lastError = undefined;
  await save();
  await flushSagas();
}

let initialized = false;
export function initSagaFlush(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const handler = () => { if (navigator.onLine) flushSagas(); };
  window.addEventListener("online", handler);
  if (navigator.onLine) setTimeout(handler, 2_500);
  setInterval(handler, 45_000);
}
