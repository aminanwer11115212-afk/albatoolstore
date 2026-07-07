import { useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, Loader2, RefreshCw, Trash2, CheckCircle2 } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { flushQueue, removeItem, clearQueue } from "@/lib/offlineQueue";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * SyncStatusIndicator — أيقونة في شريط الأدوات تعرض حالة الاتصال وعدد
 * العمليات المؤجلة. عند الضغط تفتح قائمة بالتفاصيل + زر مزامنة الآن.
 */
export default function SyncStatusIndicator() {
  const { online, pending, pendingCount } = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const [flushing, setFlushing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const doSync = async () => {
    if (!online) {
      toast.error("لا يوجد اتصال بالإنترنت");
      return;
    }
    setFlushing(true);
    try {
      const r = await flushQueue();
      if (r.ok > 0) {
        toast.success(`تمت مزامنة ${r.ok} عملية`);
        // ننعش الاستعلامات لعرض أحدث بيانات
        qc.invalidateQueries();
      }
      if (r.failed > 0) toast.error(`فشل ${r.failed} عملية — سيُعاد تجربتها لاحقاً`);
      if (r.ok === 0 && r.failed === 0) toast.info("لا توجد عمليات مؤجلة");
    } finally {
      setFlushing(false);
    }
  };

  const color = !online
    ? "text-destructive"
    : pendingCount > 0
      ? "text-amber-500"
      : "text-emerald-500";

  const title = !online
    ? "غير متصل — يعمل أوفلاين"
    : pendingCount > 0
      ? `متصل — ${pendingCount} عملية بانتظار المزامنة`
      : "متصل ومتزامن";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={title}
        className="relative p-1.5 hover:bg-primary/20 rounded-md transition-colors flex items-center"
      >
        {flushing ? (
          <Loader2 size={15} className={`${color} animate-spin`} />
        ) : online ? (
          <Cloud size={15} className={color} />
        ) : (
          <CloudOff size={15} className={color} />
        )}
        {pendingCount > 0 && (
          <span className="absolute -top-1 -left-1 min-w-[16px] h-4 px-1 bg-amber-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
            {pendingCount > 99 ? "99+" : pendingCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-12 bg-card border border-border rounded-xl shadow-2xl w-80 z-50 animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              {online ? (
                <CheckCircle2 size={16} className="text-emerald-500" />
              ) : (
                <CloudOff size={16} className="text-destructive" />
              )}
              <h3 className="font-semibold text-sm text-foreground">
                {online ? "متصل بالإنترنت" : "أوفلاين"}
              </h3>
            </div>
            <button
              onClick={doSync}
              disabled={!online || flushing || pendingCount === 0}
              className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-40 flex items-center gap-1"
            >
              {flushing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              مزامنة الآن
            </button>
          </div>

          <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border">
            {online
              ? pendingCount === 0
                ? "كل البيانات محدثة على السحابة."
                : `${pendingCount} عملية بانتظار الرفع.`
              : "التعديلات ستُخزَّن محلياً وتُرفَع تلقائياً عند عودة الاتصال."}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {pending.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                لا توجد عمليات مؤجلة.
              </div>
            ) : (
              pending.map((it) => (
                <div key={it.id} className="px-4 py-2 border-b border-border/50 flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate">
                      {it.label || `${it.op} · ${it.table}`}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(it.createdAt).toLocaleString("ar-EG")}
                      {it.retries > 0 && ` · محاولات: ${it.retries}`}
                    </div>
                    {it.lastError && (
                      <div className="text-[10px] text-destructive truncate mt-0.5" title={it.lastError}>
                        {it.lastError}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem(it.id)}
                    className="text-destructive p-1 hover:bg-destructive/10 rounded"
                    title="حذف من الطابور"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>

          {pending.length > 0 && (
            <div className="px-4 py-2 border-t border-border">
              <button
                onClick={() => {
                  if (confirm("حذف كل العمليات المؤجلة؟ لن يمكن استرجاعها.")) clearQueue();
                }}
                className="text-[11px] text-destructive hover:underline"
              >
                حذف كل الطابور
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
