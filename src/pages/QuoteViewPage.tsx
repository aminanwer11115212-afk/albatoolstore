import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings, useAccounts } from "@/hooks/useData";
import { toast } from "sonner";
import { generatePrintHTML, openPrintWindow } from "@/utils/printTemplate";
import { loadQuoteExtras } from "@/utils/printExtras";
import { deductStockForLines } from "@/utils/stockDeduction";
import { type WhatsAppMessageType, pickCustomerWhatsApp} from "@/utils/whatsapp";
import { resolveAttachmentSignedUrls } from "@/utils/signedAttachmentUrl";
import { validateBankTransferPayment, isAllowedBank, filterAccountsForPayment } from "@/lib/bankTransferValidation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PackagingDialog from "@/components/packaging/PackagingDialog";
import TransportDialog from "@/components/transport/TransportDialog";
import QuoteConversionLog from "@/components/quote/QuoteConversionLog";
import UnavailableItemsPanel from "@/components/invoice/UnavailableItemsPanel";
import CustomizableToolbar from "@/components/toolbar/CustomizableToolbar";
import FreePositionToolbar from "@/components/toolbar/FreePositionToolbar";
import { ToolbarCustomizationProvider } from "@/components/toolbar/ToolbarCustomizationContext";
import { Button } from "@/components/ui/button";
import { useQuoteConvertedDialog } from "@/hooks/useQuoteConvertedDialog";
import {
  Edit, Truck, Package, FileText, MessageCircle, Mail, Phone, CreditCard,
  Printer, Eye, RefreshCw, XCircle, Trash2, PlusCircle, ChevronDown, ArrowRight,
  Paperclip, Download, Image as ImageIcon,
} from "lucide-react";
import { resolveLogoUrl } from "@/utils/albatoolLogo";

const statusLabels: Record<string, { label: string; bg: string }> = {
  draft: { label: "عرض سعر", bg: "bg-gray-400 text-white" },
  pending: { label: "قيد الانتظار", bg: "bg-amber-500 text-white" },
  sent: { label: "مرسل", bg: "bg-blue-500 text-white" },
  accepted: { label: "مقبول", bg: "bg-emerald-500 text-white" },
  rejected: { label: "مرفوض", bg: "bg-red-500 text-white" },
};

export default function QuoteViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: companyArr } = useCompanySettings();
  const { data: accounts } = useAccounts();
  const company = (companyArr as any)?.[0] || null;
  const { showConverted, ConvertedDialog } = useQuoteConvertedDialog();

  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showStatusChange, setShowStatusChange] = useState(false);
  const [showWhatsappMenu, setShowWhatsappMenu] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [showAdditionalMenu, setShowAdditionalMenu] = useState(false);
  const [packagingDialogOpen, setPackagingDialogOpen] = useState(false);
  const [transportDialogOpen, setTransportDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"document" | "conversion">("document");
  const [editingCell, setEditingCell] = useState<{ index: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newStatus, setNewStatus] = useState("pending");

  // Advance payment (عربون) — تسجيل دفعة مقدمة على عرض السعر
  const [showAdvancePayment, setShowAdvancePayment] = useState(false);
  const [advancePayments, setAdvancePayments] = useState<any[]>([]);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payMethod, setPayMethod] = useState("");
  const [payAccount, setPayAccount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payRef, setPayRef] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => { loadQuote(); }, [id]);

  const loadQuote = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: q, error: qErr } = await supabase.from("quotes").select("*, customers(name, phone, whatsapp, email, address, balance)").eq("id", id).single();
      if (qErr) {
        console.error("[QuoteViewPage] loadQuote failed:", qErr);
        toast.error(`تعذّر تحميل عرض السعر: ${qErr.message}`);
        setQuote(null); setItems([]); setAttachments([]); setAdvancePayments([]);
        return;
      }
      const [itmsRes, attsRes, txsRes] = await Promise.all([
        supabase.from("quote_items").select("*").eq("quote_id", id),
        supabase.from("quote_attachments").select("*").eq("quote_id", id).order("created_at", { ascending: false }),
        supabase
          .from("transactions")
          .select("*")
          .eq("reference_id", id)
          .eq("type", "income")
          .order("date", { ascending: false }),
      ]);
      if (itmsRes.error) { console.error(itmsRes.error); toast.error(`تعذّر تحميل البنود: ${itmsRes.error.message}`); }
      if (attsRes.error) { console.error(attsRes.error); toast.error(`تعذّر تحميل المرفقات: ${attsRes.error.message}`); }
      if (txsRes.error)  { console.error(txsRes.error);  toast.error(`تعذّر تحميل الدفعات: ${txsRes.error.message}`); }
      if (q && (q as any).is_side) {
        navigate(`/quotes/side/${id}`, { replace: true });
        return;
      }
      setQuote(q);
      setItems(itmsRes.data || []);
      setAttachments(await resolveAttachmentSignedUrls((attsRes.data || []) as any[], "quote-attachments"));
      setAdvancePayments(txsRes.data || []);
      if (q) setNewStatus(q.status || "pending");
    } finally {
      setLoading(false);
    }
  };

  const isBankMethod = (m: string) => m === "bank" || m === "bank_transfer";

  const totalAdvancePaid = advancePayments.reduce((s, t) => s + Number(t.amount || 0), 0);
  const remainingAfterAdvance = Math.max(0, Number(quote?.total || 0) - totalAdvancePaid);

  const openAdvancePaymentDialog = () => {
    setPayAmount(String(remainingAfterAdvance));
    setPayDate(new Date().toISOString().split("T")[0]);
    setPayMethod("");
    setPayAccount("");
    setPayNote(`عربون عرض سعر #${quote?.quote_number || ""}`);
    setPayRef("");
    setShowAdvancePayment(true);
  };

  const handleAdvancePayment = async () => {
    if (!quote) return;
    const amount = parseFloat(payAmount) || 0;
    if (amount <= 0) { toast.error("أدخل مبلغ صحيح"); return; }
    if (amount > remainingAfterAdvance + 0.01) {
      toast.error(`المبلغ أكبر من المتبقي (${remainingAfterAdvance.toLocaleString()})`);
      return;
    }
    if (isBankMethod(payMethod)) {
      const selectedAcc = (accounts as any[])?.find((a: any) => a.id === payAccount);
      const err = validateBankTransferPayment({ method: payMethod, account: selectedAcc, referenceNo: payRef });
      if (err) { toast.error(err); return; }
    }
    const refSuffix = isBankMethod(payMethod) && payRef.trim() ? ` - رقم العملية: ${payRef.trim()}` : "";
    const finalNote = `[عربون] ${payNote || ""}${refSuffix}`.trim();
    setSavingPayment(true);
    try {
      const { error } = await supabase.from("transactions").insert({
        type: "income",
        amount,
        date: payDate,
        description: finalNote,
        account_id: payAccount || null,
        customer_id: quote.customer_id,
        reference_id: quote.id,
      });
      if (error) throw error;
      toast.success("تم تسجيل الدفعة المقدمة");
      setShowAdvancePayment(false);
      loadQuote();
    } catch (e: any) {
      toast.error(e.message || "تعذر حفظ الدفعة");
    } finally {
      setSavingPayment(false);
    }
  };


  const printAttachments = () => {
    const images = attachments.filter((a) => a.file_type?.startsWith("image/"));
    if (images.length === 0) { toast.error("لا توجد صور للطباعة"); return; }
    const escHtml = (s: any) => String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>مرفقات ${escHtml(quote?.quote_number || "")}</title>
      <style>
        body{margin:0;padding:0;font-family:Arial,sans-serif;}
        .page{page-break-after:always;padding:10mm;text-align:center;}
        .page:last-child{page-break-after:auto;}
        .page h3{margin:0 0 8px;font-size:14px;color:#444;}
        .page img{max-width:100%;max-height:260mm;object-fit:contain;}
        @media print {.page{padding:0;}}
      </style></head><body>
      ${images.map((a) => `<div class="page"><h3>${escHtml(a.file_name)}</h3><img src="${escHtml(a.file_url)}" alt="${escHtml(a.file_name)}"/></div>`).join("")}
      <script>window.onload=()=>{setTimeout(()=>window.print(),300);};</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const handleStatusChange = async () => {
    if (!quote) return;
    try {
      const { error } = await supabase.from("quotes").update({ status: newStatus }).eq("id", quote.id);
      if (error) throw error;
      toast.success("تم تغيير الوضع");
      setShowStatusChange(false);
      loadQuote();
      qc.invalidateQueries({ queryKey: ["quotes-full"] });
      qc.invalidateQueries({ queryKey: ["quotes-with-customers"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const handleConvertToInvoice = async () => {
    if (!quote || !confirm("تحويل عرض السعر إلى فاتورة؟ سيتم الإبقاء على عرض السعر بحالة \"مقبول\".")) return;
    try {
      const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");
      const { invoiceId, invoiceNumber, stockDeducted, deductedLineCount } = await convertQuoteToInvoice(quote.id);
      const stockMsg = stockDeducted ? ` · ✅ تم خصم المخزون تلقائيًا (${deductedLineCount} صنف)` : "";
      toast.success(`تم تحويل العرض إلى فاتورة ${invoiceNumber} — العرض محفوظ كمقبول${stockMsg}`);
      qc.invalidateQueries({ queryKey: ["quotes-full"] });
      qc.invalidateQueries({ queryKey: ["quotes-with-customers"] });
      qc.invalidateQueries({ queryKey: ["invoices-full"] });
      qc.invalidateQueries({ queryKey: ["invoices-with-customers"] });
      navigate(`/invoices/edit/${invoiceId}`);
    } catch (e: any) {
      const { reportCriticalError } = await import("@/utils/errorReporter");
      reportCriticalError({
        title: "فشل تحويل عرض السعر إلى فاتورة",
        error: e,
        context: `QuoteViewPage.handleConvertToInvoice(quote=${quote?.quote_number || quote?.id})`,
        fallbackMessage: "تعذّر إتمام التحويل — راجع البنود والاتصال ثم أعد المحاولة",
      });
    }
  };

  const handlePrint = async (variant: "full" | "no-account" | "account-only" | "no-details" | "stocktake" = "full", noHeader: boolean = false) => {
    if (!quote) return;
    // الانتقال لصفحة المعاينة الداخلية (بدلاً من فتح نافذة منبثقة)
    const qs = new URLSearchParams();
    if (variant !== "full") qs.set("variant", variant);
    if (noHeader) qs.set("noHeader", "1");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    navigate(`/preview/quote/${quote.id}${suffix}`);
    setShowPrintMenu(false);
    const { markQuoteAsSent } = await import("@/utils/quoteSentStatus");
    await markQuoteAsSent(quote.id);
  };

  const handleWhatsApp = async (_type: WhatsAppMessageType) => {
    if (!quote) return;
    const { shareDocumentViaWhatsApp } = await import("@/utils/shareDocumentWhatsApp");
    await shareDocumentViaWhatsApp({
      docType: "quote",
      docId: quote.id,
      phone: pickCustomerWhatsApp(quote.customers),
      customerName: quote.customers?.name,
      docNumber: quote.quote_number,
      total: quote.total,
      currency: quote.currency_code || company?.currency || "",
      docLabel: (quote as any).is_side ? "عرض سعر جانبي" : "عرض سعر",
    });
    setShowWhatsappMenu(false);
    const { markQuoteAsSent } = await import("@/utils/quoteSentStatus");
    await markQuoteAsSent(quote.id);
  };

  const handleEmail = async () => {
    if (!quote?.customers?.email) { toast.error("لا يوجد بريد إلكتروني للعميل"); return; }
    const subject = encodeURIComponent(`عرض سعر رقم ${quote.quote_number}`);
    const body = encodeURIComponent(`عزيزي ${quote.customers?.name || "العميل"},\n\nمرفق لكم عرض سعر رقم ${quote.quote_number} بمبلغ ${quote.currency_code || company?.currency || "SDG"} ${Number(quote.total || 0).toLocaleString()}\n\nشكراً لتعاملكم معنا.`);
    window.open(`mailto:${quote.customers.email}?subject=${subject}&body=${body}`);
    const { markQuoteAsSent } = await import("@/utils/quoteSentStatus");
    await markQuoteAsSent(quote.id);
  };

  const handleSMS = async () => {
    if (!pickCustomerWhatsApp(quote?.customers)) { toast.error("لا يوجد رقم واتساب صالح للعميل"); return; }
    const msg = encodeURIComponent(`عرض سعر رقم ${quote.quote_number} بمبلغ ${quote.currency_code || company?.currency || "SDG"} ${Number(quote.total || 0).toLocaleString()}`);
    window.open(`sms:${quote.customers.phone}?body=${msg}`);
    const { markQuoteAsSent } = await import("@/utils/quoteSentStatus");
    await markQuoteAsSent(quote.id);
  };

  const handleCopyQuote = async () => {
    if (!quote) return;
    try {
      const newNumber = `${quote.quote_number}-COPY`;
      const { data: newQ, error } = await supabase.from("quotes").insert({
        quote_number: newNumber, customer_id: quote.customer_id,
        date: new Date().toISOString().split("T")[0],
        subtotal: quote.subtotal, discount: quote.discount,
        total: quote.total, status: "draft", notes: quote.notes,
        currency_code: quote.currency_code, exchange_rate_to_base: quote.exchange_rate_to_base,
      }).select().single();
      if (error) throw error;
      if (newQ && items.length > 0) {
        const { error: itErr } = await supabase.from("quote_items").insert(items.map((it: any) => ({
          quote_id: newQ.id, product_id: it.product_id, product_name: it.product_name,
          quantity: it.quantity, unit_price: it.unit_price, discount: it.discount,
          tax_status: it.tax_status, total: it.total,
        })));
        if (itErr) {
          await supabase.from("quotes").delete().eq("id", newQ.id);
          throw new Error(`فشل نسخ البنود، تم التراجع: ${itErr.message}`);
        }
      }
      toast.success("تم نسخ عرض السعر بنجاح");
      navigate(`/quotes/view/${newQ.id}`);
    } catch (e: any) { toast.error(e.message); }
    setShowAdditionalMenu(false);
  };

  const handleDelete = async () => {
    if (!quote || !confirm("هل أنت متأكد من إلغاء عرض السعر؟")) return;
    try {
      const { error } = await supabase.from("quotes").update({ status: "rejected" }).eq("id", quote.id);
      if (error) throw error;
      toast.success("تم إلغاء عرض السعر");
      loadQuote();
    } catch (e: any) { toast.error(e.message || "تعذّر إلغاء عرض السعر"); }
  };

  const startEdit = (index: number, field: string, value: any) => {
    setEditingCell({ index, field });
    setEditValue(String(value));
  };

  const saveEdit = async () => {
    if (!editingCell || !quote) return;
    const { index, field } = editingCell;
    const item = items[index];
    const val = parseFloat(editValue) || 0;
    const updates: any = { [field]: val };
    const qty = field === "quantity" ? val : item.quantity;
    const price = field === "unit_price" ? val : item.unit_price;
    const disc = field === "discount" ? val : (item.discount || 0);
    const baseTotal = qty * price;
    updates.total = baseTotal - (baseTotal * disc / 100);
    try {
      const { error: itErr } = await supabase.from("quote_items").update(updates).eq("id", item.id);
      if (itErr) throw itErr;
      const newItems = items.map((it, i) => i === index ? { ...it, ...updates } : it);
      const newSubtotal = newItems.reduce((s: number, it: any) => s + (it.quantity * it.unit_price), 0);
      const newDisc = newItems.reduce((s: number, it: any) => s + (it.quantity * it.unit_price * (it.discount || 0) / 100), 0);
      const newTotal = newSubtotal - newDisc + Number(quote.tax_amount || 0);
      const { error: qErr } = await supabase.from("quotes").update({
        subtotal: newSubtotal, discount: newDisc, total: newTotal,
      }).eq("id", quote.id);
      if (qErr) throw new Error(`تم حفظ البند لكن فشل تحديث إجمالي العرض: ${qErr.message}`);
      toast.success("تم التحديث");
      loadQuote();
    } catch (e: any) { toast.error(e.message); }
    setEditingCell(null);
  };

  const EditableCell = ({ value, index, field, suffix }: { value: number; index: number; field: string; suffix?: string }) => {
    const isEditing = editingCell?.index === index && editingCell?.field === field;
    if (isEditing) {
      return (
        <input type="number" value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={saveEdit} onKeyDown={e => e.key === "Enter" && saveEdit()}
          className="w-20 bg-background border border-primary rounded px-1 py-0.5 text-center text-sm" autoFocus />
      );
    }
    return (
      <span onClick={() => startEdit(index, field, value)}
        className="cursor-pointer hover:bg-primary/10 rounded px-1 py-0.5 transition-colors" title="اضغط للتعديل">
        {value.toLocaleString("en", { minimumFractionDigits: 2 })}{suffix || ""}
      </span>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  if (!quote) return (
    <div className="text-center py-20 text-muted-foreground">
      <FileText size={48} className="mx-auto mb-3 opacity-30" />
      <p>عرض السعر غير موجود</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/quotes")}>العودة لعروض الأسعار</Button>
    </div>
  );

  const st = statusLabels[quote.status] || statusLabels.draft;
  const currency = quote.currency_code || company?.currency || "SDG";

  return (
    <div className="space-y-4" dir="rtl">
      <ToolbarCustomizationProvider storageKey="quote-view">
      {/* Toolbar Row 1 */}
      <CustomizableToolbar
        screenKey="quote-view-row1"
        showControls
        className="flex flex-wrap"
        items={[
          { id: "advance-pay", node: (
            <Button onClick={openAdvancePaymentDialog} className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5 text-xs h-9">
              <CreditCard size={14} /> دفعة مقدمة
              {totalAdvancePaid > 0 && (
                <span className="bg-white/20 rounded px-1.5 py-0.5 text-[10px]">
                  {totalAdvancePaid.toLocaleString()}
                </span>
              )}
            </Button>
          )},
          { id: "convert", node: (
            <Button onClick={handleConvertToInvoice} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs h-9">
              <ArrowRight size={14} /> تحويل إلى فاتورة
            </Button>
          )},
          { id: "transport", node: (
            <Button onClick={() => setTransportDialogOpen(true)} className="bg-green-600 hover:bg-green-700 text-white gap-1.5 text-xs h-9">
              <Truck size={14} /> اضافة ترحيل
            </Button>
          )},
          { id: "packaging", node: (
            <Button onClick={() => setPackagingDialogOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5 text-xs h-9">
              <Package size={14} /> اضافة تغليف
            </Button>
          )},
          { id: "transport-report", node: (
            <Button onClick={() => navigate(`/quotes/${quote.id}/transport-report`)} variant="outline" className="gap-1.5 text-xs h-9">
              <FileText size={14} /> تقرير الترحيل
            </Button>
          )},
          { id: "packaging-report", node: (
            <Button onClick={() => navigate(`/preview/quote/${quote.id}/packaging`)} variant="outline" className="gap-1.5 text-xs h-9">
              <FileText size={14} /> تقرير التغليف
            </Button>
          )},
        ]}
      />

      {/* Toolbar Row 2 — free position */}
      <FreePositionToolbar
        screenKey="quote-view-row2"
        className="flex flex-wrap"
        items={[
          { id: "print", node: (
            <Button onClick={() => handlePrint("full", false)} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs h-9">
              <Printer size={14} /> طباعة
            </Button>
          )},
          { id: "preview", node: (
            <Button onClick={() => handlePrint("full", false)} variant="outline" className="gap-1.5 text-xs h-9">
              <Eye size={14} /> معاينة
            </Button>
          )},
          { id: "edit", node: (
            <Button onClick={() => navigate(`/quotes/edit/${id}`)} className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5 text-xs h-9">
              <Edit size={14} /> تعديل
            </Button>
          )},
          { id: "status-change", node: (
            <Button onClick={() => setShowStatusChange(true)} className="bg-sky-500 hover:bg-sky-600 text-white gap-1.5 text-xs h-9">
              <RefreshCw size={14} /> تغيير الوضع
            </Button>
          )},
          { id: "deleted-products", node: (
            <Button onClick={() => navigate(`/deleted-items?quote=${id}`)} variant="outline" className="gap-1.5 text-xs h-9">
              <Trash2 size={14} /> المنتجات المحذوفة
            </Button>
          )},
          { id: "additional", node: (
            <div className="relative">
              <Button onClick={() => setShowAdditionalMenu(!showAdditionalMenu)} className="bg-green-500 hover:bg-green-600 text-white gap-1.5 text-xs h-9">
                <PlusCircle size={14} /> إضافي <ChevronDown size={12} />
              </Button>
              {showAdditionalMenu && (
                <div className="absolute top-full right-0 mt-1 bg-gradient-to-b from-cyan-400 to-cyan-600 text-white rounded-lg shadow-lg z-50 min-w-[220px] py-1">
                  <button onClick={handleCopyQuote} className="block w-full text-right px-4 py-2 text-sm hover:bg-white/20 transition">
                    📑 نسخ عرض السعر
                  </button>
                </div>
              )}
            </div>
          )},
        ]}
      />
      </ToolbarCustomizationProvider>

      {/* Tabs: Document / Conversion log */}
      <div className="flex gap-2 border-b border-border" dir="rtl">
        <button
          type="button"
          onClick={() => setActiveTab("document")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === "document" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          المستند
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("conversion")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === "conversion" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          سجل التحويل
        </button>
      </div>

      {activeTab === "conversion" && (
        <QuoteConversionLog mode="quote" quoteId={quote.id} />
      )}

      <div hidden={activeTab !== "document"}>
      {/* Quote Content - Legacy document look */}
      <article className="content"><div className="legacy-invoice-doc">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">عرض سعر</h2>
            <p className="text-muted-foreground text-sm">QT #{quote.quote_number}{quote.tid ? ` · رقم متسلسل: ${quote.tid}` : ""}</p>
            {quote.converted_to_invoice_id && <span className="inline-block mt-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs">تم التحويل إلى فاتورة</span>}
            <p className="text-muted-foreground text-sm mt-2">مرجع:</p>
            <div className="mt-4">
              <p className="text-muted-foreground text-sm">المبلغ الإجمالي</p>
              <p className="text-2xl font-bold text-foreground">{currency} {Number(quote.total || 0).toLocaleString("en", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
          <div className="text-left">
            <img src={resolveLogoUrl(company?.logo_url)} alt="Logo" className="h-16 mb-2" />
            <div className="text-sm text-muted-foreground mt-4">
              <p className="font-medium text-foreground">عرض سعر إلى</p>
              <p className="text-primary font-semibold text-base">{quote.customers?.name || "عميل"}</p>
              {quote.customers?.address && <p>{quote.customers.address}</p>}
              
              {quote.customers?.email && <p>البريد الالكتروني: {quote.customers.email}</p>}
            </div>
          </div>
        </div>

        {/* Dates */}
        <div className="flex flex-wrap gap-6 text-sm mb-6">
          <p>تاريخ العرض : {quote.date}</p>
        </div>

        {/* Status Stepper */}
        <div className="mb-4">
          {(() => {
            const steps: { key: string; label: string; color: string }[] = [
              { key: "draft",    label: "عرض سعر",  color: "#6b7280" },
              { key: "sent",     label: "مُرسل",  color: "#3b82f6" },
              { key: "accepted", label: "مقبول",  color: "#10b981" },
              { key: "rejected", label: "مرفوض",  color: "#ef4444" },
            ];
            const cur = String(quote.status || "draft");
            const order = ["draft", "sent", "accepted"];
            const isRejected = cur === "rejected";
            const curIdx = isRejected ? -1 : order.indexOf(cur);
            return (
              <div className="flex items-center gap-1 flex-wrap" dir="rtl" aria-label="تسلسل حالة عرض السعر">
                {steps.map((s, i) => {
                  const isLast = i === steps.length - 1; // rejected branch
                  const isCurrent = s.key === cur;
                  let active = false;
                  if (isLast) {
                    active = isRejected;
                  } else {
                    active = !isRejected && curIdx >= i;
                  }
                  const dim = !active && !isCurrent;
                  return (
                    <div key={s.key} className="flex items-center gap-1">
                      <div
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border-2 transition-all"
                        style={{
                          background: active ? s.color : "transparent",
                          color: active ? "#fff" : s.color,
                          borderColor: dim ? "#e5e7eb" : s.color,
                          opacity: dim ? 0.45 : 1,
                          boxShadow: isCurrent ? `0 0 0 3px ${s.color}33` : "none",
                        }}
                      >
                        <span
                          className="inline-flex items-center justify-center rounded-full text-[10px] font-extrabold"
                          style={{
                            width: 18,
                            height: 18,
                            background: active ? "#ffffff33" : (dim ? "#e5e7eb" : `${s.color}22`),
                            color: active ? "#fff" : s.color,
                          }}
                        >
                          {isLast ? "✕" : i + 1}
                        </span>
                        {s.label}
                        {isCurrent && <span className="text-[10px] opacity-90">• الحالة الحالية</span>}
                      </div>
                      {!isLast && i < steps.length - 2 && (
                        <span
                          className="inline-block h-0.5 w-6 rounded"
                          style={{ background: !isRejected && curIdx > i ? steps[i].color : "#e5e7eb" }}
                        />
                      )}
                      {i === steps.length - 2 && (
                        <span className="mx-1 text-[10px] text-muted-foreground">أو</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Items Table */}
        <div className="overflow-x-auto mb-6 legacy-table-wrap">
          <table className="legacy-table w-full" style={{borderRadius: 4, overflow: 'hidden'}}>
            <thead>
              <tr className="bg-muted">
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground w-10">#</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">وصف</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">سعر</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">الكمية</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">خصم</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">مبلغ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-border hover:bg-muted/50">
                  <td className="px-3 py-2 text-center text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{it.product_name}</td>
                  <td className="px-3 py-2 text-center"><EditableCell value={Number(it.unit_price)} index={i} field="unit_price" /></td>
                  <td className="px-3 py-2 text-center"><EditableCell value={Number(it.quantity)} index={i} field="quantity" /></td>
                  <td className="px-3 py-2 text-center"><EditableCell value={Number(it.discount || 0)} index={i} field="discount" suffix="%" /></td>
                  <td className="px-3 py-2 text-center font-semibold">{currency} {Number(it.total).toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6} className="text-center py-6 text-muted-foreground text-xs">لا توجد بنود</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-start">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">المجموع الفرعي:</span><span>{Number(quote.subtotal || 0).toLocaleString("en", { minimumFractionDigits: 2 })}</span></div>
            {Number(quote.tax_amount || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">الضريبة:</span><span>{Number(quote.tax_amount).toLocaleString("en", { minimumFractionDigits: 2 })}</span></div>}
            {Number(quote.discount || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">الخصم:</span><span className="text-destructive">-{Number(quote.discount).toLocaleString("en", { minimumFractionDigits: 2 })}</span></div>}
            <div className="flex justify-between border-t border-border pt-2 mt-2 font-bold text-base">
              <span>الإجمالي:</span><span className="text-primary">{currency} {Number(quote.total || 0).toLocaleString("en", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <UnavailableItemsPanel
            isInvoice={false}
            docId={quote.id}
            docNumber={quote.quote_number}
            customerName={quote.customers?.name}
            customerPhone={pickCustomerWhatsApp(quote.customers) || quote.customers?.phone}
            date={quote.date}
            company={company}
          />
        </div>

        {quote.notes && (
          <div className="mt-6 bg-muted rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
            <p className="text-sm whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}
        {quote.user_note && (
          <div className="mt-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-xs text-blue-700 dark:text-blue-300 mb-1">ملاحظة العميل (تظهر في الطباعة)</p>
            <p className="text-sm">{quote.user_note}</p>
          </div>
        )}
        {quote.internal_note && (
          <div className="mt-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <p className="text-xs text-amber-700 dark:text-amber-300 mb-1">🔒 ملاحظة داخلية (لا تُطبع)</p>
            <p className="text-sm">{quote.internal_note}</p>
          </div>
        )}

        {/* Attachments Section */}
        {attachments.length > 0 && (
          <div className="mt-6 border border-border rounded-lg p-4 bg-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Paperclip size={16} /> المستندات المرفقة ({attachments.length})
              </h3>
              <Button onClick={printAttachments} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs h-8">
                <Printer size={13} /> طباعة المرفقات
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {attachments.map((att) => {
                const isImg = att.file_type?.startsWith("image/");
                return (
                  <div key={att.id} className="border border-border rounded-lg overflow-hidden bg-muted/20 group">
                    {isImg ? (
                      <button
                        onClick={() => setLightboxUrl(att.file_url)}
                        className="block w-full aspect-square bg-muted overflow-hidden"
                      >
                        <img src={att.file_url} alt={att.file_name} className="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" />
                      </button>
                    ) : (
                      <div className="aspect-square bg-muted flex items-center justify-center">
                        <FileText size={36} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="p-2 flex items-center gap-1">
                      <span className="flex-1 text-[11px] truncate" title={att.file_name}>{att.file_name}</span>
                      <a
                        href={att.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={att.file_name}
                        className="p-1 rounded hover:bg-muted text-primary"
                        title="تنزيل"
                      >
                        <Download size={13} />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div></article>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white p-2 rounded-full bg-white/10 hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
          >
            <XCircle size={24} />
          </button>
          <img src={lightboxUrl} alt="معاينة" className="max-w-full max-h-full object-contain" />
        </div>
      )}
      </div>

      {/* Status Change Dialog */}
      <Dialog open={showStatusChange} onOpenChange={setShowStatusChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center bg-purple-600 text-white -m-6 mb-4 py-3 rounded-t-lg">تغيير الوضع</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir="rtl">
            <div>
              <label className="text-sm text-muted-foreground block mb-1 text-right">اجعلها كـ</label>
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                className="w-full bg-muted rounded-lg px-3 py-2 text-sm border border-border">
                <option value="draft">عرض سعر</option>
                <option value="sent">مرسل</option>
                <option value="accepted">مقبول</option>
                <option value="rejected">مرفوض</option>
              </select>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <Button onClick={handleStatusChange} className="bg-purple-600 hover:bg-purple-700 text-white px-8">تغيير الوضع</Button>
              <Button variant="outline" onClick={() => setShowStatusChange(false)} className="px-8">إغلاق</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Advance Payment (عربون) Dialog */}
      <Dialog open={showAdvancePayment} onOpenChange={setShowAdvancePayment}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center bg-purple-600 text-white -m-6 mb-4 py-3 rounded-t-lg">
              تسجيل دفعة مقدمة (عربون)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3" dir="rtl">
            <div className="grid grid-cols-2 gap-2 text-xs bg-muted/50 rounded-lg p-2">
              <div>إجمالي العرض: <b>{Number(quote?.total || 0).toLocaleString()}</b></div>
              <div>المدفوع: <b className="text-emerald-600">{totalAdvancePaid.toLocaleString()}</b></div>
              <div className="col-span-2">المتبقي: <b className="text-amber-600">{remainingAfterAdvance.toLocaleString()}</b></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground block mb-1 text-right">المبلغ *</label>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="w-full bg-muted rounded-lg px-3 py-2 text-sm border border-border" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1 text-right">التاريخ</label>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                  className="w-full bg-muted rounded-lg px-3 py-2 text-sm border border-border" />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1 text-right">طريقة الدفع</label>
              <select value={payMethod} onChange={e => { setPayMethod(e.target.value); setPayAccount(""); setPayRef(""); }}
                className="w-full bg-muted rounded-lg px-3 py-2 text-sm border border-border">
                <option value="">اختر طريقة الدفع</option>
                <option value="cash">نقدي</option>
                <option value="bank">تحويل بنكي</option>
                <option value="card">بطاقة</option>
                <option value="check">شيك</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1 text-right">
                {isBankMethod(payMethod) ? "الحساب البنكي *" : "الحساب"}
              </label>
              <select value={payAccount} onChange={e => setPayAccount(e.target.value)}
                className="w-full bg-muted rounded-lg px-3 py-2 text-sm border border-border">
                <option value="">اختر الحساب</option>
                {filterAccountsForPayment(accounts as any[], payMethod).map((a: any) => {
                  const flagged = isBankMethod(payMethod) && !isAllowedBank(a);
                  return (
                    <option key={a.id} value={a.id} disabled={flagged}>
                      {a.is_default ? "★ " : ""}{a.name}
                      {a.bank_name ? ` — ${a.bank_name}` : ""}
                      {a.account_number ? ` / ${a.account_number}` : ""}
                      {flagged ? " (بنك غير معتمد)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            {isBankMethod(payMethod) && (
              <div>
                <label className="text-sm text-muted-foreground block mb-1 text-right">رقم العملية / الإشعار البنكي (اختياري)</label>
                <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)}
                  placeholder="مثال: 12345678"
                  className="w-full bg-muted rounded-lg px-3 py-2 text-sm border border-border" />
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground block mb-1 text-right">ملحوظة</label>
              <input type="text" value={payNote} onChange={e => setPayNote(e.target.value)}
                className="w-full bg-muted rounded-lg px-3 py-2 text-sm border border-border" />
            </div>
            {advancePayments.length > 0 && (
              <div className="border-t border-border pt-2">
                <div className="text-xs text-muted-foreground mb-1">العرابين السابقة:</div>
                <ul className="text-xs space-y-1 max-h-24 overflow-auto">
                  {advancePayments.map((t) => (
                    <li key={t.id} className="flex justify-between bg-muted/40 rounded px-2 py-1">
                      <span>{t.date}</span>
                      <b>{Number(t.amount).toLocaleString()}</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-3 justify-center pt-2">
              <Button onClick={handleAdvancePayment} disabled={savingPayment} className="bg-purple-600 hover:bg-purple-700 text-white px-8">
                {savingPayment ? "..." : "حفظ الدفعة"}
              </Button>
              <Button variant="outline" onClick={() => setShowAdvancePayment(false)} className="px-8">إغلاق</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {quote?.id && (
        <>
          <PackagingDialog
            open={packagingDialogOpen}
            onOpenChange={setPackagingDialogOpen}
            parentType="quote"
            parentId={quote.id}
          />
          <TransportDialog
            open={transportDialogOpen}
            onOpenChange={setTransportDialogOpen}
            parentType="quote"
            parentId={quote.id}
            customerId={quote.customer_id || null}
            showAllReady={true}
          />
        </>
      )}

      {/* Click outside to close menus */}
      {(showWhatsappMenu || showPrintMenu || showAdditionalMenu) && (
        <div className="fixed inset-0 z-40" onClick={() => { setShowWhatsappMenu(false); setShowPrintMenu(false); setShowAdditionalMenu(false); }} />
      )}
      {ConvertedDialog}
    </div>
  );
}
