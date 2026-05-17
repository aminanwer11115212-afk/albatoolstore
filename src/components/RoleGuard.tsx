import { ReactNode, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUserRole, StaffPermissions } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";

/**
 * Redirects:
 * - non-admins trying to open admin routes → /staff
 * - admins on /staff routes are allowed (they can preview)
 */
export function StaffGuard({ children }: { children: ReactNode }) {
  const { user, loading: aL } = useAuth();
  const { role, loading: rL } = useUserRole();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (aL || rL) return;
    if (!user) return;
    const onStaff = pathname.startsWith("/staff");
    const onPublicShare = pathname.startsWith("/share/");
    // Allow non-admins to create side quotes from main app
    const onSideQuoteCreate = pathname.startsWith("/quotes/side/new") || pathname.startsWith("/quotes/side/edit") || (pathname === "/quotes/create" && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("side") === "1");
    if (role && role !== "admin" && !onStaff && !onPublicShare && !onSideQuoteCreate && pathname !== "/login") {
      navigate("/staff", { replace: true });
    }
  }, [user, role, aL, rL, pathname, navigate]);

  return <>{children}</>;
}

/**
 * Blocks staff (non-admin) users from a route when they lack the given permission(s).
 * - `permission`: single permission key required.
 * - `anyOf`: array of permission keys; access granted if ANY is not explicitly false.
 * Admins always pass through.
 */
export function PermGuard({
  permission,
  anyOf,
  children,
}: {
  permission?: keyof StaffPermissions;
  anyOf?: (keyof StaffPermissions)[];
  children: ReactNode;
}) {
  const { isAdmin, permissions, loading } = useUserRole();
  if (loading) return null;
  if (isAdmin) return <>{children}</>;

  let denied = false;
  if (permission && permissions[permission] === false) denied = true;
  if (anyOf && anyOf.length && anyOf.every(k => permissions[k] === false)) denied = true;

  if (denied) {
    return (
      <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-sm m-6">
        <h2 className="text-xl font-bold text-slate-700 mb-2">غير مصرح</h2>
        <p className="text-slate-500">ليس لديك صلاحية الوصول إلى هذه الصفحة.</p>
      </div>
    );
  }
  return <>{children}</>;
}
