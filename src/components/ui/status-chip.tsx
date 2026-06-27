import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * شارة حالة موحّدة عبر النظام — تستخدم Tokens فقط ولا hardcoded colors.
 * توحّد ظهور حالات الدفع وحالة سير العمل في كل الصفحات (Dashboard، إدارة الفواتير،
 * عروض الأسعار، عرض الفاتورة...). تحترم RTL وحجمها متناسق على الموبايل (~24px).
 */

type PaymentValue = "paid" | "partial" | "unpaid" | "pending" | "overdue" | "cancelled";
type WorkflowValue = "new" | "preparing" | "ready_to_ship" | "in_transit" | "done";
type QuoteValue = "draft" | "sent" | "accepted" | "rejected";

export interface StatusChipProps {
  kind: "payment" | "workflow" | "quote" | "custom";
  value?: PaymentValue | WorkflowValue | QuoteValue | string;
  /** نص مخصص يعرض داخل الشارة (يتجاوز خريطة الترجمة الافتراضية). */
  label?: ReactNode;
  /** أيقونة اختيارية قبل النص. */
  icon?: ReactNode;
  /** حجم الشارة. */
  size?: "sm" | "md";
  /** عدد لاحق بين قوسين (مثلاً 5 → "(5)"). */
  count?: number;
  className?: string;
}

const PAYMENT_MAP: Record<string, { label: string; tone: string }> = {
  paid:      { label: "مدفوعة",       tone: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30" },
  partial:   { label: "مدفوعة جزئياً", tone: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30" },
  unpaid:    { label: "غير مدفوعة",   tone: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30" },
  pending:   { label: "معلّقة",        tone: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30" },
  overdue:   { label: "متأخرة",        tone: "bg-rose-200 text-rose-900 border-rose-300 dark:bg-rose-500/25 dark:text-rose-200 dark:border-rose-500/40" },
  cancelled: { label: "ملغاة",         tone: "bg-muted text-muted-foreground border-border" },
};

const WORKFLOW_MAP: Record<string, { label: string; tone: string }> = {
  new:           { label: "جديد",                 tone: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30" },
  preparing:     { label: "قيد التجهيز",          tone: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30" },
  ready_to_ship: { label: "جاهز للرفع",           tone: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30" },
  in_transit:    { label: "في الطريق للترحيلات", tone: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30" },
  done:          { label: "تم",                    tone: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30" },
};

const QUOTE_MAP: Record<string, { label: string; tone: string }> = {
  draft:    { label: "مسودة", tone: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30" },
  sent:     { label: "مرسل",  tone: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30" },
  accepted: { label: "مقبول", tone: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30" },
  rejected: { label: "مرفوض", tone: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30" },
};

export function StatusChip({ kind, value, label, icon, size = "sm", count, className }: StatusChipProps) {
  const key = String(value ?? "").toLowerCase();
  const map = kind === "payment" ? PAYMENT_MAP : kind === "workflow" ? WORKFLOW_MAP : kind === "quote" ? QUOTE_MAP : null;
  const entry = map?.[key];
  const finalLabel = label ?? entry?.label ?? value ?? "—";
  const tone = entry?.tone ?? "bg-muted text-muted-foreground border-border";

  const sizeCls =
    size === "md"
      ? "h-7 px-2.5 text-[12px] gap-1.5"
      : "h-6 px-2 text-[11px] gap-1";

  return (
    <span
      dir="rtl"
      className={cn(
        "inline-flex items-center justify-center rounded-full border font-semibold whitespace-nowrap leading-none select-none",
        sizeCls,
        tone,
        className,
      )}
    >
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      <span className="truncate">{finalLabel}</span>
      {typeof count === "number" && <span className="opacity-70">({count})</span>}
    </span>
  );
}

export default StatusChip;
