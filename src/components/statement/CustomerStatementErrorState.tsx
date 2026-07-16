import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, RotateCw } from "lucide-react";

/**
 * رسالة موحّدة تُستخدم في كل صفحات كشف الحساب:
 *  - عند عدم العثور على العميل (id غير موجود / محذوف).
 *  - عند فشل جلب بيانات netBalanceOf / قائمة العملاء.
 *
 * تتيح دائماً زر رجوع لـ /customers/statements، وزر "إعادة المحاولة"
 * عند تمرير onRetry.
 */
type Props = {
  title?: string;
  message?: string;
  detail?: string;
  onRetry?: () => void;
};

export default function CustomerStatementErrorState({
  title = "لم يتم العثور على العميل",
  message = "قد يكون تم حذف العميل، أو أن الرابط قديم.",
  detail,
  onRetry,
}: Props) {
  const navigate = useNavigate();
  return (
    <div
      dir="rtl"
      role="alert"
      data-testid="customer-statement-error"
      className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center space-y-3"
    >
      <div className="inline-flex items-center gap-2 text-destructive font-semibold">
        <AlertTriangle size={20} />
        <span>{title}</span>
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {detail && (
        <p className="text-xs text-muted-foreground/80 font-mono break-all">{detail}</p>
      )}
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => navigate("/customers/statements")}
          className="inline-flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm hover:opacity-90"
        >
          <ArrowRight size={14} />
          العودة إلى قائمة العملاء
        </button>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 bg-muted text-foreground px-3 py-1.5 rounded text-sm hover:bg-muted/70 border border-border"
          >
            <RotateCw size={14} />
            إعادة المحاولة
          </button>
        )}
      </div>
    </div>
  );
}
