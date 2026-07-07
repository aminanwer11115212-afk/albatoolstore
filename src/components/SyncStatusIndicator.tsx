import { useEffect, useState } from "react";
import { subscribeSyncState, type SyncState } from "@/lib/realtimeSync";
import { toast } from "sonner";
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * مؤشر حالة المزامنة اللحظية (Realtime).
 * - أخضر: متصل بالكامل.
 * - أصفر: مزامنة جزئية (بعض الجداول منقطعة، بولّينج احتياطي شغّال).
 * - أحمر: غير متصل.
 * يعرض إشعار للمستخدم عند تدهور الاتصال أو استعادته، مع معرّف الطلب لتتبّع الأخطاء.
 */
export default function SyncStatusIndicator() {
  const [state, setState] = useState<SyncState | null>(null);
  const [lastNotifiedStatus, setLastNotifiedStatus] = useState<string | null>(null);

  useEffect(() => subscribeSyncState(setState), []);

  useEffect(() => {
    if (!state) return;
    if (state.status === lastNotifiedStatus) return;
    // تجاهل أول إعلان لتفادي toast عند التحميل
    if (lastNotifiedStatus === null) {
      setLastNotifiedStatus(state.status);
      return;
    }
    if (state.status === "degraded") {
      toast.warning("مزامنة جزئية — بعض التحديثات قد تتأخر", {
        description: state.lastRequestId ? `المعرّف: ${state.lastRequestId}` : undefined,
      });
    } else if (state.status === "offline") {
      toast.error("انقطعت مزامنة التحديثات اللحظية", {
        description: state.lastError || "سيتم إعادة المحاولة تلقائيًا",
      });
    } else if (state.status === "live" && (lastNotifiedStatus === "degraded" || lastNotifiedStatus === "offline")) {
      toast.success("عادت المزامنة اللحظية");
    }
    setLastNotifiedStatus(state.status);
  }, [state, lastNotifiedStatus]);

  if (!state) return null;

  const label =
    state.status === "live" ? "متصل" :
    state.status === "degraded" ? `جزئي ${state.connectedTables}/${state.totalTables}` :
    state.status === "connecting" ? "جارٍ الاتصال" : "غير متصل";

  const Icon =
    state.status === "live" ? Wifi :
    state.status === "degraded" ? AlertTriangle :
    state.status === "connecting" ? RefreshCw : WifiOff;

  const color =
    state.status === "live" ? "text-emerald-600" :
    state.status === "degraded" ? "text-amber-600" :
    state.status === "connecting" ? "text-muted-foreground" : "text-destructive";

  const title = [
    `الحالة: ${label}`,
    state.lastEventAt ? `آخر تحديث: ${new Date(state.lastEventAt).toLocaleTimeString("ar")}` : null,
    state.lastPollAt ? `آخر فحص احتياطي: ${new Date(state.lastPollAt).toLocaleTimeString("ar")}` : null,
    state.lastRequestId ? `معرّف آخر عملية: ${state.lastRequestId}` : null,
    state.lastError ? `آخر خطأ: ${state.lastError}` : null,
  ].filter(Boolean).join("\n");

  return (
    <div
      className={cn("inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border/50", color)}
      title={title}
      data-testid="sync-status"
      data-sync-status={state.status}
      data-sync-connected={state.connectedTables}
      data-sync-total={state.totalTables}
      data-sync-request-id={state.lastRequestId ?? ""}
    >
      <Icon className={cn("h-3.5 w-3.5", state.status === "connecting" && "animate-spin")} />
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}
