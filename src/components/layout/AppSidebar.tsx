import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Plus, Package, FileText, RotateCcw,
  Users, Truck, Box, UserCheck, CreditCard, BarChart3, Settings,
  ChevronDown, DollarSign, FileSpreadsheet, FolderOpen, X, Search,
  MapPin, ListChecks, StickyNote, FileDown, Shield, Link2,
  MessageSquare, Mail, Smartphone, Database, Briefcase, Target,
  Wallet, ArrowLeftRight, Building2, Globe, HeadsetIcon, CalendarDays, Info
} from "lucide-react";
import logo from "@/assets/logo.png";
import deliveryMan from "@/assets/delivery-man.png";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import InstallPwaDialog from "@/components/InstallPwaDialog";
import { prefetchHandlers, prefetchRoute } from "@/lib/routePrefetch";

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  path?: string;
  children?: { label: string; path: string }[];
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const menuSections: MenuSection[] = [
  {
    title: "",
    items: [
      { label: "لوحة التحكم", icon: <LayoutDashboard size={18} />, path: "/" },
    ],
  },
  {
    title: "مبيعات",
    items: [
      {
        label: "مبيعات", icon: <Plus size={18} />,
        children: [
          { label: "فاتورة جديدة", path: "/invoices/create" },
          { label: "مبيعات كاش", path: "/invoices/cash" },
          { label: "إدارة الفواتير", path: "/invoices" },
          { label: "🚚 إدارة الترحيلات", path: "/dispatch" },
          { label: "عرض أسعار جديد", path: "/quotes/create" },
          { label: "إدارة عروض الأسعار", path: "/quotes" },
          { label: "عرض سعر جانبي جديد", path: "/quotes/side/new" },
          { label: "عروض الأسعار الجانبية", path: "/quotes/side" },
        ],
      },
    ],
  },
  {
    title: "المخزون",
    items: [
      {
        label: "مدير المنتجات", icon: <Package size={18} />,
        children: [
          { label: "تقرير الأسعار", path: "/products/price-report" },
          { label: "إدارة جميع المنتجات", path: "/products" },
          { label: "المستودعات", path: "/warehouses" },
          { label: "تحويل مخزون", path: "/stock-transfer" },
          { label: "تتبع المخزون", path: "/stock-tracking" },
        ],
      },
      {
        label: "أمر شراء", icon: <FileText size={18} />,
        children: [
          { label: "أمر جديد", path: "/purchase/create" },
          { label: "إدارة الأوامر", path: "/purchase" },
        ],
      },
      {
        label: "المرتجعات", icon: <RotateCcw size={18} />,
        children: [
          { label: "اضف جديد", path: "/stock-return/create" },
          { label: "إدارة", path: "/stock-return" },
        ],
      },
    ],
  },
  {
    title: "CRM",
    items: [
      {
        label: "عملاء", icon: <Users size={18} />,
        children: [
          { label: "تقرير المبالغ المستحقة", path: "/customers/debt-report" },
          { label: "عميل جديد", path: "/customers/create" },
          { label: "إدارة العملاء", path: "/customers" },
          { label: "وجهات وناقلون مفضلون", path: "/customers/logistics" },
          { label: "إدارة المجموعات", path: "/client-groups" },
        ],
      },
      {
        label: "الموردين", icon: <UserCheck size={18} />,
        children: [
          { label: "مورد جديد", path: "/suppliers/create" },
          { label: "إدارة الموردين", path: "/suppliers" },
        ],
      },
      {
        label: "الوجهات", icon: <MapPin size={18} />,
        children: [
          { label: "إضافة وجهة", path: "/destinations/add" },
          { label: "إدارة الوجهات", path: "/destinations" },
        ],
      },
      {
        label: "أنواع التغليف", icon: <Box size={18} />,
        children: [
          { label: "عرض الكل", path: "/packaging" },
          { label: "إضافة نوع", path: "/packaging/add" },
        ],
      },
      {
        label: "الناقلين", icon: <Truck size={18} />,
        children: [
          { label: "عرض الكل", path: "/transporters" },
          { label: "إضافة ناقل", path: "/transporters/add" },
        ],
      },
    ],
  },
  {
    title: "المحاسبة",
    items: [
      {
        label: "الحسابات", icon: <CreditCard size={18} />,
        children: [
          { label: "إدارة الحسابات", path: "/accounts" },
          { label: "حساب جديد", path: "/accounts/add" },
          { label: "الميزانية العامة", path: "/accounts/balance-sheet" },
        ],
      },
      {
        label: "المعاملات", icon: <DollarSign size={18} />,
        children: [
          { label: "معاملة جديدة", path: "/transactions/add" },
          { label: "إدارة المعاملات", path: "/transactions" },
          { label: "الإيرادات", path: "/transactions/income" },
          { label: "المصروفات", path: "/transactions/expenses" },
          { label: "تحويل بين الحسابات", path: "/transactions/transfer" },
        ],
      },
      {
        label: "العملات وأسعار الصرف", icon: <Globe size={18} />, path: "/finance/currencies",
      },
    ],
  },
  {
    title: "الموظفين",
    items: [
      {
        label: "إدارة الموظفين", icon: <Briefcase size={18} />,
        children: [
          { label: "إضافة موظف", path: "/employees/add" },
          { label: "جميع الموظفين", path: "/employees" },
        ],
      },
    ],
  },
  {
    title: "التقارير",
    items: [
      {
        label: "التقارير المالية", icon: <BarChart3 size={18} />,
        children: [
          { label: "كشف الحساب", path: "/reports/account-statement" },
          { label: "كشف حساب عميل", path: "/reports/customer-statement" },
          { label: "كشف حساب مورد", path: "/reports/supplier-statement" },
          { label: "بيان الدخل", path: "/reports/income" },
          { label: "بيان المصروفات", path: "/reports/expenses" },
          { label: "فواتير اليوم", path: "/reports/today-invoices" },
          { label: "تقرير الفواتير اليومي", path: "/reports/daily-invoices" },
          { label: "قائمة الدخل", path: "/reports/income-statement" },
          { label: "ميزان المراجعة", path: "/reports/trial-balance" },
          { label: "تقرير المصروفات التفصيلي", path: "/reports/expense-statement" },
          { label: "الإحصائيات", path: "/reports/statistics" },
          { label: "تقرير التحويلات البنكية", path: "/reports/bank-transfers" },
        ],
      },
    ],
  },
  {
    title: "الأدوات",
    items: [
      {
        label: "الأدوات", icon: <ListChecks size={18} />,
        children: [
          { label: "ملاحظات", path: "/tools/notes" },
          { label: "مستندات", path: "/tools/documents" },
          { label: "قائمة المهام", path: "/tools/todo" },
          { label: "حدد الأهداف", path: "/tools/goals" },
          { label: "التقويم", path: "/calendar" },
        ],
      },
      {
        label: "المراجعة والتدقيق", icon: <Shield size={18} />,
        children: [
          { label: "سجل النشاط الشامل", path: "/audit/activity" },
          { label: "المنتجات المحذوفة", path: "/audit/deleted-items" },
          { label: "فحص صحة البيانات", path: "/data-health" },
          { label: "حالة النظام", path: "/system-status" },
        ],
      },
      { label: "الدعم الفني", icon: <HeadsetIcon size={18} />, path: "/support" },
      { label: "حول النظام", icon: <Info size={18} />, path: "/about" },
    ],
  },
  {
    title: "المشاريع",
    items: [
      {
        label: "إدارة المشاريع", icon: <FolderOpen size={18} />,
        children: [
          { label: "مشروع جديد", path: "/projects/add" },
          { label: "جميع المشاريع", path: "/projects" },
        ],
      },
    ],
  },
  {
    title: "النسخ الاحتياطي والاستيراد",
    items: [
      {
        label: "التصدير والاستيراد", icon: <FileSpreadsheet size={18} />,
        children: [
          { label: "تصدير المنتجات", path: "/export/products" },
          { label: "تصدير المعاملات", path: "/export/transactions" },
          { label: "تصدير بيانات CRM", path: "/export/crm" },
          { label: "استيراد المنتجات", path: "/import/products" },
          { label: "النسخ الاحتياطي", path: "/backup/database" },
        ],
      },
    ],
  },
  {
    title: "إعدادات الدفع",
    items: [
      {
        label: "الدفع والعملات", icon: <Wallet size={18} />,
        children: [
          { label: "بوابات الدفع", path: "/settings/payment-gateways" },
          { label: "عملات الدفع", path: "/settings/payment-currencies" },
          { label: "تحويل العملات", path: "/settings/currency-exchange" },
          { label: "حسابات بنكية", path: "/settings/bank-accounts" },
        ],
      },
    ],
  },
  {
    title: "الإعدادات",
    items: [
      {
        label: "إعدادات النظام", icon: <Settings size={18} />,
        children: [
          { label: "إعدادات الشركة", path: "/settings/company" },
          { label: "إعدادات الفوترة", path: "/settings/billing" },
          { label: "فئات المعاملات", path: "/settings/transaction-categories" },
          { label: "بنود الفاتورة", path: "/settings/billing-terms" },
          { label: "إعدادات العملة", path: "/settings/currency" },
          { label: "إعدادات التاريخ", path: "/settings/datetime" },
          { label: "إعدادات SMTP", path: "/settings/smtp" },
          { label: "المظهر", path: "/settings/theme" },
          { label: "أعمدة الجداول", path: "/settings/columns" },
          { label: "استهلاك Cloud", path: "/settings/cloud-usage" },
          { label: "تقرير الأداء", path: "/settings/performance" },
        ],
      },
    ],
  },
  {
    title: "الإضافات",
    items: [
      {
        label: "إضافات النظام", icon: <Globe size={18} />,
        children: [
          { label: "reCaptcha", path: "/plugins/recaptcha" },
          { label: "URL Shortener", path: "/plugins/url-shortener" },
          { label: "Twilio SMS", path: "/plugins/twilio-sms" },
        ],
      },
    ],
  },
  {
    title: "القوالب",
    items: [
      {
        label: "قوالب الرسائل", icon: <Mail size={18} />,
        children: [
          { label: "قوالب البريد الإلكتروني", path: "/templates/email" },
          { label: "قوالب SMS", path: "/templates/sms" },
        ],
      },
    ],
  },
];

// Flatten all menu items for search
function getAllLinks(): { label: string; path: string; section: string }[] {
  const links: { label: string; path: string; section: string }[] = [];
  menuSections.forEach(s => {
    s.items.forEach(item => {
      if (item.path && !item.children) {
        links.push({ label: item.label, path: item.path, section: s.title });
      }
      item.children?.forEach(c => {
        links.push({ label: c.label, path: c.path, section: s.title || item.label });
      });
    });
  });
  return links;
}

const allLinks = getAllLinks();

interface SidebarProps {
  collapsed: boolean;
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function AppSidebar({ collapsed, mobileOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [installOpen, setInstallOpen] = useState(false);

  // Auto-expand active section on mount/route change
  useEffect(() => {
    menuSections.forEach(s => {
      s.items.forEach(item => {
        if (item.children?.some(c => location.pathname === c.path || location.pathname.startsWith(c.path + "/"))) {
          setOpenMenus(prev => ({ ...prev, [item.label]: true }));
        }
      });
    });
  }, [location.pathname]);

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => {
      const willOpen = !prev[label];
      // عند فتح المجموعة، prefetch لكل أبنائها دفعة واحدة في الخلفية
      if (willOpen) {
        const section = menuSections.find(s => s.items.some(i => i.label === label));
        const item = section?.items.find(i => i.label === label);
        item?.children?.forEach(c => prefetchRoute(c.path));
      }
      return { ...prev, [label]: willOpen };
    });
  };

  const isActive = (path?: string) => path === location.pathname;
  const isChildActive = (children?: { path: string }[]) =>
    children?.some((c) => location.pathname === c.path || location.pathname.startsWith(c.path + "/"));

  const isMobileSidebar = mobileOpen !== undefined;
  const isVisible = isMobileSidebar ? mobileOpen : true;
  const showFull = !collapsed || isMobileSidebar;

  // Filtered search results
  const searchResults = useMemo(() => {
    if (!sidebarSearch.trim()) return [];
    return allLinks.filter(l => l.label.includes(sidebarSearch) || l.section.includes(sidebarSearch));
  }, [sidebarSearch]);

  if (isMobileSidebar && !isVisible) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={`fixed top-0 right-0 h-screen bg-sidebar-dark z-40 transition-all duration-300 flex flex-col ${
          isMobileSidebar ? "w-64 shadow-2xl" : collapsed ? "w-14" : "w-44"
        }`}
      >
        {/* Header */}
        <div className="h-11 flex items-center justify-center bg-sidebar-dark-dark border-b border-sidebar-dark-border px-2 gap-1.5 flex-shrink-0">
          {isMobileSidebar && (
            <button onClick={onClose} className="absolute left-2 top-3 text-sidebar-dark-text hover:text-sidebar-dark-text-active p-1">
              <X size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setInstallOpen(true)}
            title="تثبيت التطبيق"
            className="bg-transparent border-0 p-0 m-0 cursor-pointer hover:opacity-90 transition-opacity"
          >
            {showFull ? (
              <div className="flex items-center gap-1.5">
                <img src={logo} alt="البتول" className="h-7 w-auto" />
                <div className="flex flex-col leading-tight items-start">
                  <span className="text-primary font-bold text-[11px]">البتول</span>
                  <span className="text-sidebar-dark-text text-[8px]">لاسبيرات المواتر</span>
                </div>
              </div>
            ) : (
              <img src={logo} alt="البتول" className="h-6 w-auto" />
            )}
          </button>
        </div>

        {/* Search in sidebar */}
        {showFull && (
          <div className="px-3 pt-3 pb-1 flex-shrink-0">
            <div className="flex items-center bg-sidebar-dark-hover rounded-lg px-2.5 py-2 gap-2">
              <Search size={14} className="text-sidebar-dark-text opacity-50 flex-shrink-0" />
              <input
                type="text"
                placeholder="بحث في القائمة..."
                value={sidebarSearch}
                onChange={e => setSidebarSearch(e.target.value)}
                className="bg-transparent border-none outline-none text-xs text-sidebar-dark-text-active placeholder:text-sidebar-dark-text/40 w-full"
              />
              {sidebarSearch && (
                <button onClick={() => setSidebarSearch("")} className="text-sidebar-dark-text opacity-50 hover:opacity-100">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Search results */}
        {showFull && sidebarSearch.trim() && (
          <div className="flex-1 overflow-y-auto py-1">
            {searchResults.length === 0 ? (
              <p className="text-center text-sidebar-dark-text/50 text-xs py-6">لا توجد نتائج</p>
            ) : (
              searchResults.map((r, i) => (
                <Link
                  key={i}
                  to={r.path}
                  {...prefetchHandlers(r.path)}
                  onClick={() => { setSidebarSearch(""); onClose?.(); }}
                  className={`flex items-center gap-2 px-4 py-2.5 mx-2 rounded-md text-sm transition-colors ${
                    isActive(r.path)
                      ? "bg-primary/20 text-primary"
                      : "text-sidebar-dark-text hover:bg-sidebar-dark-hover hover:text-sidebar-dark-text-active"
                  }`}
                >
                  <Search size={14} className="opacity-40 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-xs">{r.label}</span>
                    <span className="text-[10px] opacity-50">{r.section}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}

        {/* Menu */}
        {(!sidebarSearch.trim() || !showFull) && (
          <nav className="flex-1 overflow-y-auto py-2 sidebar-scrollbar">
            {menuSections.map((section, si) => (
              <div key={si}>
                {section.title && showFull && (
                  <div className="px-4 py-2 mt-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-dark-section">
                      {section.title}
                    </span>
                  </div>
                )}
                {collapsed && !isMobileSidebar && section.title && (
                  <div className="mx-2 my-2 border-t border-sidebar-dark-border" />
                )}
                {section.items.map((item) => (
                  <div key={item.label}>
                    {item.path && !item.children ? (
                      collapsed && !isMobileSidebar ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              to={item.path}
                              {...prefetchHandlers(item.path)}
                              onClick={onClose}
                              className={`flex items-center justify-center px-0 py-2.5 mx-2 rounded-md text-sm transition-colors ${
                                isActive(item.path)
                                  ? "bg-primary/20 text-primary"
                                  : "text-sidebar-dark-text hover:bg-sidebar-dark-hover hover:text-sidebar-dark-text-active"
                              }`}
                            >
                              {item.icon}
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="left"><p>{item.label}</p></TooltipContent>
                        </Tooltip>
                      ) : (
                        <Link
                          to={item.path}
                          {...prefetchHandlers(item.path)}
                          onClick={onClose}
                          className={`flex items-center gap-2 px-2 py-1.5 mx-1.5 rounded-md text-xs transition-colors ${
                            isActive(item.path)
                              ? "bg-primary/20 text-primary"
                              : "text-sidebar-dark-text hover:bg-sidebar-dark-hover hover:text-sidebar-dark-text-active"
                          }`}
                        >
                          {item.icon}
                          <span className="truncate">{item.label}</span>
                        </Link>
                      )
                    ) : (
                      <>
                        {collapsed && !isMobileSidebar ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => toggleMenu(item.label)}
                                className={`flex items-center justify-center w-full px-0 py-2.5 mx-auto rounded-md text-sm transition-colors ${
                                  isChildActive(item.children)
                                    ? "bg-primary/10 text-primary"
                                    : "text-sidebar-dark-text hover:bg-sidebar-dark-hover hover:text-sidebar-dark-text-active"
                                }`}
                              >
                                {item.icon}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <div className="flex flex-col gap-1">
                                <p className="font-semibold text-xs mb-1">{item.label}</p>
                                {item.children?.map(c => (
                                  <Link
                                    key={c.path}
                                    to={c.path}
                                    {...prefetchHandlers(c.path)}
                                    className={`text-xs py-0.5 hover:text-primary transition-colors ${
                                      isActive(c.path) ? "text-primary font-medium" : ""
                                    }`}
                                  >
                                    {c.label}
                                  </Link>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <>
                            <button
                              onClick={() => toggleMenu(item.label)}
                              className={`flex items-center justify-between w-full px-2 py-1.5 mx-1.5 rounded-md text-xs transition-colors ${
                                isChildActive(item.children)
                                  ? "bg-primary/10 text-primary"
                                  : "text-sidebar-dark-text hover:bg-sidebar-dark-hover hover:text-sidebar-dark-text-active"
                              }`}
                              style={{ width: "calc(100% - 0.75rem)" }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {item.icon}
                                <span className="truncate">{item.label}</span>
                              </div>
                              <ChevronDown
                                size={12}
                                className={`flex-shrink-0 transition-transform duration-200 ${
                                  openMenus[item.label] ? "rotate-180" : ""
                                }`}
                              />
                            </button>
                            <div
                              className={`overflow-hidden transition-all duration-200 ${
                                openMenus[item.label] ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                              }`}
                            >
                              {item.children && (
                                <div className="mr-4 ml-1.5 border-r border-sidebar-dark-border">
                                  {item.children.map((child) => (
                                    <Link
                                      key={child.path}
                                      to={child.path}
                                      {...prefetchHandlers(child.path)}
                                      onClick={onClose}
                                      className={`block px-2 py-1 text-[11px] transition-colors ${
                                        isActive(child.path)
                                          ? "text-primary font-medium bg-primary/5 rounded-md"
                                          : "text-sidebar-dark-text hover:text-sidebar-dark-text-active hover:bg-sidebar-dark-hover/50 rounded-md"
                                      }`}
                                    >
                                      {child.label}
                                    </Link>
                                  ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </nav>
        )}

        {/* Footer */}
        {showFull && (
          <div className="px-4 py-3 border-t border-sidebar-dark-border flex-shrink-0">
            <p className="text-[10px] text-sidebar-dark-text/40 text-center">البتول v2.0 © 2024</p>
          </div>
        )}
      </aside>
      <InstallPwaDialog open={installOpen} onOpenChange={setInstallOpen} />
    </TooltipProvider>
  );
}
