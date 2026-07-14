import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  subscribeQueue, retryItem, removeItem, flushQueue,
  clearQueue, type QueuedItem, type QueueStatus,
} from "@/lib/offlineQueue";
import { subscribeAttachmentQueue, retryAttachmentItem, removeAttachmentItem, flushAttachmentQueue, type AttachmentItem } from "@/lib/attachmentQueue";
import { subscribeSagas, retrySaga, removeSaga, flushSagas, type SagaEnvelope } from "@/lib/documentSaga";
import { getStorageStats, runCleanup, type StorageStats } from "@/lib/storageManager";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Trash2, PlayCircle, HardDrive } from "lucide-react";

const STATUS_LABELS: Record<QueueStatus, { label: string; cls: string }> = {
  pending: { label: "في الانتظار", cls: "bg-blue-500/10 text-blue-600" },
  in_flight: { label: "قيد التنفيذ", cls: "bg-amber-500/10 text-amber-600" },
  failed_retryable: { label: "فشل — سيُعاد", cls: "bg-orange-500/10 text-orange-600" },
  failed_permanent: { label: "فشل نهائي", cls: "bg-destructive/10 text-destructive" },
  conflict: { label: "تعارض", cls: "bg-purple-500/10 text-purple-600" },
  done: { label: "تم", cls: "bg-emerald-500/10 text-emerald-600" },
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function OfflineQueuePage() {
  const qc = useQueryClient();
  const [items, setItems] = useState<QueuedItem[]>([]);
  const [atts, setAtts] = useState<AttachmentItem[]>([]);
  const [sagas, setSagas] = useState<SagaEnvelope[]>([]);
  const [stats, setStats] = useState<StorageStats | null>(null);

  useEffect(() => {
    const u1 = subscribeQueue(setItems);
    const u2 = subscribeAttachmentQueue(setAtts);
    const u3 = subscribeSagas(setSagas);
    getStorageStats().then(setStats);
    return () => { u1(); u2(); u3(); };
  }, []);

  const refreshStats = async () => setStats(await getStorageStats());

  const flushAll = async () => {
    const [r1, r2, r3] = await Promise.all([flushQueue(), flushAttachmentQueue(), flushSagas()]);
    const ok = r1.ok + r2.ok + r3.ok;
    const failed = r1.failed + r2.failed + r3.failed;
    toast[ok > 0 && failed === 0 ? "success" : failed > 0 ? "error" : "info"](
      `تم ${ok} · فشل ${failed}${(r1 as any).conflicts ? ` · تعارضات ${(r1 as any).conflicts}` : ""}`,
    );
  };

  const cleanup = async () => {
    const r = await runCleanup(qc, false);
    toast.success(`تم حذف ${r.queries} استعلام قديم + ${r.blobs} مرفق منتهي`);
    await refreshStats();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <RefreshCw size={22} /> سجل المزامنة والعمليات المعلَّقة
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            كل عملية تُنفَّذ على السحابة تظهر هنا مع حالتها وسبب أي فشل.
          </p>
        </div>
        <Link
          to="/"
          className="bg-card border border-border px-3 py-2 rounded-lg text-sm flex items-center gap-1 hover:bg-muted"
        >
          <ArrowLeft size={16} /> رجوع
        </Link>
      </div>

      {/* Storage stats */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold flex items-center gap-2"><HardDrive size={16} /> استخدام التخزين المحلي</h2>
          <div className="flex gap-2">
            <button onClick={cleanup} className="bg-muted border border-border px-3 py-1.5 rounded text-xs hover:bg-accent">
              تنظيف الكاش القديم
            </button>
            <button onClick={refreshStats} className="bg-muted border border-border px-3 py-1.5 rounded text-xs hover:bg-accent">
              <RefreshCw size={14} className="inline" /> تحديث
            </button>
          </div>
        </div>
        {stats ? (
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>{formatBytes(stats.usage)} من {formatBytes(stats.quota)}</span>
              <span className={stats.ratio > 0.9 ? "text-destructive font-bold" : stats.ratio > 0.75 ? "text-amber-600" : "text-muted-foreground"}>
                {(stats.ratio * 100).toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-2 bg-muted rounded overflow-hidden">
              <div
                className={`h-full ${stats.ratio > 0.9 ? "bg-destructive" : stats.ratio > 0.75 ? "bg-amber-500" : "bg-primary"}`}
                style={{ width: `${Math.min(100, stats.ratio * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">غير مدعوم في هذا المتصفح</p>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={flushAll} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:opacity-90">
          <PlayCircle size={16} /> مزامنة الكل الآن
        </button>
      </div>

      {/* Sagas */}
      <QueueSection
        title="مستندات معلَّقة (فواتير/عروض/مشتريات)"
        emptyMsg="لا توجد مستندات معلَّقة"
        rows={sagas.map((s) => ({
          id: s.id,
          label: `${s.label || s.kind} — ${s.operations.length} عملية`,
          status: s.status as QueueStatus,
          attempts: s.attempts,
          lastError: s.lastError,
          createdAt: s.createdAt,
          onRetry: () => retrySaga(s.id),
          onDelete: () => removeSaga(s.id),
        }))}
      />

      {/* Attachments */}
      <QueueSection
        title="مرفقات معلَّقة"
        emptyMsg="لا توجد مرفقات معلَّقة"
        rows={atts.map((a) => ({
          id: a.id,
          label: `${a.label || a.linkTable} — ${a.fileName} (${formatBytes(a.size)})`,
          status: a.status === "uploading" || a.status === "linking" ? "in_flight" : (a.status as QueueStatus),
          attempts: a.attempts,
          lastError: a.lastError,
          createdAt: a.createdAt,
          onRetry: () => retryAttachmentItem(a.id),
          onDelete: () => removeAttachmentItem(a.id),
        }))}
      />

      {/* Simple ops */}
      <QueueSection
        title="عمليات بسيطة (إضافة/تعديل/حذف)"
        emptyMsg="لا توجد عمليات معلَّقة"
        rows={items.map((it) => ({
          id: it.id,
          label: `${it.label || `${it.op} ${it.table}`}`,
          status: it.status,
          attempts: it.attempts,
          lastError: it.lastError,
          createdAt: it.createdAt,
          onRetry: () => retryItem(it.id),
          onDelete: () => removeItem(it.id),
        }))}
      />

      {items.length > 0 && (
        <div className="text-center">
          <button
            onClick={async () => { await clearQueue(); toast.success("تم مسح الطابور"); }}
            className="text-xs text-destructive underline"
          >
            مسح كل الطابور (خطر — بدون رجعة)
          </button>
        </div>
      )}
    </div>
  );
}

interface Row {
  id: string;
  label: string;
  status: QueueStatus;
  attempts: number;
  lastError?: string;
  createdAt: number;
  onRetry: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}

function QueueSection({ title, rows, emptyMsg }: { title: string; rows: Row[]; emptyMsg: string }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{emptyMsg}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-xs text-muted-foreground">
                <th className="text-right px-4 py-2">العملية</th>
                <th className="text-right px-4 py-2">الحالة</th>
                <th className="text-right px-4 py-2">محاولات</th>
                <th className="text-right px-4 py-2">آخر خطأ</th>
                <th className="text-right px-4 py-2">التاريخ</th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = STATUS_LABELS[r.status] || STATUS_LABELS.pending;
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{r.label}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-1 rounded ${s.cls}`}>{s.label}</span>
                    </td>
                    <td className="px-4 py-2 tabular-nums">{r.attempts}</td>
                    <td className="px-4 py-2 text-xs text-destructive max-w-[240px] truncate" title={r.lastError}>
                      {r.lastError || "-"}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 flex gap-1 justify-end">
                      <button onClick={() => r.onRetry()} title="إعادة المحاولة"
                        className="p-1 rounded hover:bg-muted text-primary">
                        <RefreshCw size={14} />
                      </button>
                      <button onClick={() => r.onDelete()} title="حذف"
                        className="p-1 rounded hover:bg-muted text-destructive">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
