import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, FilePlus, List, CreditCard, Settings, ChevronLeft, ChevronRight, Calculator, Users, Package, BarChart3, Wallet, ArrowLeftRight } from "lucide-react";
import { useQuotesWithCustomers, useInvoicesWithCustomers, useAccounts } from "@/hooks/useData";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDialogSize } from "@/hooks/useDialogSize";

const statusMap: Record<string, { label: string; color: string }> = {
  // Quotes (4)
  draft: { label: "عرض سعر", color: "bg-muted-foreground" },
  sent: { label: "مرسل", color: "bg-primary" },
  accepted: { label: "مقبول", color: "bg-primary" },
  rejected: { label: "مرفوض", color: "bg-destructive" },
  // Invoices use workflow_status (4)
  new: { label: "جديد", color: "bg-muted-foreground" },
  preparing: { label: "قيد التجهيز", color: "bg-accent" },
  in_transit: { label: "في الطريق للترحيلات", color: "bg-secondary" },
  done: { label: "تم", color: "bg-primary" },
};

export default function FloatingSideTools() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const IDLE_MS = 5000;

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const resetIdleTimer = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => setExpanded(false), IDLE_MS);
  }, [clearIdleTimer]);

  useEffect(() => {
    if (expanded) resetIdleTimer();
    else clearIdleTimer();
    return clearIdleTimer;
  }, [expanded, resetIdleTimer, clearIdleTimer]);
  const [showQuotes, setShowQuotes] = useState(false);
  const [showInvoices, setShowInvoices] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState("0");
  const [calcOp, setCalcOp] = useState<{ val: number; op: string } | null>(null);
  const [calcNew, setCalcNew] = useState(true);

  const { data: quotes } = useQuotesWithCustomers();
  const { data: invoices } = useInvoicesWithCustomers();
  const { data: accounts } = useAccounts();

  const quotesCount = quotes?.length || 0;
  const invoicesCount = invoices?.length || 0;
  const totalBalance = (accounts || []).reduce((sum: number, a: any) => sum + Number(a.balance || 0), 0);

  const { dlgRef: quotesRef, dlgStyle: quotesStyle } = useDialogSize("floating_quotes_dialog", showQuotes, { w: "min(680px, 96vw)", h: "80vh" });
  const { dlgRef: invoicesRef, dlgStyle: invoicesStyle } = useDialogSize("floating_invoices_dialog", showInvoices, { w: "min(680px, 96vw)", h: "80vh" });
  const { dlgRef: accountsRef, dlgStyle: accountsStyle } = useDialogSize("floating_accounts_dialog", showAccounts, { w: "min(520px, 96vw)", h: "80vh" });

  const calcPress = (key: string) => {
    if (key === "C") { setCalcDisplay("0"); setCalcOp(null); setCalcNew(true); return; }
    if (key === "⌫") { setCalcDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : "0"); return; }
    if (["+", "-", "×", "÷"].includes(key)) {
      setCalcOp({ val: parseFloat(calcDisplay), op: key }); setCalcNew(true); return;
    }
    if (key === "=") {
      if (!calcOp) return;
      const cur = parseFloat(calcDisplay);
      let result = 0;
      switch (calcOp.op) {
        case "+": result = calcOp.val + cur; break;
        case "-": result = calcOp.val - cur; break;
        case "×": result = calcOp.val * cur; break;
        case "÷": result = cur !== 0 ? calcOp.val / cur : 0; break;
      }
      setCalcDisplay(String(parseFloat(result.toFixed(6)))); setCalcOp(null); setCalcNew(true); return;
    }
    if (key === "." && calcDisplay.includes(".")) return;
    if (calcNew) { setCalcDisplay(key === "." ? "0." : key); setCalcNew(false); }
    else setCalcDisplay(prev => prev + key);
  };

  const tools = [
    { icon: FilePlus, label: "عرض سعر", gradient: "from-orange-500 to-amber-400", onClick: () => navigate("/quotes/create") },
    { icon: FileText, label: "فاتورة", gradient: "from-emerald-500 to-green-400", onClick: () => navigate("/invoices/create") },
    { icon: CreditCard, label: "شحن رصيد", gradient: "from-yellow-500 to-amber-300", onClick: () => navigate("/transactions") },
    { icon: ArrowLeftRight, label: "التحويل", gradient: "from-red-500 to-orange-400", onClick: () => navigate("/settings/currency") },
    { icon: List, label: "عروض", gradient: "from-purple-600 to-violet-500", badge: quotesCount, onClick: () => setShowQuotes(true) },
    { icon: List, label: "فواتير", gradient: "from-rose-500 to-red-400", badge: invoicesCount, onClick: () => setShowInvoices(true) },
    { icon: Wallet, label: "حسابات", gradient: "from-cyan-500 to-blue-400", onClick: () => setShowAccounts(true) },
    { icon: Calculator, label: "حاسبة", gradient: "from-teal-500 to-emerald-400", onClick: () => setShowCalc(true) },
    { icon: BarChart3, label: "إحصائيات", gradient: "from-indigo-500 to-blue-500", onClick: () => navigate("/reports/statistics") },
    { icon: Settings, label: "إعدادات", gradient: "from-slate-600 to-cyan-600", onClick: () => navigate("/settings/company") },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div data-floating-tools className="fixed left-0 top-1/2 -translate-y-1/2 z-50 hidden sm:flex items-center">
        {/* مخفي على الموبايل (≤640px) لتقليل التداخل مع المحتوى — متاح من الهامبرغر */}
        {expanded && (
          <div
            className="bg-background/95 backdrop-blur-md border border-border rounded-r-xl shadow-xl p-1.5 flex flex-col gap-1 animate-slide-in-right"
            onMouseEnter={resetIdleTimer}
            onMouseMove={resetIdleTimer}
            onMouseLeave={resetIdleTimer}
            onTouchStart={resetIdleTimer}
          >
            {tools.map((tool, i) => (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { clearIdleTimer(); setExpanded(false); tool.onClick(); }}
                    className={`relative flex items-center gap-2 rounded-lg py-1.5 hover:scale-105 active:scale-95 transition-all shadow-sm text-white bg-gradient-to-r ${tool.gradient} ${
                      isMobile ? "px-2 justify-center" : "pr-3 pl-2"
                    }`}
                  >
                    <span className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center flex-shrink-0">
                      <tool.icon className="w-3.5 h-3.5" />
                    </span>
                    {!isMobile && <span className="text-[11px] font-semibold whitespace-nowrap">{tool.label}</span>}
                    {tool.badge !== undefined && tool.badge > 0 && (
                      <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {tool.badge > 99 ? "99+" : tool.badge}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right"><p>{tool.label}</p></TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="bg-primary text-primary-foreground rounded-r-lg p-1.5 hover:bg-primary/90 transition-all shadow-lg"
        >
          {expanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {/* Quotes Modal */}
      <Dialog open={showQuotes} onOpenChange={setShowQuotes}>
        <DialogContent ref={quotesRef} style={{ ...quotesStyle, overflowY: "auto" }}>
          <DialogHeader><DialogTitle>آخر عروض الأسعار ({quotesCount})</DialogTitle></DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-right bg-muted">
                <th className="p-2.5">الرقم</th><th className="p-2.5">العميل</th><th className="p-2.5">المبلغ</th><th className="p-2.5">التاريخ</th><th className="p-2.5">الحالة</th>
              </tr></thead>
              <tbody>
                {(quotes || []).slice(0, 15).map((q: any) => (
                  <tr key={q.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => { setShowQuotes(false); navigate("/quotes"); }}>
                    <td className="p-2.5 font-mono text-xs">{q.quote_number}</td>
                    <td className="p-2.5">{q.customers?.name || "-"}</td>
                    <td className="p-2.5 font-medium">{Number(q.total || 0).toLocaleString()}</td>
                    <td className="p-2.5 text-muted-foreground text-xs">{q.date}</td>
                    <td className="p-2.5">
                      <Badge className={`${statusMap[q.status]?.color || "bg-muted-foreground"} text-primary-foreground text-xs`}>
                        {statusMap[q.status]?.label || q.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {(!quotes || quotes.length === 0) && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">لا توجد عروض أسعار</td></tr>}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invoices Modal */}
      <Dialog open={showInvoices} onOpenChange={setShowInvoices}>
        <DialogContent ref={invoicesRef} style={{ ...invoicesStyle, overflowY: "auto" }}>
          <DialogHeader><DialogTitle>آخر الفواتير ({invoicesCount})</DialogTitle></DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-right bg-muted">
                <th className="p-2.5">الرقم</th><th className="p-2.5">العميل</th><th className="p-2.5">المبلغ</th><th className="p-2.5">التاريخ</th><th className="p-2.5">الحالة</th>
              </tr></thead>
              <tbody>
                {(invoices || []).slice(0, 15).map((inv: any) => (
                  <tr key={inv.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => { setShowInvoices(false); navigate("/invoices"); }}>
                    <td className="p-2.5 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="p-2.5">{inv.customers?.name || "-"}</td>
                    <td className="p-2.5 font-medium">{Number(inv.total || 0).toLocaleString()}</td>
                    <td className="p-2.5 text-muted-foreground text-xs">{inv.date}</td>
                    <td className="p-2.5">
                      {(() => {
                        const ws = inv.workflow_status || "new";
                        return (
                          <Badge className={`${statusMap[ws]?.color || "bg-muted-foreground"} text-primary-foreground text-xs`}>
                            {statusMap[ws]?.label || ws}
                          </Badge>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
                {(!invoices || invoices.length === 0) && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">لا توجد فواتير</td></tr>}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Calculator Modal */}
      <Dialog open={showCalc} onOpenChange={setShowCalc}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Calculator size={18} /> الآلة الحاسبة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-muted rounded-lg p-4 text-left" dir="ltr">
              <p className="text-2xl font-mono font-bold text-foreground">{calcDisplay}</p>
              {calcOp && <p className="text-xs text-muted-foreground mt-1">{calcOp.val} {calcOp.op}</p>}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {["C", "⌫", "÷", "×", "7", "8", "9", "-", "4", "5", "6", "+", "1", "2", "3", "=", "0", ".", "00"].map(key => (
                <Button
                  key={key}
                  variant={["C", "⌫"].includes(key) ? "destructive" : ["+", "-", "×", "÷", "="].includes(key) ? "default" : "outline"}
                  size="sm"
                  className={`h-11 text-base font-medium ${key === "0" ? "col-span-1" : key === "=" ? "row-span-1" : ""}`}
                  onClick={() => calcPress(key)}
                >
                  {key}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Accounts Table Modal */}
      <Dialog open={showAccounts} onOpenChange={setShowAccounts}>
        <DialogContent ref={accountsRef} style={{ ...accountsStyle, overflowY: "auto" }}>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Wallet size={18} /> جدول الحسابات</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-primary/10 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">عدد الحسابات</p>
                <p className="text-xl font-bold text-primary">{accounts?.length || 0}</p>
              </div>
              <div className="bg-primary/10 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">إجمالي الأرصدة</p>
                <p className="text-xl font-bold text-primary">{totalBalance.toLocaleString()}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted text-right">
                  <th className="p-2.5">الحساب</th>
                  <th className="p-2.5">النوع</th>
                  <th className="p-2.5">الرصيد</th>
                </tr></thead>
                <tbody>
                  {(accounts || []).map((acc: any) => (
                    <tr key={acc.id} className="border-b hover:bg-muted/50">
                      <td className="p-2.5">
                        <div>
                          <p className="font-medium text-foreground">{acc.name}</p>
                          {acc.account_number && <p className="text-xs text-muted-foreground font-mono">{acc.account_number}</p>}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <Badge variant="outline" className="text-xs">
                          {acc.account_type === "bank" ? "بنكي" : acc.account_type === "cash" ? "نقدي" : acc.account_type === "mobile" ? "محفظة" : acc.account_type || "-"}
                        </Badge>
                      </td>
                      <td className={`p-2.5 font-bold ${Number(acc.balance || 0) >= 0 ? "text-primary" : "text-destructive"}`}>
                        {Number(acc.balance || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {(!accounts || accounts.length === 0) && (
                    <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">لا توجد حسابات</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { setShowAccounts(false); navigate("/accounts"); }}>
                إدارة الحسابات
              </Button>
              <Button size="sm" className="flex-1" onClick={() => { setShowAccounts(false); navigate("/accounts/balance-sheet"); }}>
                الميزانية العمومية
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
