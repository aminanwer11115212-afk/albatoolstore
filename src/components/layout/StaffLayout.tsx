import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, Receipt, Users, LogOut, User, ClipboardList, Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

export default function StaffLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { permissions, role } = useUserRole();
  const [open, setOpen] = useState(false);

  const items = [
    { to: "/staff", label: "الرئيسية", icon: LayoutDashboard, show: true, exact: true },
    { to: "/staff/my-records", label: "سجلاتي", icon: ClipboardList, show: permissions.create_quote !== false || permissions.create_invoice !== false },
    { to: "/staff/quotes", label: "عروض أسعاري", icon: FileText, show: permissions.create_quote !== false },
    { to: "/quotes/side/new", label: "عرض سعر جانبي", icon: FileText, show: true },
    { to: "/staff/invoices", label: "فواتيري", icon: Receipt, show: permissions.create_invoice !== false },
    { to: "/staff/customers", label: "العملاء", icon: Users, show: permissions.view_customers !== false || permissions.add_customer !== false },
  ].filter(i => i.show);

  const handleLogout = async () => { await signOut(); navigate("/login"); };

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  const SideContent = (
    <>
      <div className="p-5 border-b border-sidebar-border">
        <h1 className="text-lg font-bold text-sidebar-primary-foreground">بوابة الموظف</h1>
        <p className="text-xs text-sidebar-foreground/70 mt-1 truncate" title={user?.email}>{user?.email}</p>
        {role && (
          <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-sidebar-primary/20 text-sidebar-primary-foreground uppercase tracking-wide">
            {role}
          </span>
        )}
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.map(it => {
          const active = isActive(it.to, it.exact);
          const Icon = it.icon;
          return (
            <Link key={it.to} to={it.to} onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}>
              <Icon size={18} /> {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border space-y-1">
        <Link to="/staff/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <User size={16} /> ملفي الشخصي
        </Link>
        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors">
          <LogOut size={16} /> تسجيل الخروج
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-background font-cairo" dir="rtl">
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 right-0 w-64 bg-sidebar text-sidebar-foreground flex flex-col border-l border-sidebar-border z-50 transform transition-transform md:transform-none ${open ? "translate-x-0" : "translate-x-full md:translate-x-0"}`}>
        {SideContent}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden bg-card border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <button onClick={() => setOpen(true)} className="p-2 rounded-lg hover:bg-muted text-foreground">
            <Menu size={20} />
          </button>
          <h1 className="font-bold text-foreground">بوابة الموظف</h1>
          <div className="w-9" />
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
