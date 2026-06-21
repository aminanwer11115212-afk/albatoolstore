import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import AppSidebar from "./AppSidebar";
import AppNavbar from "./AppNavbar";
import FloatingSideTools from "../FloatingSideTools";
import { useCloudUsage, LIMITS, pct, severity } from "@/hooks/useCloudUsage";

function CloudUsageWatcher() {
  const { data } = useCloudUsage(true);
  const notified = useRef(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (!data || notified.current) return;
    const apiUsed = data.invoices_last_30d * 50;
    const checks: { label: string; used: number; limit: number }[] = [
      { label: "حجم قاعدة البيانات", used: data.db_size_bytes, limit: LIMITS.db_size_bytes },
      { label: "حجم التخزين", used: data.storage_bytes, limit: LIMITS.storage_bytes },
      { label: "طلبات API الشهرية", used: apiUsed, limit: LIMITS.api_requests_monthly },
    ];
    const breaches = checks
      .map((c) => ({ ...c, sev: severity(pct(c.used, c.limit)), p: pct(c.used, c.limit) }))
      .filter((c) => c.sev !== "ok");
    if (!breaches.length) return;
    const worst = breaches.find((b) => b.sev === "crit") || breaches[0];
    notified.current = true;
    const fn = worst.sev === "crit" ? toast.error : toast.warning;
    fn(`تنبيه استهلاك Cloud: ${worst.label} ${worst.p.toFixed(0)}%`, {
      description: breaches.length > 1 ? `و ${breaches.length - 1} تنبيه آخر` : undefined,
      duration: worst.sev === "crit" ? Infinity : 8000,
      action: { label: "عرض التفاصيل", onClick: () => navigate("/settings/cloud-usage") },
    });
  }, [data, navigate]);
  return null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, loading } = useAuth();
  const isAuthPage = location.pathname === "/login" || location.pathname === "/signup";
  const isPublicShare = location.pathname.startsWith("/share/");
  const isStaffPortal = location.pathname.startsWith("/staff");

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileOpen((v) => !v);
    } else {
      setCollapsed((v) => !v);
    }
  }, [isMobile]);

  const mainClass = useMemo(
    () =>
      `transition-all duration-300 pt-11 min-h-screen overflow-x-hidden max-w-full ${
        isMobile ? "mr-0" : collapsed ? "mr-14" : "mr-44"
      }`,
    [isMobile, collapsed],
  );

  // Don't show admin layout on auth pages, public share pages, or staff portal
  if (isAuthPage || isPublicShare || isStaffPortal) {
    return <>{children}</>;
  }

  // Show nothing while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // حماية المسارات الداخلية: إعادة توجيه غير المسجلين إلى صفحة الدخول
  if (!user) {
    setTimeout(() => navigate("/login", { replace: true }), 0);
    return null;
  }


  return (
    <div className="min-h-screen bg-background font-cairo">
      {isMobile && mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}
      <AppSidebar
        collapsed={isMobile ? false : collapsed}
        mobileOpen={isMobile ? mobileOpen : undefined}
        onClose={() => setMobileOpen(false)}
      />
      <AppNavbar
        onToggleSidebar={toggleSidebar}
        sidebarCollapsed={isMobile ? true : collapsed}
      />
      <FloatingSideTools />
      <CloudUsageWatcher />
      <main className={mainClass}>
        <div className="px-2 md:px-6 pb-4 pt-1 max-w-full overflow-x-hidden">{children}</div>
      </main>
    </div>
  );
}
