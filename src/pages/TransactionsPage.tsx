import { useRef, useState } from "react";
import { Search, Plus, Trash2, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { useTransactionsWithAccounts, useAccounts, useTransactions, useCustomers, useSuppliers } from "@/hooks/useData";
import { toast } from "sonner";
import { validateBankTransferPayment, isAllowedBank } from "@/lib/bankTransferValidation";
import PrintVisibilityToolbar from "@/components/PrintVisibilityToolbar";
import ReportPrintHeader from "@/components/ReportPrintHeader";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";
import EditPaymentDialog, { type EditablePayment } from "@/components/finance/EditPaymentDialog";
import { useUserRole } from "@/hooks/useUserRole";
export default function TransactionsPage() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "income", amount: "", description: "", category: "", bank_name: "", account_id: "", customer_id: "", supplier_id: "", method: "cash", reference_no: "", date: new Date().toISOString().split("T")[0], debit: "", credit: "" });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [editingPayment, setEditingPayment] = useState<EditablePayment | null>(null);
  const { isAdmin } = useUserRole();

  const { data: transactions, isLoading } = useTransactionsWithAccounts();
  const { data: accounts } = useAccounts();
  const { data: customers } = useCustomers();
  const { data: suppliers } = useSuppliers();
  const { insert, remove } = useTransactions();

  const filtered = (transactions || []).filter((t: any) => {
    return !search || startsWithAny([t.description, t.category, t.accounts?.name], search);
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const methodMap: Record<string, string> = { cash: "نقداً", bank: "تحويل بنكي" };

  // Bank accounts grouped by bank_name (for "تحويل بنكي" mode)
  const bankAccounts = (accounts || []).filter((a: any) => a.account_type === "bank" && isAllowedBank(a));
  const bankNames = Array.from(new Set(bankAccounts.map((a: any) => a.bank_name).filter(Boolean))) as string[];
  const accountsForSelectedBank = form.bank_name
    ? bankAccounts.filter((a: any) => a.bank_name === form.bank_name)
    : bankAccounts;

  const resetForm = () => setForm({ type: "income", amount: "", description: "", category: "", bank_name: "", account_id: "", customer_id: "", supplier_id: "", method: "cash", reference_no: "", date: new Date().toISOString().split("T")[0], debit: "", credit: "" });

  const handleSubmit = async () => {
    if (savingRef.current) return;
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { toast.error("الرجاء إدخال المبلغ"); return; }
    if (form.method === "bank") {
      const selectedAcc = (accounts as any[])?.find((a: any) => a.id === form.account_id);
      const err = validateBankTransferPayment({ method: "bank", account: selectedAcc, referenceNo: form.reference_no });
      if (err) { toast.error(err); return; }
    }
    // Pre-flight balance check for expense
    if (form.type === "expense" && form.account_id) {
      const acc = (accounts as any[])?.find((a: any) => a.id === form.account_id);
      const bal = Number(acc?.balance || 0);
      if (bal < amount) { toast.error(`الرصيد غير كافٍ — المتاح: ${bal.toLocaleString()}`); return; }
    }
    savingRef.current = true; setSaving(true);
    try {
      const refSuffix = form.method === "bank" && form.reference_no.trim() ? ` - رقم العملية: ${form.reference_no.trim()}` : "";
      const finalDescription = `${form.description || (form.type === "income" ? "شحن رصيد" : "خصم رصيد")}${refSuffix}`;
      await insert.mutateAsync({
        type: form.type,
        amount,
        description: finalDescription,
        category: form.category || null,
        account_id: form.account_id || null,
        customer_id: form.customer_id || null,
        supplier_id: form.supplier_id || null,
        method: form.method || null,
        date: form.date,
        debit: form.type === "income" ? amount : 0,
        credit: form.type === "expense" ? amount : 0,
      });
      toast.success("تم إضافة المعاملة");
      setShowForm(false);
      resetForm();
    } catch (e: any) { toast.error(e.message); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const inputCls = "bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary w-full";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">المعاملات</h1>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus size={16} /> معاملة جديدة
        </button>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-foreground">إضافة معاملة جديدة</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inputCls}>
              <option value="income">إيراد (مدين)</option>
              <option value="expense">مصروف (دائن)</option>
            </select>
            <input type="number" placeholder="المبلغ *" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={inputCls} />
            <input placeholder="الوصف (اختياري)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} />
            <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value, bank_name: "", account_id: "", reference_no: "" })} className={inputCls}>
              <option value="cash">نقداً</option>
              <option value="bank">تحويل بنكي</option>
            </select>

            {form.method === "bank" ? (
              <>
                <select value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value, account_id: "" })} className={inputCls}>
                  <option value="">-- اختر البنك --</option>
                  {bankNames.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })} className={inputCls} disabled={!form.bank_name && bankNames.length > 0}>
                  <option value="">-- اختر الحساب --</option>
                  {accountsForSelectedBank.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.name}{a.account_number ? ` — ${a.account_number}` : ""}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="رقم العملية (اختياري)"
                  value={form.reference_no}
                  onChange={e => setForm({ ...form, reference_no: e.target.value })}
                  className={inputCls}
                />
              </>
            ) : (
              <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })} className={inputCls}>
                <option value="">-- الحساب --</option>
                {(accounts || []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}

            <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} className={inputCls}>
              <option value="">-- دافع (عميل) --</option>
              {(customers || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input placeholder="الفئة" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputCls} />
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={inputCls} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={saving} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed">{saving ? "جارٍ الحفظ..." : "إضافة"}</button>
            <button onClick={() => setShowForm(false)} disabled={saving} className="bg-muted text-muted-foreground px-6 py-2 rounded-lg text-sm">إلغاء</button>
          </div>
        </div>
      )}

      <PrintVisibilityToolbar
        storageKey="transactions-list"
        containerSelector=".printable-statement"
        sections={[
          { key: "header", label: "الترويسة" },
          { key: "filters", label: "الفلاتر" },
          { key: "table", label: "جدول العمليات" },
        ]}
        shareTitle="تقرير المعاملات"
        shareSummary={`عدد العمليات: ${filtered.length}`}
        pdfFilename={`المعاملات-${new Date().toISOString().split("T")[0]}`}
      />

      <div className="printable-statement">
        <ReportPrintHeader
          title="تقرير المعاملات"
          periodText={`بحث: ${search || "—"} • النتائج: ${filtered.length}`}
        />

        <div className="legacy-card card-block">
          <div className="p-4 border-b border-border flex flex-wrap gap-3 items-center justify-between" data-section="filters" data-section-label="الفلاتر">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">عرض</span>
              <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }} className="bg-muted border border-border rounded px-2 py-1 text-sm text-foreground">
                <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
              </select>
            </div>
            <div className="flex items-center bg-muted rounded-lg px-3 py-2">
              <Search size={16} className="text-muted-foreground ml-2" />
              <input type="text" placeholder="بحث..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="bg-transparent border-none outline-none text-sm flex-1 text-foreground placeholder:text-muted-foreground" />
            </div>
          </div>
          <div className="overflow-x-auto" data-section="table" data-section-label="جدول العمليات">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">تاريخ</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الحساب</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">مدين</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">دائن</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">دافع</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">طريقة</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground print:hidden">الاعدادات</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
                ) : paginated.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد معاملات</td></tr>
                ) : paginated.map((t: any) => (
                  <tr key={t.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 text-foreground">{t.date}</td>
                    <td className="px-4 py-3 text-foreground">{t.accounts?.name || "-"}</td>
                    <td className="px-4 py-3 text-foreground">{Number(t.debit || (t.type === "income" ? t.amount : 0)).toLocaleString()}</td>
                    <td className="px-4 py-3 text-foreground">{Number(t.credit || (t.type === "expense" ? t.amount : 0)).toLocaleString()}</td>
                    <td className="px-4 py-3 text-foreground">{t.description || "-"}</td>
                    <td className="px-4 py-3 text-foreground">{methodMap[t.method] || t.method || "-"}</td>
                    <td className="px-4 py-3 print:hidden">
                      <div className="flex items-center gap-1">
                        <button onClick={async () => {
                          // منع الحذف الخام لمعاملات مرتبطة بفواتير/شحن رصيد لتفادي تشويش الأرصدة.
                          // القاعدة: دفعات/رصيد العملاء تُلغى من صفحة تفاصيل العميل (زر «إلغاء الشحنة»)
                          // أو بحذف الفاتورة نفسها (التي تحوّل الدفعة إلى رصيد دائن تلقائياً).
                          if (t.category === "customer_payment" || t.category === "customer_credit") {
                            toast.error("لا يمكن حذف دفعة/شحن رصيد من هنا. استخدم «إلغاء الشحنة» في تفاصيل العميل، أو احذف الفاتورة المرتبطة.", { duration: 6000 });
                            return;
                          }
                          if (t.category === "supplier_payment") {
                            toast.error("لا يمكن حذف دفعة مورد من هنا. احذفها من صفحة أوامر الشراء الخاصة بها.", { duration: 6000 });
                            return;
                          }
                          if (!confirm("حذف هذه المعاملة؟")) return;
                          try { await remove.mutateAsync(t.id); toast.success("تم الحذف"); } catch (e: any) { toast.error(e.message); }
                        }}
                          className="px-2 py-1 bg-destructive/10 text-destructive rounded text-xs hover:bg-destructive/20 inline-flex items-center gap-1 min-h-[40px]"><Trash2 size={12} /> حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground print:hidden">
            <span>عرض {Math.min((page-1)*perPage+1, filtered.length)} إلى {Math.min(page*perPage, filtered.length)} من {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-50"><ChevronRight size={16} /></button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} className={`px-3 py-1 rounded text-xs ${page === p ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{p}</button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-muted disabled:opacity-50"><ChevronLeft size={16} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
