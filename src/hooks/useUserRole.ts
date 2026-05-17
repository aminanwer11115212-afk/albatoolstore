import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "admin" | "sales" | "viewer";

export interface StaffPermissions {
  create_invoice?: boolean;
  create_quote?: boolean;
  add_customer?: boolean;
  view_customers?: boolean;
  view_products?: boolean;
}

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<StaffPermissions>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setRole(null); setPermissions({}); setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role, permissions")
        .eq("user_id", user.id)
        .order("role", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data) {
        setRole(data.role as AppRole);
        setPermissions((data.permissions || {}) as StaffPermissions);
      } else {
        setRole(null);
      }
      setLoading(false);
    })();
  }, [user, authLoading]);

  return {
    role,
    permissions,
    loading: loading || authLoading,
    isAdmin: role === "admin",
    isStaff: role === "sales" || role === "viewer",
  };
}
