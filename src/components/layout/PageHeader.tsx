import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Header موحّد لكل صفحات النظام بدلاً من بطاقات Gradient المتنافرة.
 * يستخدم Tokens فقط ويقدّم تنسيقاً ثابتاً على الموبايل والديسكتوب.
 *
 * <PageHeader
 *   icon={<Truck />}
 *   title="تقرير الترحيلات"
 *   subtitle="إدارة وفلترة كل ترحيلات الفواتير"
 *   actions={<Button>تحديث</Button>}
 * />
 */
export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  /** لون لمسة جانبية (tokens فقط). الافتراضي primary. */
  accent?: "primary" | "amber" | "emerald" | "violet" | "rose" | "muted";
  className?: string;
}

const ACCENT_MAP: Record<NonNullable<PageHeaderProps["accent"]>, string> = {
  primary: "before:bg-primary",
  amber:   "before:bg-amber-500",
  emerald: "before:bg-emerald-500",
  violet:  "before:bg-violet-500",
  rose:    "before:bg-rose-500",
  muted:   "before:bg-muted-foreground/40",
};

export function PageHeader({
  title, subtitle, icon, actions, accent = "primary", className,
}: PageHeaderProps) {
  return (
    <div
      dir="rtl"
      className={cn(
        // بطاقة موحّدة بحدود وtokens — لا gradient
        "relative bg-card border border-border rounded-xl",
        "px-3 py-3 sm:px-4 sm:py-3.5 mb-3 sm:mb-4",
        // لمسة جانبية اختيارية
        "before:content-[''] before:absolute before:top-3 before:bottom-3 before:right-0",
        "before:w-1 before:rounded-l before:opacity-90",
        ACCENT_MAP[accent],
        className,
      )}
    >
      <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 pr-2">
          {icon && (
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-foreground leading-tight truncate">{title}</h1>
            {subtitle && (
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-snug truncate">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export default PageHeader;
