import { Cloud, CloudOff, CloudUpload } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * SyncStatusIndicator — مؤشر بسيط لحالة الاتصال/المزامنة يُستخدم داخل الشريط العلوي.
 * - أوفلاين: CloudOff بلون destructive.
 * - أونلاين مع عمليات معلّقة: CloudUpload + Badge بالعدد.
 * - أونلاين بدون معلّق: Cloud صغيرة بلون muted-foreground.
 */
export default function SyncStatusIndicator() {
  const { online, pendingCount } = useOnlineStatus();

  const label = !online
    ? "أنت غير متصل — سيتم حفظ التغييرات محلياً ومزامنتها لاحقاً"
    : pendingCount > 0
      ? `متصل — ${pendingCount} عملية بانتظار المزامنة`
      : "متصل ومتزامن بالكامل";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            dir="rtl"
            data-testid="sync-status-indicator"
            data-online={online}
            data-pending-count={pendingCount}
            className="relative flex items-center justify-center p-1.5 rounded-md text-muted-foreground"
          >
            {!online ? (
              <CloudOff className="h-4 w-4 text-destructive" aria-label="غير متصل" />
            ) : pendingCount > 0 ? (
              <>
                <CloudUpload className="h-4 w-4 text-foreground" aria-label="جارٍ المزامنة" />
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -left-1 h-4 min-w-[16px] px-1 text-[10px] leading-none flex items-center justify-center"
                >
                  {pendingCount > 99 ? "99+" : pendingCount}
                </Badge>
              </>
            ) : (
              <Cloud className="h-3.5 w-3.5 text-muted-foreground" aria-label="متزامن" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" dir="rtl">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
