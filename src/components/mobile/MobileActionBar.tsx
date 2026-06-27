import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * شريط أكشن سفلي لاصق يظهر فقط على شاشات الموبايل (≤640px).
 * يستخدم Tokens فقط، يحترم RTL، ويترك مساحة آمنة سفلية (safe-area-inset-bottom).
 *
 * طريقة الاستخدام:
 *   <MobileActionBar>
 *     <Button>إضافة فاتورة</Button>
 *     <Button variant="outline">تصدير</Button>
 *   </MobileActionBar>
 *
 * الصفحات التي تستخدمه يجب أن تضيف padding سفلي لجسم المحتوى (~72px)
 * عبر className="pb-[72px] sm:pb-0" حتى لا يغطّي الشريط آخر صف.
 */
export interface MobileActionBarProps {
  children: ReactNode;
  className?: string;
  /** عند true يظهر فاصل علوي خفيف بدلاً من ظل. */
  flat?: boolean;
}

export function MobileActionBar({ children, className, flat }: MobileActionBarProps) {
  return (
    <div
      dir="rtl"
      className={cn(
        // يظهر فقط على الموبايل
        "sm:hidden",
        // التمركز السفلي اللاصق
        "fixed inset-x-0 bottom-0 z-40",
        // الخلفية والحدود (tokens فقط)
        "bg-card/95 backdrop-blur-md border-t border-border",
        flat ? "" : "shadow-[0_-6px_18px_-12px_hsl(var(--foreground)/0.18)]",
        // المسافة الآمنة على iOS
        "pb-[max(8px,env(safe-area-inset-bottom))] pt-2 px-3",
        className,
      )}
      role="toolbar"
      aria-label="شريط الإجراءات السفلي"
    >
      <div className="flex items-center gap-2 [&>*]:flex-1 [&>button]:min-h-[44px] [&>a]:min-h-[44px]">
        {children}
      </div>
    </div>
  );
}

export default MobileActionBar;
