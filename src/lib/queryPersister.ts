// Persister for React Query cache using IndexedDB (idb-keyval).
// يجعل كل استعلامات React Query متاحة أوفلاين — يقرأ من التخزين المحلي أول
// mount قبل الاتصال بالشبكة. عند العودة للاتصال يعيد التحقّق تلقائياً
// (refetchOnReconnect مفعّل في queryClient).
import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const CACHE_KEY = "albatool:rq-cache:v1";

export function createIDBPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await set(CACHE_KEY, client);
      } catch (e) {
        // Quota / private-mode: نتجاهل بصمت
        // eslint-disable-next-line no-console
        console.warn("[queryPersister] persist failed", e);
      }
    },
    restoreClient: async () => {
      try {
        return (await get<PersistedClient>(CACHE_KEY)) ?? undefined;
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await del(CACHE_KEY);
      } catch {
        /* noop */
      }
    },
  };
}
