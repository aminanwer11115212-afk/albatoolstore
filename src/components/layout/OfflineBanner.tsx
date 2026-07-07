import { CloudOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * OfflineBanner — شريط أعلى الصفحة يظهر فقط عند انقطاع الاتصال.
 * يوضّح للمستخدم أن النظام يعمل أوفلاين وأن التعديلات ستُرفَع تلقائياً لاحقاً.
 */
export default function OfflineBanner() {
  const { online, pendingCount } = useOnlineStatus();
  if (online) return null;
  return (
    <div className="w-full bg-destructive text-destructive-foreground text-xs sm:text-sm px-3 py-2 flex items-center justify-center gap-2 font-semibold sticky top-0 z-[60] shadow-md">
      <CloudOff size={14} />
      <span>أنت غير متصل بالإنترنت — النظام يعمل أوفلاين</span>
      {pendingCount > 0 && (
        <span className="bg-white/20 rounded px-2 py-0.5 text-[11px]">
          {pendingCount} عملية بانتظار المزامنة
        </span>
      )}
    </div>
  );
}
