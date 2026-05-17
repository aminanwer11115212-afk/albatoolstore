import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings, useAccounts } from "@/hooks/useData";
import { toast } from "sonner";
import { validateBankTransferPayment, isAllowedBank, filterAccountsForPayment } from "@/lib/bankTransferValidation";
import { validatePaymentAmount, computePaymentStatus } from "@/utils/paymentValidation";
import { splitPayment } from "@/utils/overpayment";
import { generatePrintHTML, openPrintWindow } from "@/utils/printTemplate";
import { loadInvoiceExtras } from "@/utils/printExtras";
import { openWhatsAppMessage, type WhatsAppMessageType } from "@/utils/whatsapp";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PackagingDialog from "@/components/packaging/PackagingDialog";
import TransportDialog from "@/components/transport/TransportDialog";
import QuoteConversionLog from "@/components/quote/QuoteConversionLog";
import { Button } from "@/components/ui/button";
import CustomizableToolbar from "@/components/toolbar/CustomizableToolbar";
import FreePositionToolbar from "@/components/toolbar/FreePositionToolbar";
import { ToolbarCustomizationProvider } from "@/components/toolbar/ToolbarCustomizationContext";
import {
  Edit, CreditCard, Truck, Package, FileText, MessageCircle, Mail, Phone,
  Printer, Eye, RefreshCw, XCircle, Trash2, PlusCircle, ChevronDown,
  ClipboardCopy, FileCheck, Send, Copy, History, RotateCcw, MoreHorizontal
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import InvoiceRevisionsDialog from "@/components/invoice/InvoiceRevisionsDialog";
import InvoiceAttachmentsDialog from "@/components/invoice/InvoiceAttachmentsDialog";
import UnavailableItemsPanel from "@/components/invoice/UnavailableItemsPanel";
import { recordInvoiceRevision, diffRows } from "@/utils/invoiceRevisions";
import { WORKFLOW_STATUSES, type WorkflowStatus, getWorkflowStatus } from "@/components/invoice/WorkflowStatusBadge";

export default function InvoiceViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: companyArr } = useCompanySettings();
  const { data: accounts } = useAccounts();
  const company = (companyArr as any)?.[0] || null;

  const isMobile = useIsMobile();
  const [showMobileMore, setShowMobileMore] = useState(false);
  const [invoice, setInvoice] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [showPayment, setShowPayment] = useState(false);
  const [showStatusChange, setShowStatusChange] = useState(false);
  const [showWhatsappMenu, setShowWhatsappMenu] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [showAdditionalMenu, setShowAdditionalMenu] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [packagingDialogOpen, setPackagingDialogOpen] = useState(false);
  const [transportDialogOpen, setTransportDialogOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{ index: number; field: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"document" | "conversion">("document");
  const [editValue, setEditValue] = useState("");

  // Payment form
  const [payAmount, setPayAmount] = useState("");
  const [payCurrency, setPayCurrency] = useState("SDG");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payMethod, setPayMethod] = useState("");
  const [payAccount, setPayAccount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payRef, setPayRef] = useState("");
  const [lastPayment, setLastPayment] = useState<{ amount: number; at: number } | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);

  // Status change
  const [newStatus, setNewStatus] = useState("pending");

  useEffect(() => {
    loadInvoice();
  }, [id]);

  const loadInvoice = async () => {
    if (!id) return;
    setLoading(true);
    const { data: inv } = await supabase.from("invoices").select("*, customers(name, phone, email, address, balance)").eq("id", id).single();
    const { data: itms } = await supabase.from("invoice_items").select("*").eq("invoice_id", id);
    setInvoice(inv);
    setItems(itms || []);
    if (inv) {
      setPayAmount(String(inv.due_amount || inv.total || 0));
      setPayNote(`Payment for invoice #${inv.invoice_number}`);
      setNewStatus(inv.status || "pending");
    }
    setLoading(false);
  };

  const isBankMethod = (m: string) => m === "bank" || m === "bank_transfer";

  const handlePayment = async () => {
    if (!invoice) return;
    if (paySubmitting) return; // منع الإرسال المزدوج بنقر سريع

    const raw = parseFloat(String(payAmount).trim());
    if (!isFinite(raw) || raw <= 0) { toast.error("أدخل مبلغ صحيح"); return; }

    // منع تكرار نفس الدفعة خلال نافذة قصيرة
    if (lastPayment && Math.abs(lastPayment.amount - raw) <= 0.01 && Date.now() - lastPayment.at <= 3000) {
      toast.error("تم تسجيل دفعة بنفس المبلغ للتو، انتظر قليلاً");
      return;
    }

    if (isBankMethod(payMethod)) {
      const selectedAcc = (accounts as any[])?.find((a: any) => a.id === payAccount);
      const err = validateBankTransferPayment({ method: payMethod, account: selectedAcc, referenceNo: payRef });
      if (err) { toast.error(err); return; }
    }

    setPaySubmitting(true);
    const split = splitPayment({
      amount: raw,
      total: Number(invoice.total) || 0,
      alreadyPaid: Number(invoice.paid_amount) || 0,
    });
    const newSt = computePaymentStatus(split.newPaid, invoice.total || 0);
    const refSuffix = isBankMethod(payMethod) && payRef.trim() ? ` - رقم العملية: ${payRef.trim()}` : "";
    const finalNote = `${payNote || ""}${refSuffix}`.trim();

    try {
      await supabase.from("invoices").update({
        paid_amount: split.newPaid, due_amount: split.newDue, status: newSt, payment_method: payMethod || invoice.payment_method,
      }).eq("id", invoice.id);

      // 1) قيد الدفعة المطبَّقة على الفاتورة
      if (payAccount && split.applied > 0) {
        await supabase.from("transactions").insert({
          type: "income", amount: split.applied, date: payDate, description: finalNote,
          account_id: payAccount, customer_id: invoice.customer_id, reference_id: invoice.id,
        });
      }
      // 2) قيد الفائض كسلفة/دائن للعميل (يرفع رصيده الدائن تلقائياً)
      if (payAccount && split.overpay > 0) {
        const overNote = `فائض دفعة فاتورة ${invoice.invoice_number} - سلفة عميل${refSuffix}`;
        await supabase.from("transactions").insert({
          type: "income", amount: split.overpay, date: payDate, description: overNote,
          account_id: payAccount, customer_id: invoice.customer_id, reference_id: invoice.id,
          category: "customer_credit",
        } as any);
      }

      await recordInvoiceRevision({
        invoiceId: invoice.id,
        action: "payment",
        changes: { paid_amount: { before: invoice.paid_amount || 0, after: split.newPaid }, status: { before: invoice.status, after: newSt }, ...(split.overpay > 0 ? { customer_credit: { before: 0, after: split.overpay } } : {}) },
        note: `دفعة بقيمة ${raw}${split.overpay > 0 ? ` (مطبَّق ${split.applied} + سلفة ${split.overpay})` : ""} - ${payMethod || ""}${refSuffix}`,
      });

      toast.success(split.overpay > 0
        ? `تم تسجيل الدفعة: ${split.applied} على الفاتورة + ${split.overpay} كسلفة لصالح العميل`
        : "تم تسجيل الدفعة بنجاح");
      setLastPayment({ amount: raw, at: Date.now() });
      setShowPayment(false);
      setPayRef("");
      setPayAmount("");
      loadInvoice();
    } catch (e: any) { toast.error(e.message); }
    finally { setPaySubmitting(false); }
  };

  const handleConvertToReturn = async () => {
    if (!invoice || !confirm("تحويل هذه الفاتورة لمرتجع مبيعات؟")) return;
    try {
      const returnNumber = `RET-${invoice.invoice_number}-${Date.now().toString().slice(-4)}`;
      const { data: ret, error } = await supabase.from("stock_returns").insert({
        return_number: returnNumber,
        customer_id: invoice.customer_id,
        invoice_id: invoice.id,
        date: new Date().toISOString().split("T")[0],
        total: invoice.total || 0,
        reason: `تحويل من الفاتورة ${invoice.invoice_number}`,
        status: "pending",
      }).select().single();
      if (error) throw error;

      if (ret && items.length > 0) {
        await supabase.from("stock_return_items").insert(
          items.map((it: any) => ({
            stock_return_id: ret.id,
            product_id: it.product_id,
            product_name: it.product_name,
            quantity: it.quantity,
            unit_price: it.unit_price,
            total: it.total,
          }))
        );
      }

      await recordInvoiceRevision({
        invoiceId: invoice.id,
        action: "convert",
        note: `تحويل لمرتجع: ${returnNumber}`,
      });

      toast.success("تم إنشاء المرتجع");
      navigate(`/stock-returns/edit/${ret.id}`);
    } catch (e: any) { toast.error(e.message); }
    setShowAdditionalMenu(false);
  };

  const handleStatusChange = async () => {
    if (!invoice) return;
    try {
      const before = { status: invoice.status, paid_amount: invoice.paid_amount, due_amount: invoice.due_amount };
      const updates: any = { status: newStatus };
      if (newStatus === "paid") { updates.paid_amount = invoice.total; updates.due_amount = 0; }
      await supabase.from("invoices").update(updates).eq("id", invoice.id);
      await recordInvoiceRevision({
        invoiceId: invoice.id,
        action: "status_change",
        changes: diffRows(before, { ...before, ...updates }),
        note: `تغيير الحالة: ${before.status} → ${newStatus}`,
      });
      toast.success("تم تغيير الوضع");
      setShowStatusChange(false);
      loadInvoice();
    } catch (e: any) { toast.error(e.message); }
  };

  const handlePrint = async (variant: "full" | "no-account" | "account-only" | "no-details" = "full", noHeader: boolean = false) => {
    if (!invoice) return;
    // الانتقال لصفحة المعاينة الداخلية (بدلاً من فتح نافذة منبثقة)
    const qs = new URLSearchParams();
    if (variant !== "full") qs.set("variant", variant);
    if (noHeader) qs.set("noHeader", "1");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    navigate(`/preview/invoice/${invoice.id}${suffix}`);
    setShowPrintMenu(false);
    // أتمتة: عند الطباعة → الحالة تصبح "قيد التجهيز"
    try {
      await supabase.rpc("advance_invoice_workflow" as any, {
        _invoice_id: invoice.id,
        _target: "preparing",
        _reason: "طباعة الفاتورة",
      });
    } catch {}
  };

  const handleWhatsApp = (type: WhatsAppMessageType) => {
    if (!invoice?.customers?.phone) { toast.error("لا يوجد رقم هاتف للعميل"); return; }
    openWhatsAppMessage(invoice.customers.phone, type, {
      invoice_number: invoice.invoice_number, total: invoice.total || 0,
      paid_amount: invoice.paid_amount || 0, due_amount: invoice.due_amount || 0,
      date: invoice.date, customerName: invoice.customers?.name, currency: "",
    });
    setShowWhatsappMenu(false);
  };

  const handleDelete = async () => {
    if (!invoice) return;
    if (!confirm("هل أنت متأكد من حذف هذه الفاتورة؟ سيتم إرجاع الكميات إلى المخزون.")) return;
    try {
      const { deleteInvoiceWithStockRestore } = await import("@/utils/deleteInvoice");
      const { restoredStock } = await deleteInvoiceWithStockRestore(invoice.id);
      toast.success(restoredStock ? "تم حذف الفاتورة وإرجاع الكميات إلى المخزون" : "تم حذف الفاتورة");
      navigate("/invoices", { replace: true });
    } catch (e: any) {
      toast.error(e?.message || "تعذّر حذف الفاتورة");
    }
  };

  const handleCopyInvoice = async () => {
    if (!invoice) return;
    try {
      const newNumber = `${invoice.invoice_number}-COPY`;
      const { data: newInv, error } = await supabase.from("invoices").insert({
        invoice_number: newNumber, customer_id: invoice.customer_id, date: new Date().toISOString().split("T")[0],
        due_date: invoice.due_date, subtotal: invoice.subtotal,
        discount: invoice.discount, shipping: invoice.shipping, total: invoice.total,
        paid_amount: 0, due_amount: invoice.total, status: "pending", type: invoice.type,
        notes: invoice.notes, payment_method: invoice.payment_method, exchange_rate: invoice.exchange_rate,
      }).select().single();
      if (error) throw error;
      if (newInv && items.length > 0) {
        await supabase.from("invoice_items").insert(
          items.map((it: any) => ({
            invoice_id: newInv.id, product_id: it.product_id, product_name: it.product_name,
            quantity: it.quantity, unit_price: it.unit_price,
            discount: it.discount, total: it.total,
          }))
        );
      }
      toast.success("تم نسخ الفاتورة بنجاح");
      navigate(`/invoices/view/${newInv.id}`);
    } catch (e: any) { toast.error(e.message); }
    setShowAdditionalMenu(false);
  };

  const handleDeliveryNote = async () => {
    if (!invoice) return;
    const printItems = items.map((it: any) => ({
      product_name: it.product_name, quantity: it.quantity, unit_price: it.unit_price,
      tax_amount: 0, discount: 0, total: it.total,
    }));
    const extras = await loadInvoiceExtras(invoice.id);
    openPrintWindow(generatePrintHTML({
      type: "invoice", number: invoice.invoice_number, date: invoice.date,
      dueDate: invoice.due_date,
      customer: invoice.customers ? {
        name: invoice.customers.name, phone: invoice.customers.phone,
        address: invoice.customers.address, email: invoice.customers.email,
      } : null,
      items: printItems, subtotal: Number(invoice.subtotal || 0), taxTotal: 0,
      discountTotal: 0, shipping: 0, grandTotal: Number(invoice.total || 0),
      paidAmount: 0, dueAmount: 0, notes: "مذكرة تسليم",
      company: company as any, status: "delivery_note", paymentMethod: "",
      variant: "no-account", oldBalance: 0,
      customTitle: "مذكرة تسليم",
      ...extras,
    }));
    setShowAdditionalMenu(false);
  };

  const handleProformaInvoice = async () => {
    if (!invoice) return;
    const printItems = items.map((it: any) => ({
      product_name: it.product_name, quantity: it.quantity, unit_price: it.unit_price,
      tax_amount: 0,
      discount: it.discount || 0, total: it.total,
    }));
    const extras = await loadInvoiceExtras(invoice.id);
    openPrintWindow(generatePrintHTML({
      type: "invoice", number: invoice.invoice_number, date: invoice.date,
      dueDate: invoice.due_date,
      customer: invoice.customers ? {
        name: invoice.customers.name, phone: invoice.customers.phone,
        address: invoice.customers.address, email: invoice.customers.email,
      } : null,
      items: printItems, subtotal: Number(invoice.subtotal || 0), taxTotal: 0,
      discountTotal: Number(invoice.discount || 0), shipping: Number(invoice.shipping || 0),
      grandTotal: Number(invoice.total || 0), paidAmount: 0, dueAmount: Number(invoice.total || 0),
      notes: invoice.notes, company: company as any, status: "proforma", paymentMethod: "",
      variant: "full", oldBalance: 0,
      customTitle: "فاتورة أولية (Proforma)",
      ...extras,
    }));
    setShowAdditionalMenu(false);
  };

  const handlePreview = () => {
    handlePrint("full");
  };

  const handleEmail = () => {
    if (!invoice?.customers?.email) { toast.error("لا يوجد بريد إلكتروني للعميل"); return; }
    const subject = encodeURIComponent(`فاتورة رقم ${invoice.invoice_number}`);
    const body = encodeURIComponent(`عزيزي ${invoice.customers?.name || "العميل"},\n\nمرفق لكم فاتورة رقم ${invoice.invoice_number} بمبلغ ${invoice.currency_code || company?.currency || "SDG"} ${Number(invoice.total || 0).toLocaleString()}\n\nشكراً لتعاملكم معنا.`);
    window.open(`mailto:${invoice.customers.email}?subject=${subject}&body=${body}`);
  };

  const handleSMS = () => {
    if (!invoice?.customers?.phone) { toast.error("لا يوجد رقم هاتف للعميل"); return; }
    const msg = encodeURIComponent(`فاتورة رقم ${invoice.invoice_number} بمبلغ ${invoice.currency_code || company?.currency || "SDG"} ${Number(invoice.total || 0).toLocaleString()}. المبلغ المستحق: ${invoice.currency_code || company?.currency || "SDG"} ${Number(invoice.due_amount || 0).toLocaleString()}`);
    window.open(`sms:${invoice.customers.phone}?body=${msg}`);
  };

  const startEdit = (index: number, field: string, value: any) => {
    setEditingCell({ index, field });
    setEditValue(String(value));
  };

  const saveEdit = async () => {
    if (!editingCell || !invoice) return;
    const { index, field } = editingCell;
    const item = items[index];
    const val = parseFloat(editValue) || 0;
    const updates: any = { [field]: val };
    const qty = field === "quantity" ? val : item.quantity;
    const price = field === "unit_price" ? val : item.unit_price;
    const disc = field === "discount" ? val : (item.discount || 0);
    const baseTotal = qty * price;
    const afterDiscount = baseTotal - (baseTotal * disc / 100);
    updates.total = afterDiscount;
    try {
      await supabase.from("invoice_items").update(updates).eq("id", item.id);
      const newItems = items.map((it, i) => i === index ? { ...it, ...updates } : it);
      const newSubtotal = newItems.reduce((s: number, it: any) => s + (it.quantity * it.unit_price), 0);
      const newDisc = newItems.reduce((s: number, it: any) => s + (it.quantity * it.unit_price * (it.discount || 0) / 100), 0);
      const newTotal = newSubtotal - newDisc + Number(invoice.shipping || 0);
      await supabase.from("invoices").update({
        subtotal: newSubtotal, discount: newDisc, total: newTotal,
        due_amount: Math.max(0, newTotal - (invoice.paid_amount || 0)),
      }).eq("id", invoice.id);
      toast.success("تم التحديث");
      loadInvoice();
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

  const statusLabels: Record<string, { label: string; bg: string }> = {
    paid: { label: "مدفوعة", bg: "bg-emerald-500 text-white" },
    partial: { label: "جزئي", bg: "bg-blue-500 text-white" },
    pending: { label: "مستحقة", bg: "bg-amber-500 text-white" },
    overdue: { label: "متأخرة", bg: "bg-red-500 text-white" },
    cancelled: { label: "ملغاة", bg: "bg-gray-500 text-white" },
    draft: { label: "عرض سعر", bg: "bg-gray-400 text-white" },
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  if (!invoice) return (
    <div className="text-center py-20 text-muted-foreground">
      <FileText size={48} className="mx-auto mb-3 opacity-30" />
      <p>الفاتورة غير موجودة</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/invoices")}>العودة للفواتير</Button>
    </div>
  );

  const st = statusLabels[invoice.status] || statusLabels.draft;

  return (
    <div className="space-y-4" dir="rtl">
      <ToolbarCustomizationProvider storageKey="invoice-view">
      {isMobile ? (
        <div className="flex flex-wrap gap-1.5" dir="rtl">
          <Button onClick={() => setShowPayment(true)} className="bg-purple-600 hover:bg-purple-700 text-white gap-1 text-xs h-9 px-2 flex-1 min-w-[30%]"><CreditCard size={14} />دفع</Button>
          <Button onClick={() => handlePrint("full", false)} className="bg-blue-600 hover:bg-blue-700 text-white gap-1 text-xs h-9 px-2 flex-1 min-w-[30%]"><Printer size={14} />طباعة</Button>
          <Button onClick={handlePreview} variant="outline" className="gap-1 text-xs h-9 px-2 flex-1 min-w-[30%]"><Eye size={14} />معاينة</Button>
          <Button onClick={() => navigate(`/invoices/edit/${id}`)} className="bg-amber-500 hover:bg-amber-600 text-white gap-1 text-xs h-9 px-2 flex-1 min-w-[30%]"><Edit size={14} />تعديل</Button>
          <Button onClick={() => setShowAttachments(true)} variant="outline" className="gap-1 text-xs h-9 px-2 flex-1 min-w-[30%] border-primary/40 text-primary"><FileText size={14} />المستندات</Button>
          <Button onClick={() => setShowStatusChange(true)} className="bg-sky-500 hover:bg-sky-600 text-white gap-1 text-xs h-9 px-2 flex-1 min-w-[30%]"><RefreshCw size={14} />الوضع</Button>
          <Button onClick={() => setPackagingDialogOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white gap-1 text-xs h-9 px-2 flex-1 min-w-[30%]"><Package size={14} />تغليف</Button>
          <Button onClick={() => setTransportDialogOpen(true)} className="bg-green-600 hover:bg-green-700 text-white gap-1 text-xs h-9 px-2 flex-1 min-w-[30%]"><Truck size={14} />ترحيل</Button>
          <div className="relative flex-1 min-w-[30%]">
            <Button onClick={() => setShowMobileMore(!showMobileMore)} variant="outline" className="gap-1 text-xs h-9 px-2 w-full"><MoreHorizontal size={14} />المزيد</Button>
            {showMobileMore && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 py-1">
                <button onClick={() => { navigate(`/invoices/${invoice.id}/transport-report`); setShowMobileMore(false); }} className="block w-full text-right px-3 py-2 text-xs hover:bg-muted">📋 تقرير الترحيل</button>
                <button onClick={() => { navigate(`/preview/invoice/${invoice.id}/packaging`); setShowMobileMore(false); }} className="block w-full text-right px-3 py-2 text-xs hover:bg-muted">📦 تقرير التغليف</button>
                <button onClick={() => { handleDeliveryNote(); setShowMobileMore(false); }} className="block w-full text-right px-3 py-2 text-xs hover:bg-muted">📋 مذكرة تسليم</button>
                <button onClick={() => { handleProformaInvoice(); setShowMobileMore(false); }} className="block w-full text-right px-3 py-2 text-xs hover:bg-muted">📄 الفاتورة الأولية</button>
                <button onClick={() => { handleCopyInvoice(); setShowMobileMore(false); }} className="block w-full text-right px-3 py-2 text-xs hover:bg-muted">📑 Copy فاتورة</button>
                <button onClick={() => { handleConvertToReturn(); setShowMobileMore(false); }} className="block w-full text-right px-3 py-2 text-xs hover:bg-muted">🔄 تحويل لمرتجع</button>
                <button onClick={() => { setShowRevisions(true); setShowMobileMore(false); }} className="block w-full text-right px-3 py-2 text-xs hover:bg-muted">📜 سجل التعديلات</button>
              </div>
            )}
          </div>
        </div>
      ) : (
      <>
      {/* Toolbar Row 1 */}
      <CustomizableToolbar
        screenKey="invoice-view-row1"
        showControls
        className="flex flex-wrap"
        items={[
          { id: "pay", node: (
            <Button onClick={() => setShowPayment(true)} className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5 text-xs h-9">
              <CreditCard size={14} /> قم بالدفع
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
            <Button onClick={() => navigate(`/invoices/${invoice.id}/transport-report`)} variant="outline" className="gap-1.5 text-xs h-9">
              <FileText size={14} /> تقرير الترحيل
            </Button>
          )},
          { id: "packaging-report", node: (
            <Button onClick={() => navigate(`/preview/invoice/${invoice.id}/packaging`)} variant="outline" className="gap-1.5 text-xs h-9">
              <FileText size={14} /> تقرير التغليف
            </Button>
          )},
        ]}
      />

      {/* Toolbar Row 2 — free position */}
      <FreePositionToolbar
        screenKey="invoice-view-row2"
        className="flex flex-wrap"
        items={[
          { id: "print", node: (
            <Button onClick={() => handlePrint("full", false)} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs h-9">
              <Printer size={14} /> طباعة
            </Button>
          )},
          { id: "preview", node: (
            <Button onClick={handlePreview} variant="outline" className="gap-1.5 text-xs h-9">
              <Eye size={14} /> معاينة
            </Button>
          )},
          { id: "edit", node: (
            <Button onClick={() => navigate(`/invoices/edit/${id}`)} className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5 text-xs h-9">
              <Edit size={14} /> تعديل
            </Button>
          )},
          { id: "status-change", node: (
            <Button onClick={() => setShowStatusChange(true)} className="bg-sky-500 hover:bg-sky-600 text-white gap-1.5 text-xs h-9">
              <RefreshCw size={14} /> تغيير الوضع
            </Button>
          )},
          { id: "deleted-products", node: (
            <Button variant="outline" className="gap-1.5 text-xs h-9">
              <Trash2 size={14} /> المنتجات المحذوفة
            </Button>
          )},
          { id: "attachments", node: (
            <Button onClick={() => setShowAttachments(true)} variant="outline" className="gap-1.5 text-xs h-9 border-primary/40 text-primary hover:bg-primary/10">
              <FileText size={14} /> المستندات
            </Button>
          )},
          { id: "additional", node: (
            <div className="relative">
              <Button onClick={() => setShowAdditionalMenu(!showAdditionalMenu)} className="bg-green-500 hover:bg-green-600 text-white gap-1.5 text-xs h-9">
                <PlusCircle size={14} /> إضافي <ChevronDown size={12} />
              </Button>
              {showAdditionalMenu && (
                <div className="absolute top-full right-0 mt-1 bg-gradient-to-b from-cyan-400 to-cyan-600 text-white rounded-lg shadow-lg z-50 min-w-[220px] py-1">
                  <button onClick={handleDeliveryNote} className="block w-full text-right px-4 py-2 text-sm hover:bg-white/20 transition">
                    📋 مذكرة تسليم
                  </button>
                  <button onClick={handleProformaInvoice} className="block w-full text-right px-4 py-2 text-sm hover:bg-white/20 transition">
                    📄 الفاتورة الأولية
                  </button>
                  <button onClick={handleCopyInvoice} className="block w-full text-right px-4 py-2 text-sm hover:bg-white/20 transition">
                    📑 Copy فاتورة
                  </button>
                  <button onClick={handleConvertToReturn} className="block w-full text-right px-4 py-2 text-sm hover:bg-white/20 transition">
                    🔄 تحويل لمرتجع
                  </button>
                  <div className="border-t border-white/20 my-1"></div>
                  <button onClick={() => { setShowRevisions(true); setShowAdditionalMenu(false); }} className="block w-full text-right px-4 py-2 text-sm hover:bg-white/20 transition">
                    📜 سجل التعديلات
                  </button>
                </div>
              )}
            </div>
          )},
        ]}
      />
      </>
      )}
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

      {activeTab === "conversion" && invoice?.id && (
        <QuoteConversionLog mode="invoice" invoiceId={invoice.id} />
      )}

      <div hidden={activeTab !== "document"}>
      {/* Workflow Status Stepper */}
      <div className="bg-card border border-border rounded-lg p-4" dir="rtl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">حالة التجهيز</h3>
          <select
            value={invoice.workflow_status || "new"}
            onChange={async (e) => {
              const newStatus = e.target.value as WorkflowStatus;
              const before = (invoice.workflow_status || "new") as WorkflowStatus;
              if (newStatus === before) return;
              try {
                await supabase.from("invoices").update({ workflow_status: newStatus }).eq("id", invoice.id);
                if (before === "new" && newStatus !== "new") {
                  try {
                    const { data: items } = await supabase
                      .from("invoice_items")
                      .select("product_id, quantity")
                      .eq("invoice_id", invoice.id);
                    const { deductStockForInvoiceOnce } = await import("@/utils/stockDeduction");
                    await deductStockForInvoiceOnce(
                      invoice.id,
                      (items || []).map((it: any) => ({ product_id: it.product_id, quantity: it.quantity })),
                    );
                  } catch (stockErr) { console.error("[InvoiceViewPage] stock deduction failed", stockErr); }
                }
                await recordInvoiceRevision({
                  invoiceId: invoice.id,
                  action: "workflow_status_change",
                  changes: { workflow_status: { before, after: newStatus } },
                  note: `حالة التجهيز: ${getWorkflowStatus(before).label} → ${getWorkflowStatus(newStatus).label}`,
                });
                toast.success("تم تحديث حالة التجهيز");
                loadInvoice();
              } catch (err: any) { toast.error(err.message); }
            }}
            className="text-xs px-3 py-1.5 rounded-md border border-border bg-background"
          >
            {WORKFLOW_STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-2">
          {WORKFLOW_STATUSES.map((s, idx) => {
            const currentIdx = WORKFLOW_STATUSES.findIndex(w => w.value === (invoice.workflow_status || "new"));
            const isDone = idx <= currentIdx;
            const isCurrent = idx === currentIdx;
            const Icon = s.icon;
            return (
              <div key={s.value} className="flex-1 flex items-center">
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition ${
                    isCurrent ? `${s.bg} ${s.color} border-current ring-2 ring-offset-2 ring-current` :
                    isDone ? `${s.bg} ${s.color} border-current` :
                    "bg-muted text-muted-foreground border-border"
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-[11px] text-center font-medium ${isDone ? s.color : "text-muted-foreground"}`}>{s.label}</span>
                </div>
                {idx < WORKFLOW_STATUSES.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-1 ${idx < currentIdx ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Invoice Content - Legacy document look */}
      <article className="content"><div className="legacy-invoice-doc">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">فاتورة</h2>
            <p className="text-muted-foreground text-sm">SRN #{invoice.invoice_number}{invoice.tid ? ` · رقم متسلسل: ${invoice.tid}` : ""}</p>
            {invoice.is_proforma && <span className="inline-block mt-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">فاتورة أولية (Proforma)</span>}
            {invoice.parent_invoice_id && <span className="inline-block mt-1 mr-2 px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs">نسخة من فاتورة أصلية</span>}
            <p className="text-muted-foreground text-sm mt-2">مرجع:</p>
            <div className="mt-4">
              <p className="text-muted-foreground text-sm">المبلغ الإجمالي</p>
              <p className="text-2xl font-bold text-foreground">{invoice.currency_code || company?.currency || "SDG"} {Number(invoice.total || 0).toLocaleString("en", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
          <div className="text-left">
            <img src={company?.logo_url || "/images/company-logo.png"} alt="Logo" className="h-16 mb-2" />
            <div className="text-sm text-muted-foreground mt-4">
              <p className="font-medium text-foreground">فاتورة الى</p>
              <p className="text-primary font-semibold text-base">{invoice.customers?.name || "كاش"}</p>
              {invoice.customers?.address && <p>{invoice.customers.address}</p>}
              
              {invoice.customers?.email && <p>البريد الالكتروني: {invoice.customers.email}</p>}
            </div>
          </div>
        </div>

        {/* Dates */}
        <div className="flex flex-wrap gap-6 text-sm mb-6">
          <p>تاريخ الفاتورة : {invoice.date}</p>
          <p>تاريخ الانتهاء : {invoice.due_date || invoice.date}</p>
          <p>شروط : {invoice.payment_method === "cash" ? "Payment on receipt" : invoice.payment_method || "Payment on receipt"}</p>
        </div>

        {/* Status Badge + Payment Status */}
        {(() => {
          const total = Number(invoice.total || 0);
          const paid = Number(invoice.paid_amount || 0);
          // هامش تسامح 0.01 لمنع أخطاء التقريب
          const EPS = 0.01;
          const ps = paid <= EPS ? "unpaid" : (total > 0 && paid >= total - EPS ? "paid" : "partial");
          const pmeta = ps === "paid"
            ? { label: "مدفوع بالكامل", cls: "bg-green-100 text-green-700 border-green-200" }
            : ps === "partial"
            ? { label: "مدفوع جزئياً", cls: "bg-yellow-100 text-yellow-800 border-yellow-200" }
            : { label: "غير مدفوع", cls: "bg-red-100 text-red-700 border-red-200" };
          const cur = invoice.currency_code || company?.currency || "SDG";
          const fmt = (n: number) => Number(n || 0).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${st.bg}`}>{st.label}</span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium border ${pmeta.cls}`}>{pmeta.label}</span>
              <span
                className="px-3 py-1 rounded-full text-sm font-medium border bg-muted text-foreground tabular-nums"
                title="المبلغ المدفوع / الإجمالي"
              >
                المدفوع: <span className="font-bold text-green-700">{cur} {fmt(paid)}</span>
                <span className="text-muted-foreground"> / {fmt(total)}</span>
              </span>
            </div>
          );
        })()}

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
                  <td className="px-3 py-2 text-center font-semibold">{invoice.currency_code || company?.currency || "SDG"} {Number(it.total).toLocaleString("en", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-start">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">المجموع الفرعي:</span><span>{Number(invoice.subtotal || 0).toLocaleString("en", { minimumFractionDigits: 2 })}</span></div>
            {Number(invoice.tax_amount || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">الضريبة:</span><span>{Number(invoice.tax_amount).toLocaleString("en", { minimumFractionDigits: 2 })}</span></div>}
            {Number(invoice.discount || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">الخصم:</span><span className="text-destructive">-{Number(invoice.discount).toLocaleString("en", { minimumFractionDigits: 2 })}</span></div>}
            {Number(invoice.shipping || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">الشحن:</span><span>{Number(invoice.shipping).toLocaleString("en", { minimumFractionDigits: 2 })}</span></div>}
            <div className="flex justify-between border-t border-border pt-2 mt-2 font-bold text-base">
              <span>الإجمالي:</span><span className="text-primary">{invoice.currency_code || company?.currency || "SDG"} {Number(invoice.total || 0).toLocaleString("en", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-green-700"><span>المدفوع:</span><span>{Number(invoice.paid_amount || 0).toLocaleString("en", { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between text-destructive"><span>المتبقي:</span><span>{Math.max(0, Number(invoice.total || 0) - Number(invoice.paid_amount || 0)).toLocaleString("en", { minimumFractionDigits: 2 })}</span></div>
          </div>
        </div>

        <div className="mt-6">
          <UnavailableItemsPanel
            isInvoice={true}
            docId={invoice.id}
            docNumber={invoice.invoice_number}
            customerName={invoice.customers?.name}
            customerPhone={invoice.customers?.phone}
            date={invoice.date}
            company={company}
          />
        </div>

        {invoice.notes && (
          <div className="mt-6 bg-muted rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
            <p className="text-sm">{invoice.notes}</p>
          </div>
        )}
        {invoice.user_note && (
          <div className="mt-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-xs text-blue-700 dark:text-blue-300 mb-1">ملاحظة العميل (تظهر في الطباعة)</p>
            <p className="text-sm">{invoice.user_note}</p>
          </div>
        )}
        {invoice.internal_note && (
          <div className="mt-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <p className="text-xs text-amber-700 dark:text-amber-300 mb-1">🔒 ملاحظة داخلية (لا تُطبع)</p>
            <p className="text-sm">{invoice.internal_note}</p>
          </div>
        )}
      </div></article>
      </div>

      {/* Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center bg-purple-600 text-white -m-6 mb-4 py-3 rounded-t-lg">تأكيد الدفعة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir="rtl">
            <div className="flex gap-2">
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm border border-border" />
              <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                className="w-32 bg-muted rounded-lg px-3 py-2 text-sm border border-border text-left" />
              <input type="text" value={payCurrency} readOnly
                className="w-16 bg-muted rounded-lg px-3 py-2 text-sm border border-border text-center" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1 text-right">طريقة الدفع او السداد</label>
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
            <div className="flex gap-3 justify-center pt-2">
              <Button onClick={handlePayment} className="bg-purple-600 hover:bg-purple-700 text-white px-8">قم بالدفع</Button>
              <Button variant="outline" onClick={() => setShowPayment(false)} className="px-8">إغلاق</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                <option value="pending">مستحقة</option>
                <option value="paid">مدفوعة</option>
                <option value="partial">جزئي</option>
                <option value="overdue">متأخرة</option>
                <option value="cancelled">ملغاة</option>
              </select>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <Button onClick={handleStatusChange} className="bg-purple-600 hover:bg-purple-700 text-white px-8">تغيير الوضع</Button>
              <Button variant="outline" onClick={() => setShowStatusChange(false)} className="px-8">إغلاق</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revisions Dialog */}
      <InvoiceRevisionsDialog
        invoiceId={invoice?.id || null}
        open={showRevisions}
        onOpenChange={setShowRevisions}
      />

      {/* Attachments Dialog */}
      <InvoiceAttachmentsDialog
        invoiceId={invoice?.id || null}
        open={showAttachments}
        onClose={() => setShowAttachments(false)}
        onWorkflowAdvanced={loadInvoice}
      />

      {invoice?.id && (
        <>
          <PackagingDialog
            open={packagingDialogOpen}
            onOpenChange={setPackagingDialogOpen}
            parentType="invoice"
            parentId={invoice.id}
          />
          <TransportDialog
            open={transportDialogOpen}
            onOpenChange={setTransportDialogOpen}
            parentType="invoice"
            parentId={invoice.id}
            customerId={invoice.customer_id || null}
            showAllReady={true}
          />
        </>
      )}

      {/* Click outside to close menus */}
      {(showWhatsappMenu || showPrintMenu || showAdditionalMenu) && (
        <div className="fixed inset-0 z-40" onClick={() => { setShowWhatsappMenu(false); setShowPrintMenu(false); setShowAdditionalMenu(false); }} />
      )}
    </div>
  );
}
