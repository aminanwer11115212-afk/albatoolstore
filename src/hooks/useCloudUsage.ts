import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const CACHE_KEY = "cloudUsageStatsV1";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface TableStat { table_name: string; size_bytes: number; row_estimate: number; }
export interface UsageStats {
  db_size_bytes: number;
  tables: TableStat[];
  total_rows: number;
  storage_bytes: number;
  storage_count: number;
  invoices_last_30d: number;
  invoices_last_7d: { day: string; count: number }[];
  measured_at: string;
}

export const LIMITS = {
  db_size_bytes:  8 * 1024 * 1024 * 1024,   // 8 GB
  storage_bytes: 100 * 1024 * 1024 * 1024,  // 100 GB
  api_requests_monthly: 5_000_000,
};

export function pct(used: number, limit: number) {
  if (!limit) return 0;
  return Math.min(100, (used / limit) * 100);
}

export function severity(p: number): "ok" | "warn" | "crit" {
  if (p >= 95) return "crit";
  if (p >= 80) return "warn";
  return "ok";
}

export function useCloudUsage(autoLoad = true) {
  const [data, setData] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await (supabase as any).rpc("get_cloud_usage_stats");
      if (err) throw err;
      const stats = res as UsageStats;
      setData(stats);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), stats }));
      } catch {/* quota */}
      return stats;
    } catch (e: any) {
      setError(e?.message || "تعذّر جلب بيانات الاستهلاك");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const load = useCallback(async (force = false) => {
    if (!force) {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const { ts, stats } = JSON.parse(raw);
          if (Date.now() - ts < CACHE_TTL_MS && stats) {
            setData(stats);
            return stats;
          }
        }
      } catch {/* ignore */}
    }
    return fetchFresh();
  }, [fetchFresh]);

  useEffect(() => {
    if (autoLoad) load(false);
  }, [autoLoad, load]);

  return { data, loading, error, refresh: () => load(true), load };
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)} ${units[i]}`;
}
