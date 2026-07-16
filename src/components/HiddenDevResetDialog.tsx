import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";

/**
 * أداة مطوّر مخفية — تُفتح فقط عبر Ctrl+Shift+9.
 * لا تظهر في أي شاشة إعدادات. متاحة لمستخدمي admin فقط (الـ RPCs تتحقق).
 *
 * تجمع كل عمليات «منطقة الخطر» و«التصفير السريع» في مكان واحد مخفي.
 */
export default function HiddenDevResetDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState({
    // تصفير سريع (admin_reset_stock_and_ledgers)
    stock: false,
    ledger: false,
    // منطقة الخطر (admin_reset_transactional_data)
    invoices: false,
    quotes: false,
    purchases: false,
    bank: false,
    customers: false,
    // حذف يدوي للناقلين والترحيلات
    transporters: false,
  });
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "9" || e.code === "Digit9")) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const anySelected = Object.values(scope).some(Boolean);
  const canRun = anySelected && confirmText.trim() === "تصفير" && !busy;

  const toggle = (k: keyof typeof scope) =>
    setScope((s) => ({ ...s, [k]: !s[k] }));

  const groups: {
    title: string;
    items: { key: keyof typeof scope; label: string; hint: string }[];
  }[] = [
    {
      title: "تصفير سريع للمخزون والكشوف",
      items: [
        { key: "stock", label: "تصفير كميات كل المنتجات", hint: "يضبط stock_quantity إلى صفر لكل المنتجات." },
        { key: "ledger", label: "تصفير كشف حساب كل العملاء", hint: "يحذف الدفعات والأرصدة الدائنة، ويعلّم الفواتير غير الملغاة كمدفوعة، ويعيد الأرصدة إلى صفر." },
      ],
    },
    {
      title: "منطقة الخطر — حذف بيانات المعاملات",
      items: [
        { key: "invoices", label: "الفواتير وبنودها ومرفقاتها ومراجعاتها", hint: "يحذف كل الفواتير والحركات المرتبطة بها." },
        { key: "quotes", label: "عروض الأسعار وبنودها ومرفقاتها", hint: "يحذف كل عروض السعر." },
        { key: "purchases", label: "أوامر الشراء ومدفوعات الموردين", hint: "يحذف كل المشتريات ومدفوعات الموردين." },
        { key: "bank", label: "حركات البنك وتصفير أرصدة الحسابات", hint: "يحذف كل transactions ويصفّر أرصدة الحسابات." },
        { key: "customers", label: "تصفير أرصدة العملاء والموردين", hint: "يعيد أرصدة العملاء والموردين إلى صفر." },
      ],
    },
    {
      title: "الناقلون والترحيلات",
      items: [
        { key: "transporters", label: "حذف كل الناقلين وسجلات الترحيل وربطهم بالعملاء", hint: "يمسح جداول الترحيل والربط + جدول الناقلين نفسه." },
      ],
    },
  ];

  const run = async () => {
    if (!canRun) return;
    if (!confirm("تنفيذ العملية المخفية؟ لا يمكن التراجع.")) return;
    setBusy(true);
    const collected: any = {};
    try {
      // 1) تصفير سريع (stock/ledger)
      if (scope.stock || scope.ledger) {
        const { data, error } = await supabase.rpc(
          "admin_reset_stock_and_ledgers" as any,
          { _scope: { stock: scope.stock, ledger: scope.ledger } },
        );
        if (error) throw error;
        collected.quick = data;
      }

      // 2) منطقة الخطر
      if (scope.invoices || scope.quotes || scope.purchases || scope.bank || scope.customers) {
        const { data, error } = await supabase.rpc(
          "admin_reset_transactional_data" as any,
          {
            _scope: {
              invoices: scope.invoices,
              quotes: scope.quotes,
              purchases: scope.purchases,
              bank: scope.bank,
              customers: scope.customers,
            },
          },
        );
        if (error) throw error;
        collected.danger = data;
      }

      // 3) حذف الناقلين والترحيلات
      if (scope.transporters) {
        const tables = [
          "invoices_transports_items",
          "invoice_transports",
          "quote_transports",
          "customer_preferred_transporter",
          "customer_transporters",
          "destination_transporters",
          "locality_transporters",
        ];
        for (const t of tables) {
          const { error } = await supabase.from(t as any).delete().not("id", "is", null as any);
          if (error && !/id.*does not exist/i.test(error.message)) {
            // بعض الجداول لا يوجد بها عمود id — نستخدم فلتر بديل
            const { error: e2 } = await supabase.from(t as any).delete().gte("created_at" as any, "1900-01-01");
            if (e2) throw e2;
          }
        }
        await supabase
          .from("customers")
          .update({ preferred_transporter_id: null } as any)
          .not("preferred_transporter_id", "is", null as any);
        const { error: eTr } = await supabase.from("transporters").delete().not("id", "is", null as any);
        if (eTr) throw eTr;
        collected.transporters = { ok: true };
      }

      setResult(collected);
      [
        "products", "products-full", "product",
        "invoices", "invoices-full", "invoices-with-customers",
        "quotes", "quotes-full", "quotes-with-customers",
        "purchase_orders", "purchase-orders",
        "transactions", "transactionsWithAccounts",
        "customers", "customer-statement", "customer-transactions",
        "customer_balance_stats", "activity-log",
        "transporters", "customer_transporters", "customer_preferred_transporter",
        "destination_transporters", "destinations",
        "invoice_transports", "quote_transports",
      ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

      window.dispatchEvent(new Event("customers:changed"));
      window.dispatchEvent(new Event("invoices:changed"));
      window.dispatchEvent(new Event("products:changed"));
      window.dispatchEvent(new Event("customer-logistics:changed"));

      toast.success("تم التنفيذ بنجاح");
      setConfirmText("");
      setScope({
        stock: false, ledger: false,
        invoices: false, quotes: false, purchases: false, bank: false, customers: false,
        transporters: false,
      });
    } catch (e: any) {
      toast.error(e?.message || "تعذّر التنفيذ — يلزم صلاحية admin");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) { setConfirmText(""); setResult(null); }
      }}
    >
      <DialogContent className="max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle size={18} /> أداة مطوّر مخفية — منطقة الخطر
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive leading-relaxed">
            هذه الأداة <b>غير معلنة في الإعدادات</b>. الوصول عبر <b>Ctrl+Shift+9</b> فقط، ومخصصة لمستخدمي admin. <b>لا يمكن التراجع.</b>
          </div>

          <ScrollArea className="max-h-[55vh] pr-1">
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.title} className="space-y-2">
                  <div className="text-xs font-bold text-muted-foreground">{g.title}</div>
                  {g.items.map((it) => (
                    <label
                      key={it.key}
                      className="flex items-start gap-3 p-2.5 rounded-lg border border-border hover:border-destructive/40 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={scope[it.key]}
                        onCheckedChange={() => toggle(it.key)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-foreground">{it.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{it.hint}</div>
                      </div>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="space-y-1.5">
            <Label className="text-xs">
              اكتب كلمة <b className="text-destructive">تصفير</b> للتأكيد:
            </Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="تصفير"
              className="max-w-xs"
              dir="rtl"
            />
          </div>

          <div className="flex gap-2">
            <Button variant="destructive" onClick={run} disabled={!canRun}>
              <Trash2 size={16} className="ml-1" />
              {busy ? "جارِ التنفيذ..." : "تنفيذ الآن"}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              إغلاق
            </Button>
          </div>

          {result && (
            <pre
              className="text-[11px] bg-muted p-3 rounded-lg overflow-auto max-h-40"
              dir="ltr"
            >
{JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
