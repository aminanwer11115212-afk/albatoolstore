import { useProducts, useCustomers, useSuppliers, useTransactions, useInvoices } from "@/hooks/useData";
import { toast } from "sonner";

function downloadCSV(data: any[], filename: string, headers: Record<string, string>) {
  if (!data || data.length === 0) { toast.error("لا توجد بيانات للتصدير"); return; }
  const keys = Object.keys(headers);
  const headerRow = Object.values(headers).join(",");
  const rows = data.map((row: any) => keys.map((k) => `"${String(row[k] || "").replace(/"/g, '""')}"`).join(","));
  const csv = "\uFEFF" + headerRow + "\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  toast.success(`تم تصدير ${data.length} سجل`);
}

export default function ExportPage() {
  const { data: products } = useProducts();
  const { data: customers } = useCustomers();
  const { data: suppliers } = useSuppliers();
  const { data: transactions } = useTransactions();
  const { data: invoices } = useInvoices();

  const exports = [
    { key: "products", title: "المنتجات", desc: `${(products || []).length} منتج`, action: () => downloadCSV(products || [], "products.csv", { name: "الاسم", sku: "الكود", sale_price: "سعر البيع", purchase_price: "سعر الشراء", stock_quantity: "الكمية", unit: "الوحدة" }) },
    { key: "customers", title: "العملاء", desc: `${(customers || []).length} عميل`, action: () => downloadCSV(customers || [], "customers.csv", { name: "الاسم", phone: "الهاتف", email: "البريد", address: "العنوان", balance: "الرصيد" }) },
    { key: "suppliers", title: "الموردون", desc: `${(suppliers || []).length} مورد`, action: () => downloadCSV(suppliers || [], "suppliers.csv", { name: "الاسم", phone: "الهاتف", email: "البريد", company: "الشركة", balance: "الرصيد" }) },
    { key: "transactions", title: "المعاملات", desc: `${(transactions || []).length} معاملة`, action: () => downloadCSV(transactions || [], "transactions.csv", { date: "التاريخ", type: "النوع", amount: "المبلغ", category: "الفئة", description: "الوصف", method: "الطريقة" }) },
    { key: "invoices", title: "الفواتير", desc: `${(invoices || []).length} فاتورة`, action: () => downloadCSV(invoices || [], "invoices.csv", { invoice_number: "رقم الفاتورة", date: "التاريخ", total: "الإجمالي", paid_amount: "المدفوع", due_amount: "المستحق", status: "الحالة" }) },
  ];

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>تصدير البيانات</h5>
        <hr />
        <table className="legacy-table">
          <thead><tr><th>النوع</th><th>عدد السجلات</th><th>إعدادات</th></tr></thead>
          <tbody>
            {exports.map((e, i) => (
              <tr key={e.key} className={i % 2 === 0 ? "odd" : "even"}>
                <td>{e.title}</td>
                <td>{e.desc}</td>
                <td><button onClick={e.action} className="btn-xs btn-success">تصدير CSV</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
