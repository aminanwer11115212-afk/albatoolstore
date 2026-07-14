import { useEffect, useRef } from "react";
import { useSafeQueryClient as useQueryClient } from "@/lib/safeQueryClient";

/**
 * Listens to the global `products:changed` event and invalidates only
 * ACTIVE product-related queries (mounted screens), with a short debounce
 * to coalesce bursts of events (e.g. multi-line invoice save).
 *
 * Why `refetchType: "active"`:
 *   تجنّب إعادة جلب الكاش لصفحات مغلقة → كان يُسبّب ثقلاً ملحوظاً عند
 *   حفظ فاتورة بـ 10 صفوف (30 invalidate × N شاشة).
 */
export default function ProductsCacheSync() {
  const queryClient = useQueryClient();
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const flush = () => {
      const opts = { refetchType: "active" as const };
      queryClient.invalidateQueries({ queryKey: ["products"], ...opts });
      queryClient.invalidateQueries({ queryKey: ["products-with-details"], ...opts });
      queryClient.invalidateQueries({ queryKey: ["low-stock-products"], ...opts });
    };
    const handler = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 150);
    };
    window.addEventListener("products:changed", handler);
    return () => {
      window.removeEventListener("products:changed", handler);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [queryClient]);

  return null;
}
