import { memo } from "react";

interface PageLoaderProps {
  label?: string;
}

/**
 * Fallback مخصّص للصفحات الكسولة (lazy) داخل React.Suspense.
 * يعرض spinner + نص تحميل اختياري باسم الصفحة.
 */
function PageLoaderInner({ label }: PageLoaderProps) {
  return (
    <div
      className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      <p className="text-sm">
        {label ? `جاري تحميل ${label}...` : "جاري التحميل..."}
      </p>
    </div>
  );
}

const PageLoader = memo(PageLoaderInner);
export default PageLoader;

/**
 * مساعد لتغليف عنصر JSX داخل Suspense مع fallback مخصّص.
 * استخدام: lazyEl(<MyPage />, "اسم الصفحة")
 */
import { Suspense, type ReactNode } from "react";
export function lazyEl(node: ReactNode, label: string) {
  return <Suspense fallback={<PageLoader label={label} />}>{node}</Suspense>;
}
