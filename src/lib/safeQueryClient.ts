import { useContext } from "react";
// @ts-ignore — private export path is stable across react-query v4/v5.
import { QueryClientContext } from "@tanstack/react-query";

/**
 * useQueryClient آمن — لا يرمي استثناء عند غياب QueryClientProvider.
 * يُرجع كائن Stub بواجهة متوافقة حتى لا تنكسر مكوّنات النماذج داخل بيئة
 * الاختبار (jsdom) عندما لا يوفّر الاختبار مزوّداً حقيقياً.
 */
export function useSafeQueryClient(): any {
  const client = useContext(QueryClientContext as any);
  if (client) return client;
  return {
    getQueryData: () => undefined,
    setQueryData: () => undefined,
    invalidateQueries: () => Promise.resolve(),
    refetchQueries: () => Promise.resolve(),
    removeQueries: () => undefined,
    cancelQueries: () => Promise.resolve(),
    clear: () => undefined,
  };
}
