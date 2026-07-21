import {
  useDashboardStats, useInvoicesWithCustomers, useLowStockProducts,
  useRecentTransactions, useQuotesWithCustomers, useLatestExchangeRates
} from "@/hooks/useData";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, CreditCard, Percent, FileText, Users, Package,
  DollarSign, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DashboardStockAlert from "@/components/dashboard/DashboardStockAlert";
import DashboardRecentInvoices from "@/components/dashboard/DashboardRecentInvoices";
import DashboardRecentQuotes from "@/components/dashboard/DashboardRecentQuotes";
import DashboardRecentTransactions from "@/components/dashboard/DashboardRecentTransactions";
import DashboardCashFlow from "@/components/dashboard/DashboardCashFlow";
import DashboardAccountBalances from "@/components/dashboard/DashboardAccountBalances";
import ChargeBalanceDialog from "@/components/dashboard/ChargeBalanceDialog";
import ExchangeRateDialog from "@/components/dashboard/ExchangeRateDialog";

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  // لوحة التحكم: بطاقة واحدة تجمع كل الفواتير (حساب + كاش)
  const { data: invoices, isLoading: invLoading } = useInvoicesWithCustomers();
  const { data: lowStock } = useLowStockProducts();
  const { data: recentTx } = useRecentTransactions();
  const { data: quotes, isLoading: quotesLoading } = useQuotesWithCustomers();
  const [chargeOpen, setChargeOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);

  // أحدث أسعار الصرف — hook موحّد يبطل تلقائياً بعد أي تحديث من ExchangeRateDialog
  const { data: rates = [] } = useLatestExchangeRates();

  return (
    <div className="space-y-4" dir="rtl">
      {/* Quick Action Buttons - matching reference exactly */}
      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <Button onClick={() => navigate("/quotes/create")} className="h-auto py-3 text-xs md:text-sm gap-1.5 bg-primary hover:bg-primary/90">
              <Plus size={16} /><span>إضافة عرض سعر جديد</span>
            </Button>
            <Button onClick={() => navigate("/invoices/create")} className="h-auto py-3 text-xs md:text-sm gap-1.5 bg-green-600 hover:bg-green-700 text-white">
              <Plus size={16} /><span>إضافة فاتورة جديدة</span>
            </Button>
            <Button onClick={() => setChargeOpen(true)} className="h-auto py-3 text-xs md:text-sm gap-1.5 bg-blue-500 hover:bg-blue-600 text-white">
              <CreditCard size={16} /><span>شحن الرصيد</span>
            </Button>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => setRateOpen(true)} className="h-auto py-3 text-xs md:text-sm gap-1.5 bg-red-500 hover:bg-red-600 text-white">
                    <Percent size={16} /><span>معدل التحويل</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-right" dir="rtl">
                  <div className="font-semibold mb-1">المعدل الحالي المطبَّق</div>
                  {rates.length === 0 ? (
                    <div className="text-xs opacity-80">لا يوجد معدل محفوظ بعد</div>
                  ) : (
                    <div className="space-y-0.5 text-xs">
                      {rates.map((r) => (
                        <div key={r.code} className="flex justify-between gap-3">
                          <span>{r.code}</span>
                          <span className="font-mono">× {r.rate.toLocaleString()}</span>
                        </div>
                      ))}
                      <div className="opacity-70 mt-1">السعر المحلي = السعر الأجنبي × المعدل</div>
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Row 1: Recent Quotes (يمين) + Recent Invoices (يسار) — مقسومة في المنتصف */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="order-2 lg:order-1">
          <DashboardRecentQuotes quotes={quotes || []} isLoading={quotesLoading} />
        </div>
        <div className="order-1 lg:order-2">
          <DashboardRecentInvoices
            invoices={invoices || []}
            isLoading={invLoading}
            limit={50}
          />
        </div>
      </div>



      {/* Row 2: Cash Flow / Transactions (8 cols) + Stock Alert (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8">
          <DashboardCashFlow stats={stats} />
          <div className="mt-4">
            <DashboardRecentTransactions transactions={recentTx || []} />
          </div>
        </div>
        <div className="lg:col-span-4 space-y-4">
          <DashboardStockAlert products={lowStock || []} />
          <DashboardAccountBalances />
        </div>
      </div>

      <ChargeBalanceDialog open={chargeOpen} onOpenChange={setChargeOpen} />
      <ExchangeRateDialog open={rateOpen} onOpenChange={setRateOpen} />
    </div>
  );
}
