import { useState } from "react";
import { useAccounts, useTransactionsWithAccounts } from "@/hooks/useData";
import { Search, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import PrintVisibilityToolbar from "@/components/PrintVisibilityToolbar";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";

export default function AccountStatementPage() {
  const [selectedAccount, setSelectedAccount] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 15;
  const { data: accounts } = useAccounts();
  const { data: transactions } = useTransactionsWithAccounts();

  const filtered = (transactions || []).filter((t: any) => {
    if (selectedAccount && t.account_id !== selectedAccount) return false;
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    if (search && !t.description?.includes(search)) return false;
    return true;
  });

  const account = (accounts || []).find((a: any) => a.id === selectedAccount);
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const totalDebit = filtered.reduce((s: number, t: any) => s + Number(t.debit || 0), 0);
  const totalCredit = filtered.reduce((s: number, t: any) => s + Number(t.credit || 0), 0);

  // Running balance
  const runningBalance = Number(account?.balance || 0);

  const sections = [
    { key: "header", label: "العنوان" },
    { key: "filters", label: "الفلاتر" },
    { key: "summary", label: "ملخص الحساب" },
    { key: "table", label: "جدول المعاملات" },
  ];

  return (
    <div className="space-y-6">
      <PrintVisibilityToolbar
        storageKey="account-statement"
        containerSelector=".printable-statement"
        sections={sections}
        shareTitle={account ? `كشف حساب — ${account.name}` : "كشف حساب"}
        shareSummary={`مدين: ${totalDebit.toLocaleString()} | دائن: ${totalCredit.toLocaleString()} | الصافي: ${(totalCredit - totalDebit).toLocaleString()}`}
        pdfFilename={account ? `كشف-حساب-${account.name}` : "كشف-حساب"}
      />

      <div className="printable-statement space-y-6">
      <div data-section="header" data-section-label="العنوان" className="flex items-center gap-3">
        <FileText size={24} className="text-primary" />
        <h1 className="text-2xl font-bold text-foreground">كشف حساب</h1>
      </div>

      {/* Filters */}
      <div data-section="filters" data-section-label="الفلاتر" className="bg-card rounded-xl border border-border p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">الحساب</label>
            <select value={selectedAccount} onChange={e => { setSelectedAccount(e.target.value); setPage(1); }}
              className="w-full bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary">
              <option value="">-- جميع الحسابات --</option>
              {(accounts || []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">من تاريخ</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              className="w-full bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">إلى تاريخ</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
              className="w-full bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">بحث</label>
            <div className="flex items-center bg-muted rounded-lg px-3 py-2 border border-border">
              <Search size={16} className="text-muted-foreground ml-2" />
              <input type="text" placeholder="بحث بالوصف..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="bg-transparent border-none outline-none text-sm flex-1 text-foreground placeholder:text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>

      {/* Account Info */}
      {selectedAccount && account && (
        <div data-section="summary" data-section-label="ملخص الحساب" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <div className="text-sm text-muted-foreground">الحساب</div>
            <div className="text-lg font-bold text-foreground">{account.name}</div>
            <div className="text-xs text-muted-foreground">{account.account_number || "-"}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <div className="text-sm text-muted-foreground">إجمالي مدين</div>
            <div className="text-lg font-bold text-red-600">{totalDebit.toLocaleString()}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <div className="text-sm text-muted-foreground">إجمالي دائن</div>
            <div className="text-lg font-bold text-green-600">{totalCredit.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div data-section="table" data-section-label="جدول المعاملات" className="legacy-card card-block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted">
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">#</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">التاريخ</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الوصف</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">النوع</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">مدين</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">دائن</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الحساب</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد معاملات</td></tr>
              : paginated.map((t: any, i: number) => (
                <tr key={t.id} className="border-b border-border hover:bg-muted/50">
                  <td className="px-4 py-3 text-muted-foreground">{(page - 1) * perPage + i + 1}</td>
                  <td className="px-4 py-3 text-foreground">{t.date}</td>
                  <td className="px-4 py-3 text-foreground">{t.description || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.type === "income" ? "bg-green-100 text-green-700" : t.type === "expense" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                    }`}>{t.type === "income" ? "إيراد" : t.type === "expense" ? "مصروف" : "تحويل"}</span>
                  </td>
                  <td className="px-4 py-3 text-red-600 font-medium">{Number(t.debit || 0) > 0 ? Number(t.debit).toLocaleString() : "-"}</td>
                  <td className="px-4 py-3 text-green-600 font-medium">{Number(t.credit || 0) > 0 ? Number(t.credit).toLocaleString() : "-"}</td>
                  <td className="px-4 py-3 text-foreground">{(t.accounts as any)?.name || "-"}</td>
                </tr>
              ))}
              {filtered.length > 0 && (
                <tr className="bg-muted font-bold">
                  <td colSpan={4} className="px-4 py-3 text-foreground">الإجمالي</td>
                  <td className="px-4 py-3 text-red-600">{totalDebit.toLocaleString()}</td>
                  <td className="px-4 py-3 text-green-600">{totalCredit.toLocaleString()}</td>
                  <td className="px-4 py-3 text-foreground">{(totalCredit - totalDebit).toLocaleString()}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="p-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
            <span>عرض {Math.min((page-1)*perPage+1, filtered.length)} إلى {Math.min(page*perPage, filtered.length)} من {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-50"><ChevronRight size={16} /></button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} className={`px-3 py-1 rounded text-xs ${page === p ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{p}</button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-muted disabled:opacity-50"><ChevronLeft size={16} /></button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
