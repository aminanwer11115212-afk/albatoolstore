// storageManager — سياسة تنظيف IndexedDB والكاش
// TTL دوري + سقف حجم + Whitelist للبيانات الأساسية.
import { get, set, del, keys } from "idb-keyval";
import type { QueryClient } from "@tanstack/react-query";

const LAST_PURGE_KEY = "albatool:last-purge:v1";
const STALE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000; // 14 يوماً
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000; // كل 6 ساعات
const QUOTA_WARN = 0.75;
const QUOTA_PANIC = 0.9;

/** بيانات لا تُمسح أبداً — نفس مفاتيح prefetchCoreData. */
export const CORE_QUERY_KEYS: string[] = [
  "customers", "suppliers", "products-with-details", "accounts",
  "transporters", "packaging_types", "destinations", "product_categories",
  "customer_groups", "warehouses", "currencies", "billing_terms",
  "company_settings",
];

export interface StorageStats {
  usage: number;
  quota: number;
  ratio: number;
}

export async function getStorageStats(): Promise<StorageStats | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    const usage = est.usage || 0;
    const quota = est.quota || 1;
    return { usage, quota, ratio: usage / quota };
  } catch { return null; }
}

function isCoreKey(key: any): boolean {
  const first = Array.isArray(key) ? key[0] : key;
  return typeof first === "string" && CORE_QUERY_KEYS.includes(first);
}

/** يمسح استعلامات لم تُلمس منذ threshold ما لم تكن core. */
export function purgeStaleQueries(qc: QueryClient, thresholdMs = STALE_THRESHOLD_MS): number {
  const now = Date.now();
  let removed = 0;
  const cache = qc.getQueryCache();
  cache.getAll().forEach((q) => {
    const updatedAt = (q.state as any).dataUpdatedAt || 0;
    if (isCoreKey(q.queryKey)) return;
    if (now - updatedAt > thresholdMs) {
      cache.remove(q);
      removed++;
    }
  });
  return removed;
}

/** يمسح مفاتيح idb-keyval إضافية أقدم من الحدّ (attachments/blobs المرفوعة). */
async function purgeOldBlobs(): Promise<number> {
  try {
    const ks = await keys();
    const now = Date.now();
    let removed = 0;
    for (const k of ks) {
      const key = String(k);
      // نطاق attachments: albatool:att-blob:<id>  — الميتاداتا مخزّنة معه
      if (key.startsWith("albatool:att-blob:")) {
        try {
          const meta = await get(key);
          const uploaded = (meta as any)?.uploadedAt;
          const createdAt = (meta as any)?.createdAt || 0;
          if (uploaded && now - createdAt > 24 * 60 * 60 * 1000) {
            await del(key);
            removed++;
          }
        } catch { /* noop */ }
      }
    }
    return removed;
  } catch { return 0; }
}

/** تنظيف كامل — يُشغَّل دورياً + عند تجاوز الحصّة. */
export async function runCleanup(qc: QueryClient, aggressive = false): Promise<{ queries: number; blobs: number }> {
  const threshold = aggressive ? 3 * 24 * 60 * 60 * 1000 : STALE_THRESHOLD_MS;
  const queries = purgeStaleQueries(qc, threshold);
  const blobs = await purgeOldBlobs();
  try { await set(LAST_PURGE_KEY, Date.now()); } catch { /* noop */ }
  return { queries, blobs };
}

/** يُهيّئ الإدارة: cleanup أولي + جدولة دورية + مراقبة الحصّة. */
export function initStorageManager(qc: QueryClient): void {
  if (typeof window === "undefined") return;
  const check = async () => {
    try {
      const last = (await get<number>(LAST_PURGE_KEY)) || 0;
      const stats = await getStorageStats();
      let aggressive = false;
      if (stats && stats.ratio >= QUOTA_PANIC) aggressive = true;
      if (aggressive || Date.now() - last > PURGE_INTERVAL_MS) {
        await runCleanup(qc, aggressive);
      }
      if (stats && stats.ratio >= QUOTA_WARN) {
        window.dispatchEvent(new CustomEvent("albatool:storage-warn", { detail: stats }));
      }
    } catch { /* noop */ }
  };
  setTimeout(check, 4_000);
  setInterval(check, 30 * 60 * 1000); // كل 30 دقيقة
}
