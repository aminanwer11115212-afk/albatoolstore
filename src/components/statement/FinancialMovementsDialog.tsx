import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Trash2, Search, Lock } from "lucide-react";
import {
  actionableMovements,
  movementCapabilities,
  BLOCK_MESSAGE,
  type LedgerTx,
} from "@/utils/ledgerEntryActions";

/**
 * نافذة «الحركات المالية القابلة للتعديل».
 *
 * بعد أن صار كشف الحساب جدولاً مسطّحاً للعميل (فاتورة + شحن رصيد فقط)، لم يعد
 * فيه مكان لأزرار التعديل والحذف — وهي عمليات إدارية لا تخصّ العميل. هذه
 * النافذة تجمعها في مكان واحد مختصر: كل حركة سطر واحد بملخّصها وزرَّيها.
 *
 * **لا تقرّر النافذة شيئاً بنفسها**: كل ما يظهر أو يُمنع مصدره
 * `movementCapabilities` وحدها، وهي المطابِقة لحرّاس الـRPC في القاعدة. فلا
 * يظهر زر يفشل عند الضغط، ولا يُحجب فعل تسمح به القاعدة. وما مُنع يُعرض
 * مقفلاً بسببه مكتوباً بدل أن يختفي بلا تفسير.
 */

const fmt = (n: number) => Math.abs(Number(n || 0)).toLocaleString();

export interface Props {
  open: boolean;
  transactions: LedgerTx[];
  /** رقم الفاتورة من مُعرِّفها — لعرض ارتباط الحركة */
  invoiceNumberById: Map<string, string>;
  /** اسم الحساب/الطريقة — نصّ جاهز للعرض */
  accountLabel: (t: LedgerTx) => string;
  onClose: () => void;
  onEdit: (t: LedgerTx) => void;
  onDelete: (t: LedgerTx) => void;
}

type FilterKey = "all" | "payments" | "charges" | "blocked";

const FILTERS: Array<[FilterKey, string]> = [
  ["all", "الكل"],
  ["payments", "الدفعات"],
  ["charges", "شحنات الرصيد"],
  ["blocked", "المقفلة"],
];

export default function FinancialMovementsDialog({
  open, transactions, invoiceNumberById, accountLabel, onClose, onEdit, onDelete,
}: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  // كل الحركات مع قدراتها — تشمل المقفلة حتى يرى المستخدم سببها بدل أن تختفي.
  const rows = useMemo(() => {
    const actionable = actionableMovements(transactions);
    const actionableIds = new Set(actionable.map((r) => r.tx.id));
    const blocked = transactions
      .filter((t) => !actionableIds.has(t.id))
      .map((tx) => ({ tx, caps: movementCapabilities(tx, transactions) }))
      // «أخرى» ليست حركة حساب عميل أصلاً — لا معنى لعرضها مقفلة
      .filter(({ caps }) => caps.kind !== "other")
      .sort((a, b) => String(b.tx.date || "").localeCompare(String(a.tx.date || "")));
    return [...actionable, ...blocked];
  }, [transactions]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(({ tx, caps }) => {
      if (filter === "payments" && !caps.kind.startsWith("payment")) return false;
      if (filter === "charges" && !caps.kind.startsWith("credit")) return false;
      if (filter === "blocked" && (caps.canEdit || caps.canDelete)) return false;
      if (!q) return true;
      const invNo = tx.reference_id ? invoiceNumberById.get(String(tx.reference_id)) || "" : "";
      return [tx.date, caps.label, invNo, tx.description, String(tx.amount ?? "")]
        .join(" ").toLowerCase().includes(q);
    });
  }, [rows, filter, search, invoiceNumberById]);

  const counts = useMemo(() => {
    const editable = rows.filter((r) => r.caps.canEdit).length;
    const deletable = rows.filter((r) => r.caps.canDelete).length;
    return { editable, deletable, locked: rows.length - Math.max(editable, deletable) };
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[88vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="text-base font-bold">الحركات المالية</DialogTitle>
          <p data-testid="movements-counts" className="text-xs text-muted-foreground mt-1">
            {counts.editable} قابلة للتعديل · {counts.deletable} قابلة للحذف
            {counts.locked > 0 ? ` · ${counts.locked} مقفلة` : ""}
          </p>
        </DialogHeader>

        <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-2">
          {/* على الشاشات الضيقة يأخذ البحث سطره كاملاً — مشاركته السطر مع
              أربع أزرار تصفية تعصره حتى يختفي نصّ التلميح */}
          <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[180px]">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالمبلغ أو رقم الفاتورة أو البيان"
              aria-label="بحث في الحركات"
              className="w-full bg-muted rounded pr-7 pl-2 py-1.5 text-xs text-foreground border border-border outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex gap-1">
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`px-2.5 py-1 text-xs font-semibold rounded border transition-colors ${
                  filter === key
                    ? "bg-primary/10 border-primary text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {visible.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">لا توجد حركات مطابقة</p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map(({ tx, caps }) => {
                const invNo = tx.reference_id
                  ? invoiceNumberById.get(String(tx.reference_id)) || null
                  : null;
                const amt = Number(tx.amount || 0);
                const locked = !caps.canEdit && !caps.canDelete;
                return (
                  <li
                    key={tx.id}
                    data-movement-id={tx.id}
                    data-locked={locked ? "true" : "false"}
                    className={`px-5 py-3 flex items-center gap-3 ${locked ? "bg-muted/30" : "hover:bg-muted/40"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{caps.label}</span>
                        <span className={`tabular-nums font-bold text-sm ${amt < 0 ? "text-amber-700" : "text-foreground"}`}>
                          {fmt(amt)}
                        </span>
                        {invNo && (
                          <span className="text-[11px] text-muted-foreground">فاتورة {invNo}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {tx.date} · {accountLabel(tx)}
                        {tx.description ? ` · ${tx.description}` : ""}
                      </div>
                      {locked && caps.deleteBlockedBy && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-500 mt-1 flex items-start gap-1">
                          <Lock size={11} className="mt-0.5 shrink-0" />
                          <span>{BLOCK_MESSAGE[caps.deleteBlockedBy]}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={!caps.canEdit}
                        onClick={() => onEdit(tx)}
                        title={caps.canEdit ? "تعديل" : BLOCK_MESSAGE[caps.editBlockedBy!]}
                        aria-label={`تعديل ${caps.label}`}
                        className="p-1.5 rounded text-primary hover:bg-primary/10 disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        disabled={!caps.canDelete}
                        onClick={() => onDelete(tx)}
                        title={caps.canDelete ? "حذف" : BLOCK_MESSAGE[caps.deleteBlockedBy!]}
                        aria-label={`حذف ${caps.label}`}
                        className="p-1.5 rounded text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border text-[11px] text-muted-foreground">
          سداد الفاتورة من الرصيد يُعكَس بحذف شحنته أو بإلغاء الدفعة — لا يُحذف قيد
          الاستهلاك وحده حتى لا يبقى نصف عملية بلا نصفها الآخر.
        </div>
      </DialogContent>
    </Dialog>
  );
}

