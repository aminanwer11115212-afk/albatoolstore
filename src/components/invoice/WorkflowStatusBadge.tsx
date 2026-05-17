import { useEffect, useState } from "react";
import { Check, FilePlus, Package, PackageCheck, Truck, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type WorkflowStatus = "new" | "preparing" | "ready_to_ship" | "in_transit" | "done";

export const WORKFLOW_STATUSES: { value: WorkflowStatus; label: string; icon: any; color: string; bg: string }[] = [
  { value: "new",            label: "مقبول",                icon: FilePlus,    color: "text-gray-700",   bg: "bg-gray-100 border-gray-300" },
  { value: "preparing",      label: "قيد التجهيز",          icon: Package,     color: "text-yellow-700", bg: "bg-yellow-100 border-yellow-300" },
  { value: "ready_to_ship",  label: "جاهز للرفع",           icon: PackageCheck, color: "text-orange-700", bg: "bg-orange-100 border-orange-300" },
  { value: "in_transit",     label: "في الطريق للترحيلات",  icon: Truck,       color: "text-purple-700", bg: "bg-purple-100 border-purple-300" },
  { value: "done",           label: "تم",                  icon: Check,       color: "text-green-700",  bg: "bg-green-100 border-green-300" },
];

export const getWorkflowStatus = (status?: string | null) => {
  const normalized =
    status === "quote" || status === "ready" || status === "on_hold" || status === "cancelled" || !status
      ? "new"
      : status;
  return WORKFLOW_STATUSES.find(s => s.value === normalized) || WORKFLOW_STATUSES[0];
};

interface AutoInfo {
  from?: string;
  to?: string;
  reason?: string;
  at?: string;
}

// ============ Module-level cache + batched loader ============
// Reduces queries when rendering many badges (invoice list).
const CACHE_TTL_MS = 60_000;
type CacheEntry = { value: AutoInfo | null; at: number };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<AutoInfo | null>>();
const subscribers = new Map<string, Set<(v: AutoInfo | null) => void>>();

let pendingIds = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DELAY_MS = 30;
const BATCH_SIZE = 200;

function notify(id: string, value: AutoInfo | null) {
  cache.set(id, { value, at: Date.now() });
  const subs = subscribers.get(id);
  if (subs) subs.forEach((cb) => cb(value));
}

async function flushBatch() {
  flushTimer = null;
  const ids = Array.from(pendingIds);
  pendingIds = new Set();
  if (ids.length === 0) return;

  // chunk to avoid massive IN clauses
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("invoice_revisions")
      .select("invoice_id, note, changes, created_at")
      .in("invoice_id", chunk)
      .eq("action", "auto_workflow")
      .order("created_at", { ascending: false });

    const latest = new Map<string, AutoInfo>();
    if (!error && data) {
      for (const row of data as any[]) {
        if (latest.has(row.invoice_id)) continue; // first per id is latest (desc order)
        const ch = row.changes || {};
        latest.set(row.invoice_id, {
          from: ch.from,
          to: ch.to,
          reason: ch.reason || row.note || undefined,
          at: row.created_at,
        });
      }
    }
    for (const id of chunk) {
      notify(id, latest.get(id) ?? null);
    }
  }
}

function scheduleFetch(id: string) {
  pendingIds.add(id);
  if (flushTimer == null) {
    flushTimer = setTimeout(flushBatch, FLUSH_DELAY_MS);
  }
}

function getAutoInfo(id: string, cb: (v: AutoInfo | null) => void): () => void {
  // serve from cache if fresh
  const cached = cache.get(id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    cb(cached.value);
  } else {
    let subs = subscribers.get(id);
    if (!subs) {
      subs = new Set();
      subscribers.set(id, subs);
    }
    subs.add(cb);
    scheduleFetch(id);
  }
  return () => {
    const subs = subscribers.get(id);
    if (subs) {
      subs.delete(cb);
      if (subs.size === 0) subscribers.delete(id);
    }
  };
}

/** Invalidate cached auto-workflow info (call after a status change). */
export function invalidateWorkflowAutoCache(invoiceId?: string) {
  if (invoiceId) cache.delete(invoiceId);
  else cache.clear();
}

interface Props {
  status?: string | null;
  size?: "sm" | "md";
  /** إذا مرّرت معرّف الفاتورة، الـ Badge يجلب آخر تحويل أوتوماتيكي ويعرض سببه في tooltip */
  invoiceId?: string;
}

export default function WorkflowStatusBadge({ status, size = "sm", invoiceId }: Props) {
  const s = getWorkflowStatus(status);
  const Icon = s.icon;
  const sizeCls = size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1";

  const [auto, setAuto] = useState<AutoInfo | null>(() => {
    if (!invoiceId) return null;
    const c = cache.get(invoiceId);
    return c ? c.value : null;
  });

  useEffect(() => {
    if (!invoiceId) { setAuto(null); return; }
    const unsubscribe = getAutoInfo(invoiceId, (v) => {
      // only show if matches current status
      if (v && v.to === s.value) setAuto(v);
      else setAuto(null);
    });
    return unsubscribe;
  }, [invoiceId, s.value, status]);

  const badge = (
    <span className={`inline-flex items-center gap-1 rounded-full border font-medium ${s.bg} ${s.color} ${sizeCls}`}>
      <Icon className="w-3 h-3" />
      {s.label}
      {auto && <Zap className="w-3 h-3 text-amber-600" aria-label="تم التحويل تلقائياً" />}
    </span>
  );

  if (!auto) return badge;

  const fromLabel = auto.from ? getWorkflowStatus(auto.from).label : "—";
  const toLabel = auto.to ? getWorkflowStatus(auto.to).label : s.label;
  const when = auto.at ? new Date(auto.at).toLocaleString("ar") : "";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">{badge}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-right">
          <div className="font-semibold flex items-center gap-1 mb-1">
            <Zap className="w-3 h-3 text-amber-500" />
            تحويل تلقائي
          </div>
          <div className="text-xs">
            من <b>{fromLabel}</b> إلى <b>{toLabel}</b>
          </div>
          {auto.reason && <div className="text-xs mt-1">السبب: {auto.reason}</div>}
          {when && <div className="text-[10px] opacity-70 mt-1">{when}</div>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
