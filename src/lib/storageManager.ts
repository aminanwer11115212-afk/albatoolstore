// storageManager — سياسة تنظيف IndexedDB والكاش
// TTL دوري + سقف حجم + Whitelist للبيانات الأساسية.
// ⚠️ تخصيصات الواجهة (localStorage) محميّة أبداً عبر PROTECTED_STORAGE_PREFIXES
// وتُنسخ احتياطياً إلى IndexedDB (mirrorProtectedLocalStorage) فتُستعاد لو مُسحت.
import { get, set, del, keys } from "idb-keyval";
import type { QueryClient } from "@tanstack/react-query";

const LAST_PURGE_KEY = "albatool:last-purge:v1";
const STALE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000; // 14 يوماً
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000; // كل 6 ساعات
const QUOTA_WARN = 0.75;
const QUOTA_PANIC = 0.9;
const MIRROR_IDB_PREFIX = "albatool:ls-mirror:";

/** بيانات لا تُمسح أبداً — نفس مفاتيح prefetchCoreData. */
export const CORE_QUERY_KEYS: string[] = [
  "customers", "suppliers", "products-with-details", "accounts",
  "transporters", "packaging_types", "destinations", "product_categories",
  "customer_groups", "warehouses", "currencies", "billing_terms",
  "company_settings",
];

/**
 * بادئات localStorage محميّة من الحذف الآلي — أي كود ينظّف localStorage
 * يجب أن يستدعي isProtectedLocalStorageKey أولاً.
 * تشمل: تخصيصات المستخدم لكل جهاز، أزرار التثبيت، المظهر، عرض الأعمدة.
 */
export const PROTECTED_STORAGE_PREFIXES: readonly string[] = [
  "lov:u:",                    // كل ما هو user + form-factor scoped
  "lov:pinned-",               // تثبيت الحساب/الطريقة (customer + supplier payment dialogs)
  "lov:last-bank-account",     // آخر حساب مستخدم
  "lov:last-account:",         // آخر حساب لكل طريقة دفع
  "lov:finance-health:",       // سجل صحة المالية
  "albatoul_appearance",       // مظهر عام للمستخدم
  "shared:itemsTable:",        // أعمدة/قفل جدول البنود
  "itemsZoom",                 // تكبير البنود
  "__lov_print_visibility__",  // إعدادات ظهور الطباعة
  "neobilling:toolbar-",       // ترتيب/قفل أشرطة الأدوات
  "dlg_size_v2__",             // أحجام الحوارات
];

/** true لو المفتاح يجب أن يبقى إلى الأبد (تخصيص واجهة أو تفضيل مستخدم). */
export function isProtectedLocalStorageKey(key: string): boolean {
  if (!key) return false;
  for (const p of PROTECTED_STORAGE_PREFIXES) {
    if (key === p || key.startsWith(p)) return true;
  }
  return false;
}

/**
 * نسخ احتياطي دوري لمفاتيح localStorage المحميّة إلى IndexedDB.
 * IDB أصلب أمام تنظيف المتصفح عند نقص المساحة، فيوفّر شبكة أمان ثانية.
 */
export async function mirrorProtectedLocalStorageToIDB(): Promise<number> {
  if (typeof localStorage === "undefined") return 0;
  let count = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !isProtectedLocalStorageKey(k)) continue;
      const v = localStorage.getItem(k);
      if (v == null) continue;
      try { await set(MIRROR_IDB_PREFIX + k, v); count++; } catch { /* noop */ }
    }
  } catch { /* noop */ }
  return count;
}

/**
 * استعادة أي مفتاح محميّ من IDB لـ localStorage إن كان مفقوداً.
 * تُشغَّل عند إقلاع التطبيق قبل أي كود يقرأ التفضيلات.
 */
export async function restoreProtectedLocalStorageFromIDB(): Promise<number> {
  if (typeof localStorage === "undefined") return 0;
  let restored = 0;
  try {
    const all = await keys();
    for (const raw of all) {
      const k = String(raw);
      if (!k.startsWith(MIRROR_IDB_PREFIX)) continue;
      const lsKey = k.slice(MIRROR_IDB_PREFIX.length);
      if (localStorage.getItem(lsKey) != null) continue;
      try {
        const v = await get<string>(k);
        if (typeof v === "string") { localStorage.setItem(lsKey, v); restored++; }
      } catch { /* noop */ }
    }
  } catch { /* noop */ }
  return restored;
}

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
