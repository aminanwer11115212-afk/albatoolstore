import { useMemo, useState } from "react";
import { Landmark, Search } from "lucide-react";
import { useTransactionsWithAccounts } from "@/hooks/useData";
import {
  ALLOWED_BANK_KEYWORDS,
  isAllowedBank,
  isBankPaymentMethod,
} from "@/lib/bankTransferValidation";

const inputCls =
  "px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

const REF_REGEX = /(?:رقم العملية|إشعار|مرجع)\s*[:：]\s*(\S+)/;

function extractReference(description: string | null | undefined): string {
  if (!description) return "—";
  const m = description.match(REF_REGEX);
  return m?.[1] ?? "—";
}

function bankKeyOf(account: any): string | null {
  if (!isAllowedBank(account)) return null;
  const haystack = `${account.bank_name ?? ""} ${account.name ?? ""}`;
  return ALLOWED_BANK_KEYWORDS.find((kw) => haystack.includes(kw)) ?? null;
}

const TYPE_LABEL: Record<string, string> = {
  income: "إيراد",
  expense: "مصروف",
  transfer: "تحويل",
};

export default function BankTransfersReportPage() {
  const { data: transactions, isLoading } = useTransactionsWithAccounts();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const k of ALLOWED_BANK_KEYWORDS) groups[k] = [];

    for (const tx of (transactions as any[]) || []) {
      const t: any = tx;
      if (!isBankPaymentMethod(t.method)) continue;
      const bank = bankKeyOf(t.accounts);
      if (!bank) continue;
      if (from && t.date < from) continue;
      if (to && t.date > to) continue;
      if (search) {
        const s = search.toLowerCase();
        const ref = extractReference(t.description).toLowerCase();
        const hay = `${t.description ?? ""} ${t.accounts?.name ?? ""} ${ref}`.toLowerCase();
        if (!hay.includes(s)) continue;
      }
      groups[bank].push(t);
    }

    // sort each group desc by date then created_at
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1;
      });
      // cap each bank to last 100
      groups[k] = groups[k].slice(0, 100);
    }
    return groups;
  }, [transactions, search, from, to]);

  const totalCount = Object.values(grouped).reduce((s, arr) => s + arr.length, 0);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Landmark size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">تقرير التحويلات البنكية</h1>
            <p className="text-sm text-muted-foreground">
              آخر العمليات حسب البنك مع رقم العملية — إجمالي {totalCount} عملية
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="بحث في الوصف / رقم العملية / الحساب…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputCls} w-full pr-9`}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          من
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          إلى
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </label>
        {(from || to || search) && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
              setSearch("");
            }}
            className="px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted text-foreground"
          >
            مسح الفلاتر
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل…</div>
      ) : (
        <div className="space-y-5">
          {ALLOWED_BANK_KEYWORDS.map((bank) => {
            const rows = grouped[bank];
            const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
            return (
              <section key={bank} className="bg-card border border-border rounded-xl overflow-hidden">
                <header className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Landmark size={18} className="text-primary" />
                    <h2 className="font-semibold text-foreground">بنك {bank}</h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {rows.length} عملية
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    الإجمالي:{" "}
                    <span className="text-foreground font-semibold">
                      {total.toLocaleString("ar-SD", { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </header>

                {rows.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    لا توجد تحويلات
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/20 text-muted-foreground">
                        <tr>
                          <th className="text-right px-4 py-2 font-medium">التاريخ</th>
                          <th className="text-right px-4 py-2 font-medium">النوع</th>
                          <th className="text-right px-4 py-2 font-medium">المبلغ</th>
                          <th className="text-right px-4 py-2 font-medium">رقم العملية</th>
                          <th className="text-right px-4 py-2 font-medium">الحساب</th>
                          <th className="text-right px-4 py-2 font-medium">الوصف</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((t: any) => (
                          <tr key={t.id} className="border-t border-border hover:bg-muted/30">
                            <td className="px-4 py-2 text-foreground whitespace-nowrap">{t.date}</td>
                            <td className="px-4 py-2 text-foreground">{TYPE_LABEL[t.type] ?? t.type}</td>
                            <td className="px-4 py-2 text-foreground font-medium">
                              {Number(t.amount || 0).toLocaleString("ar-SD", {
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="px-4 py-2">
                              <span className="font-mono text-primary">
                                {extractReference(t.description)}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-foreground">{t.accounts?.name ?? "—"}</td>
                            <td className="px-4 py-2 text-muted-foreground max-w-[320px] truncate">
                              {t.description ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
