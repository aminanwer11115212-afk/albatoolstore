// attachmentQueue — طابور رفع المرفقات مع دعم الأوفلاين
//
// الاستخدام:
//   await queueAttachment({
//     file, bucket: "invoice-attachments",
//     pathTemplate: `${invoiceId}/{ts}-{name}`,
//     linkTable: "invoice_attachments",
//     linkPayload: { invoice_id: invoiceId, description },
//   });
//
// - أوفلاين: الملف يُحفظ blob في IDB + يُخزَّن في queue، ويرجع { queued: true }.
// - أونلاين: رفع فوري + INSERT في linkTable + يرجع { queued: false, path, url }.
// - عند العودة: flushAttachmentQueue يرفع كل عنصر ثم يُنشئ سجل الربط، مع backoff.
import { get, set, del, keys } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";
import { backoffDelay, MAX_ATTEMPTS, isPermanentError } from "./offlineQueue";

const QUEUE_KEY = "albatool:att-queue:v1";
const BLOB_PREFIX = "albatool:att-blob:";

export interface AttachmentItem {
  id: string;
  createdAt: number;
  bucket: string;
  pathTemplate: string;  // {ts} {name} placeholders
  linkTable: string;
  linkPayload: Record<string, any>;
  fileName: string;
  contentType: string;
  size: number;
  label?: string;
  attempts: number;
  lastError?: string;
  nextRetryAt: number;
  status: "pending" | "uploading" | "linking" | "failed_retryable" | "failed_permanent" | "done";
  uploadedPath?: string;
  uploadedAt?: number;
}

type Listener = (items: AttachmentItem[]) => void;
const listeners = new Set<Listener>();
let cache: AttachmentItem[] = [];
let loaded = false;

async function load(): Promise<AttachmentItem[]> {
  if (loaded) return cache;
  try { cache = (await get<AttachmentItem[]>(QUEUE_KEY)) ?? []; } catch { cache = []; }
  loaded = true;
  return cache;
}

async function save(): Promise<void> {
  try { await set(QUEUE_KEY, cache); } catch { /* noop */ }
  listeners.forEach((l) => { try { l([...cache]); } catch { /* noop */ } });
}

export function subscribeAttachmentQueue(l: Listener): () => void {
  listeners.add(l);
  load().then(() => l([...cache]));
  return () => { listeners.delete(l); };
}

export async function getAttachmentQueue(): Promise<AttachmentItem[]> {
  await load();
  return [...cache];
}

export async function getAttachmentQueueCount(): Promise<number> {
  await load();
  return cache.filter((i) => i.status !== "done" && i.status !== "failed_permanent").length;
}

function resolvePath(tpl: string, fileName: string): string {
  return tpl
    .replace("{ts}", String(Date.now()))
    .replace("{name}", fileName.replace(/[^a-zA-Z0-9._-]/g, "_"));
}

async function uploadNow(bucket: string, path: string, file: File | Blob, contentType?: string) {
  return await supabase.storage.from(bucket).upload(path, file, {
    contentType: contentType || (file as any).type || "application/octet-stream",
    upsert: false,
  });
}

async function insertLink(table: string, payload: any) {
  return await (supabase as any).from(table).insert(payload);
}

export async function queueAttachment(input: {
  file: File;
  bucket: string;
  pathTemplate: string;
  linkTable: string;
  linkPayload: Record<string, any>;
  label?: string;
}): Promise<{ queued: boolean; path?: string; error?: any }> {
  const { file, bucket, pathTemplate, linkTable, linkPayload, label } = input;
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  if (online) {
    const path = resolvePath(pathTemplate, file.name);
    const { error: upErr } = await uploadNow(bucket, path, file, file.type);
    if (upErr) return { queued: false, error: upErr };
    const { error: linkErr } = await insertLink(linkTable, {
      ...linkPayload, file_path: path, file_name: file.name,
      file_size: file.size, content_type: file.type,
    });
    return { queued: false, path, error: linkErr };
  }
  // OFFLINE: خزّن blob + عنصر
  const id = (crypto as any)?.randomUUID?.() ?? String(Date.now() + Math.random());
  await load();
  const item: AttachmentItem = {
    id, createdAt: Date.now(), bucket, pathTemplate,
    linkTable, linkPayload,
    fileName: file.name, contentType: file.type, size: file.size,
    label, attempts: 0, nextRetryAt: 0, status: "pending",
  };
  try {
    await set(BLOB_PREFIX + id, { blob: file, createdAt: item.createdAt });
  } catch (e) {
    return { queued: false, error: e };
  }
  cache.push(item);
  await save();
  return { queued: true };
}

async function processItem(item: AttachmentItem): Promise<{ error?: any }> {
  try {
    const rec = await get(BLOB_PREFIX + item.id);
    const blob = (rec as any)?.blob as Blob | undefined;
    if (!blob) return { error: new Error("blob missing") };
    if (!item.uploadedPath) {
      item.status = "uploading";
      const path = resolvePath(item.pathTemplate, item.fileName);
      const { error: upErr } = await uploadNow(item.bucket, path, blob, item.contentType);
      if (upErr) return { error: upErr };
      item.uploadedPath = path;
      item.uploadedAt = Date.now();
    }
    item.status = "linking";
    const { error: linkErr } = await insertLink(item.linkTable, {
      ...item.linkPayload,
      file_path: item.uploadedPath,
      file_name: item.fileName,
      file_size: item.size,
      content_type: item.contentType,
    });
    if (linkErr) return { error: linkErr };
    return {};
  } catch (e) { return { error: e }; }
}

let flushing = false;
export async function flushAttachmentQueue(): Promise<{ ok: number; failed: number }> {
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
    for (const item of items) {
      const { error } = await processItem(item);
      if (!error) {
        item.status = "done";
        try { await del(BLOB_PREFIX + item.id); } catch { /* noop */ }
        cache = cache.filter((x) => x.id !== item.id);
        ok++;
        continue;
      }
      item.attempts = (item.attempts || 0) + 1;
      item.lastError = (error as any)?.message || String(error);
      if (isPermanentError(error) || item.attempts >= MAX_ATTEMPTS) {
        item.status = "failed_permanent";
      } else {
        item.status = "failed_retryable";
        item.nextRetryAt = Date.now() + backoffDelay(item.attempts);
      }
      failed++;
    }
    await save();
  } finally { flushing = false; }
  return { ok, failed };
}

export async function removeAttachmentItem(id: string): Promise<void> {
  await load();
  cache = cache.filter((x) => x.id !== id);
  try { await del(BLOB_PREFIX + id); } catch { /* noop */ }
  await save();
}

export async function retryAttachmentItem(id: string): Promise<void> {
  await load();
  const item = cache.find((x) => x.id === id);
  if (!item) return;
  item.status = "pending";
  item.nextRetryAt = 0;
  item.lastError = undefined;
  await save();
  await flushAttachmentQueue();
}

/** رابط عرض محلي للـ blob (للـ preview قبل الرفع). */
export async function getLocalAttachmentUrl(id: string): Promise<string | null> {
  try {
    const rec = await get(BLOB_PREFIX + id);
    const blob = (rec as any)?.blob as Blob | undefined;
    return blob ? URL.createObjectURL(blob) : null;
  } catch { return null; }
}

let initialized = false;
export function initAttachmentFlush(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const handler = () => { if (navigator.onLine) flushAttachmentQueue(); };
  window.addEventListener("online", handler);
  if (navigator.onLine) setTimeout(handler, 2_000);
  setInterval(handler, 45_000);
}

// helper: مسح كل blobs طابور المرفقات (للاختبارات فقط)
export async function _resetAttachmentQueueForTests(): Promise<void> {
  const ks = await keys();
  for (const k of ks) {
    if (String(k).startsWith(BLOB_PREFIX)) await del(k);
  }
  await del(QUEUE_KEY);
  cache = []; loaded = false;
}
