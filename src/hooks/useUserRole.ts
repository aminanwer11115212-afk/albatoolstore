import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "admin" | "sales" | "viewer";

export interface StaffPermissions {
  create_invoice?: boolean;
  create_quote?: boolean;
  add_customer?: boolean;
  view_customers?: boolean;
  view_products?: boolean;
  /** تسجيل مبلغ عام في نافذة الدفعة (خارج المتبقي) */
  record_payment?: boolean;
  /** تطبيق خصم إضافي أثناء تسجيل الدفعة */
  apply_discount?: boolean;
}

/**
 * Cached user role lookup. Was previously fetched on every component mount
 * (>1700 DB calls per session) — now cached via React Query with a long
 * staleTime since roles rarely change within a session.
 */
export function useUserRole() {
  const { user, loading: authLoading } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["user-role", user?.id],
    enabled: !!user && !authLoading,
    staleTime: 5 * 60 * 1000, // 5 دقائق — الأدوار نادراً ما تتغير في الجلسة
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role, permissions")
        .eq("user_id", user!.id)
        .order("role", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data
        ? {
            role: data.role as AppRole,
            permissions: (data.permissions || {}) as StaffPermissions,
          }
        : { role: null as AppRole | null, permissions: {} as StaffPermissions };
    },
  });

  const role = data?.role ?? null;
  const permissions = data?.permissions ?? {};

  return {
    role,
    permissions,
    loading: (isLoading && !!user) || authLoading,
    isAdmin: role === "admin",
    isStaff: role === "sales" || role === "viewer",
  };
}
