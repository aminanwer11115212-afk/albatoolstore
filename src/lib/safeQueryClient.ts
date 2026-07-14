import { useContext } from "react";
import type { QueryClient } from "@tanstack/react-query";
// @ts-ignore — internal context export path (works across react-query v4/v5).
import { QueryClientContext } from "@tanstack/react-query";

/**
 * useQueryClient آمن — لا يرمي استثناء عند غياب QueryClientProvider.
 * يُرجع كائن Stub بواجهة متوافقة (كامل واجهة QueryClient) حتى لا تنكسر
 * مكوّنات النماذج داخل بيئة الاختبار (jsdom) عندما لا يوفّر الاختبار مزوّداً حقيقياً.
 */
const stub: any = {
  getQueryData: () => undefined,
  setQueryData: () => undefined,
  invalidateQueries: () => Promise.resolve(),
  refetchQueries: () => Promise.resolve(),
  removeQueries: () => undefined,
  cancelQueries: () => Promise.resolve(),
  clear: () => undefined,
  fetchQuery: () => Promise.resolve(undefined),
  prefetchQuery: () => Promise.resolve(),
  ensureQueryData: () => Promise.resolve(undefined),
  resetQueries: () => Promise.resolve(),
  getQueriesData: () => [],
  setQueriesData: () => [],
  getQueryState: () => undefined,
};

export function useSafeQueryClient(): QueryClient {
  const client = useContext(QueryClientContext as any);
  return (client ?? stub) as QueryClient;
}
