import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { generatePrintHTML, buildPrintWindowHtml } from "@/utils/printTemplate";
import { loadInvoiceExtras, loadQuoteExtras } from "@/utils/printExtras";
import { ArrowRight, Loader2, Wallet } from "lucide-react";
import CustomerPaymentDialog from "@/components/invoice/CustomerPaymentDialog";
import DiscountInput from "@/components/shared/DiscountInput";
import { computeInvoiceStatusAfterPayment } from "@/utils/invoiceStatus";
import { toast } from "sonner";

/**
 * صفحة معاينة داخلية للمستندات (عرض سعر / فاتورة).
 *
 * تعرض نفس HTML الطباعة + شريط أدوات المعاينة (طباعة، PDF، واتساب PDF،
 * واتساب نص، تخصيص رؤية الأقسام) داخل iframe — بدلاً من فتح نافذة منبثقة.
 *
 * المسارات:
 *   /preview/quote/:id?variant=full&noHeader=0
 *   /preview/invoice/:id?variant=full&noHeader=0
 *
 * variants المدعومة: full | no-account | account-only | no-details
 */
type DocType = "quote" | "invoice" | "purchase" | "return";

interface Props {
  docType: DocType;
}

export default function DocumentPreviewPage({ docType }: Props) {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [stocktakeSort, setStocktakeSort] = useState<"default" | "name-asc" | "name-desc" | "qty-desc" | "qty-asc">("default");
  const [payOpen, setPayOpen] = useState(false);
  const [invMeta, setInvMeta] = useState<{
    id: string; number: string; total: number; subtotal: number; discount: number; paidAmount: number;
    customerId: string | null; customerName: string | null; isPos: boolean;
  } | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [savingDisc, setSavingDisc] = useState(false);
  const itemsSort = stocktakeSort;

  const variant = (search.get("variant") || "full") as
    | "full" | "no-account" | "account-only" | "no-details" | "stocktake";
  const noHeader = search.get("noHeader") === "1" || search.get("noHeader") === "true";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      setError("");
      const sortItems = (arr: any[]) => {
        if (itemsSort === "default") return arr;
        const copy = [...arr];
        const cmp = (a: string, b: string) => a.localeCompare(b, "ar");
        switch (itemsSort) {
          case "name-asc": copy.sort((a, b) => cmp(a.product_name || "", b.product_name || "")); break;
          case "name-desc": copy.sort((a, b) => cmp(b.product_name || "", a.product_name || "")); break;
          case "qty-desc": copy.sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0)); break;
          case "qty-asc": copy.sort((a, b) => Number(a.quantity || 0) - Number(b.quantity || 0)); break;
        }
        return copy;
      };
      try {
        // ===== Company info =====
        const { data: companyArr } = await (supabase as any)
          .from("company_settings").select("*").limit(1);
        const company = Array.isArray(companyArr) ? companyArr[0] : null;

        let docHtml = "";
        if (docType === "quote") {
          const { data: quote, error: qErr } = await supabase
            .from("quotes")
            .select("*, customers(name, phone, address, email, balance, credit_balance)")
            .eq("id", id).maybeSingle();
          if (qErr) throw qErr;
          if (!quote) throw new Error("عرض السعر غير موجود");
          const { data: items } = await supabase
            .from("quote_items").select("*").eq("quote_id", id);
          const printItems = (items || []).map((it: any) => ({
            product_name: it.product_name,
            quantity: it.quantity,
            unit_price: it.unit_price,
            tax_amount: 0,
            discount: it.discount || 0,
            total: it.total,
          }));
          const extras = await loadQuoteExtras(quote.id);
          const qCust: any = quote.customers;
          docHtml = generatePrintHTML({
            type: "quote",
            number: quote.quote_number,
            date: quote.date,
            customer: qCust ? {
              name: qCust.name,
              phone: qCust.phone,
              address: qCust.address,
              email: qCust.email,
            } : null,
            items: sortItems(printItems),
            subtotal: Number(quote.subtotal || 0),
            taxTotal: 0,
            discountTotal: Number(quote.discount || 0),
            grandTotal: Number(quote.total || 0),
            notes: quote.notes,
            company: company as any,
            variant,
            noHeader,
            oldBalance: Number(qCust?.balance || 0),
            previousDebt: Number(qCust?.balance || 0),
            previousCredit: Number(qCust?.credit_balance || 0),
            hidePaidBox: false,
            ...extras,
          });
        } else if (docType === "invoice") {
          const { data: invoice, error: iErr } = await supabase
            .from("invoices")
            .select("*, customers(name, phone, address, email, balance, credit_balance)")
            .eq("id", id).maybeSingle();
          if (iErr) throw iErr;
          if (!invoice) throw new Error("الفاتورة غير موجودة");
          const { data: items } = await supabase
            .from("invoice_items").select("*").eq("invoice_id", id);
          const printItems = (items || []).map((it: any) => ({
            product_name: it.product_name,
            quantity: it.quantity,
            unit_price: it.unit_price,
            tax_amount: Number(it.tax_rate || 0) * Number(it.unit_price) * Number(it.quantity) / 100,
            discount: it.discount || 0,
            total: it.total,
          }));
          const extras = await loadInvoiceExtras(invoice.id);
          const iCust: any = invoice.customers;
          // اطرح متبقّي هذه الفاتورة من الرصيد المدين حتى لا يُحسب مرتين
          const invRemaining = Math.max(Number(invoice.total || 0) - Number(invoice.paid_amount || 0), 0);
          const prevDebt = Math.max(Number(iCust?.balance || 0) - invRemaining, 0);
          docHtml = generatePrintHTML({
            type: "invoice",
            isCash: invoice.type === "cash",
            number: invoice.invoice_number,
            date: invoice.date,
            dueDate: invoice.due_date,
            customer: invoice.customers
              ? {
                  name: iCust.name,
                  phone: iCust.phone,
                  address: iCust.address,
                  email: iCust.email,
                }
              : (invoice as any).walk_in_customer_name
                ? { name: (invoice as any).walk_in_customer_name }
                : null,
            items: sortItems(printItems),
            subtotal: Number(invoice.subtotal || 0),
            taxTotal: Number((invoice as any).tax_amount || 0),
            discountTotal: Number(invoice.discount || 0),
            shipping: Number(invoice.shipping || 0),
            grandTotal: Number(invoice.total || 0),
            paidAmount: Number(invoice.paid_amount || 0),
            dueAmount: Number(invoice.due_amount || 0),
            notes: invoice.notes,
            company: company as any,
            status: invoice.status,
            paymentMethod: invoice.payment_method,
            variant,
            noHeader,
            oldBalance: Number(iCust?.balance || 0),
            previousDebt: prevDebt,
            previousCredit: Number(iCust?.credit_balance || 0),
            hidePaidBox: false,
            ...extras,
          });
          setInvMeta({
            id: invoice.id,
            number: invoice.invoice_number,
            total: Number(invoice.total || 0),
            subtotal: Number(invoice.subtotal || 0),
            discount: Number(invoice.discount || 0),
            paidAmount: Number(invoice.paid_amount || 0),
            customerId: iCust?.id || (invoice as any).customer_id || null,
            customerName: iCust?.name || (invoice as any).walk_in_customer_name || null,
            isPos: (invoice as any).source === "pos" || invoice.type === "cash",
          });
        } else if (docType === "purchase") {
          // ===== أمر شراء =====
          const { data: order, error: oErr } = await (supabase as any)
            .from("purchase_orders")
            .select("*, suppliers(name, phone, address, email)")
            .eq("id", id).maybeSingle();
          if (oErr) throw oErr;
          if (!order) throw new Error("أمر الشراء غير موجود");
          const { data: items } = await (supabase as any)
            .from("purchase_order_items").select("*").eq("purchase_order_id", id);
          const printItems = (items || []).map((it: any) => ({
            product_name: it.product_name,
            quantity: it.quantity,
            unit_price: it.unit_price,
            tax_amount: Number(it.tax_amount || 0),
            discount: it.discount || 0,
            total: it.total,
          }));
          const supplier = (order as any).suppliers;
          docHtml = generatePrintHTML({
            type: "purchase",
            number: (order as any).order_number,
            date: (order as any).date,
            customer: supplier ? {
              name: supplier.name,
              phone: supplier.phone,
              address: supplier.address,
              email: supplier.email,
            } : null,
            items: sortItems(printItems),
            subtotal: Number((order as any).subtotal || 0),
            taxTotal: Number((order as any).tax_amount || 0),
            discountTotal: Number((order as any).discount || 0),
            grandTotal: Number((order as any).total || 0),
            notes: (order as any).notes,
            company: company as any,
            variant,
            noHeader,
          });
        } else {
          // ===== مرتجع مبيعات =====
          const { data: ret, error: rErr } = await (supabase as any)
            .from("stock_returns")
            .select("*, customers(name, phone, address, email, balance)")
            .eq("id", id).maybeSingle();
          if (rErr) throw rErr;
          if (!ret) throw new Error("المرتجع غير موجود");
          const { data: items } = await (supabase as any)
            .from("stock_return_items").select("*").eq("stock_return_id", id);
          const printItems = (items || []).map((it: any) => ({
            product_name: it.product_name,
            quantity: it.quantity,
            unit_price: it.unit_price,
            tax_amount: 0,
            discount: 0,
            total: it.total,
          }));
          const cust = (ret as any).customers;
          docHtml = generatePrintHTML({
            type: "return",
            number: (ret as any).return_number,
            date: (ret as any).date,
            customer: cust ? {
              name: cust.name,
              phone: cust.phone,
              address: cust.address,
              email: cust.email,
            } : null,
            items: sortItems(printItems),
            subtotal: Number((ret as any).total || 0),
            taxTotal: 0,
            discountTotal: 0,
            grandTotal: Number((ret as any).total || 0),
            notes: (ret as any).reason,
            company: company as any,
            status: (ret as any).status,
            variant,
            noHeader,
            oldBalance: Number(cust?.balance || 0),
          });
        }

        if (cancelled) return;
        // نضيف شريط الأدوات الكامل (طباعة، PDF، واتساب PDF، واتساب نص، تخصيص الرؤية)
        let fullHtml = buildPrintWindowHtml(docHtml, true);
        // أضف meta tags لمعرف المستند ونوعه (يستخدمها زر "🔗 رابط للعميل")
        const shareType = docType === "purchase" ? "" : docType; // لا ندعم مشاركة المشتريات
        if (id && shareType) {
          const metaInject = `<meta name="lov-doc-id" content="${id}">\n<meta name="lov-doc-share-type" content="${shareType}">`;
          fullHtml = fullHtml.replace(/<head>/i, `<head>\n${metaInject}`);
        }
        setHtml(fullHtml);
      } catch (e: any) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, docType, variant, noHeader, stocktakeSort, reloadTick]);

  // استقبال رسالة "إغلاق" من زر ✕ داخل الـiframe → رجوع
  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d: any = e.data;
      if (!d) return;
      if (d.type === "lov-preview-close") {
        navigate(-1);
        return;
      }
      if (d.type === "lov-link-online-request") {
        const reply = (payload: any) => {
          (e.source as Window | null)?.postMessage(
            { type: "lov-link-online-result", reqId: d.reqId, ...payload },
            e.origin,
          );
        };
        try {
          const { data: sess } = await supabase.auth.getSession();
          const accessToken = sess?.session?.access_token;
          if (!accessToken) throw new Error("يجب تسجيل الدخول");
          const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
          const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-document-share-token`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
              apikey: ANON,
            },
            body: JSON.stringify({
              doc_type: d.docType,
              doc_id: d.docId,
              ttl_hours: 168,
              hidden_sections: Array.isArray(d.hiddenSections) ? d.hiddenSections : [],
            }),
          });
          const json = await resp.json();
          if (!resp.ok) throw new Error(json.error || "فشل إنشاء الرابط");
          // افتح واتساب من النافذة الأم (الـ iframe قد يُحجب popup منه)
          const greeting = d.customerName ? `مرحباً ${d.customerName} 👋` : "مرحباً 👋";
          const msg = `${greeting}\nتفضل رابط معاينة المستند:\n${json.url}`;
          const { openWhatsApp } = await import("@/utils/whatsapp");
          openWhatsApp(d.phone, msg);
          reply({ ok: true, url: json.url });
        } catch (err: any) {
          reply({ ok: false, error: err?.message || String(err) });
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [navigate]);

  const title = useMemo(
    () => docType === "quote" ? "معاينة عرض السعر"
        : docType === "invoice" ? "معاينة الفاتورة"
        : docType === "purchase" ? "معاينة أمر الشراء"
        : "معاينة المرتجع",
    [docType],
  );

  return (
    <div dir="rtl" style={{ height: "calc(100vh - 80px)", display: "flex", flexDirection: "column" }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-card">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold text-primary hover:bg-primary/10"
        >
          <ArrowRight size={16} /> رجوع
        </button>
        <div className="text-sm font-bold text-foreground">{title}</div>
        <div className="ms-auto flex items-center gap-2">
          {docType === "invoice" && invMeta && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-muted/40" title="خصم حي — يُطبَّق فورًا على الإجمالي والمتبقي والحالة">
              <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">خصم حي</span>
              <div style={{ width: 170 }}>
                <DiscountInput
                  label=""
                  value={invMeta.discount}
                  grandBeforeDiscount={invMeta.subtotal || invMeta.total + invMeta.discount}
                  onChange={async (nextDisc) => {
                    if (savingDisc || !invMeta) return;
                    const cur = Number(invMeta.discount || 0);
                    if (Math.abs(nextDisc - cur) < 0.01) return;
                    setSavingDisc(true);
                    try {
                      const base = (invMeta.subtotal || invMeta.total + cur);
                      const nextTotal = Math.max(0, base - nextDisc);
                      const nextDue = Math.max(0, nextTotal - invMeta.paidAmount);
                      const nextStatus = computeInvoiceStatusAfterPayment({ total: nextTotal, paidAfter: invMeta.paidAmount });
                      const { error } = await (supabase as any)
                        .from("invoices")
                        .update({ discount: nextDisc, total: nextTotal, due_amount: nextDue, status: nextStatus })
                        .eq("id", invMeta.id);
                      if (error) throw error;
                      toast.success(`تم تحديث الخصم — الإجمالي ${nextTotal.toLocaleString()} — الحالة ${nextStatus}`);
                      setReloadTick((t) => t + 1);
                    } catch (e: any) {
                      toast.error(e?.message || "تعذّر حفظ الخصم");
                    } finally {
                      setSavingDisc(false);
                    }
                  }}
                  compact
                />
              </div>
            </div>
          )}
          {docType === "invoice" && invMeta && invMeta.total - invMeta.paidAmount > 0.01 && (
            <button
              type="button"
              onClick={() => setPayOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
              title="تسجيل دفعة من العميل على هذه الفاتورة"
            >
              <Wallet size={16} /> سجّل دفعة
            </button>
          )}
          <label className="text-xs text-muted-foreground">ترتيب البنود:</label>
          <select
            value={stocktakeSort}
            onChange={(e) => setStocktakeSort(e.target.value as any)}
            className="text-xs border rounded px-2 py-1 bg-background"
            title="ترتيب بنود المستند في المعاينة والطباعة"
          >
            <option value="default">الترتيب الأصلي</option>
            <option value="name-asc">الاسم (أ - ي)</option>
            <option value="name-desc">الاسم (ي - أ)</option>
            <option value="qty-desc">العدد (الأكبر أولاً)</option>
            <option value="qty-asc">العدد (الأصغر أولاً)</option>
          </select>
        </div>
      </div>

      {invMeta && (
        <CustomerPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          invoiceId={invMeta.id}
          invoiceNumber={invMeta.number}
          customerId={invMeta.customerId}
          customerName={invMeta.customerName}
          total={invMeta.total}
          paidBefore={invMeta.paidAmount}
          isPos={invMeta.isPos}
          onSaved={() => setReloadTick((t) => t + 1)}
        />
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="animate-spin" size={18} /> جاري التحميل...
        </div>
      )}
      {error && (
        <div className="flex-1 flex items-center justify-center text-red-600 text-sm">
          {error}
        </div>
      )}
      {!loading && !error && (
        <iframe
          title={title}
          srcDoc={html}
          onLoad={(e) => {
            // دعم autoprint=1 لطباعة مباشرة عبر اختصار F10
            if (search.get("autoprint") === "1") {
              try {
                const w = (e.currentTarget as HTMLIFrameElement).contentWindow;
                setTimeout(() => { try { w?.focus(); w?.print(); } catch {} }, 250);
              } catch {}
            }
          }}
          style={{ flex: 1, width: "100%", border: "0", background: "#fff" }}
        />
      )}
    </div>
  );
}
