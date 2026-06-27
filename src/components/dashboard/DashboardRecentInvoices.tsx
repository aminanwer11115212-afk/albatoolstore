import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import WorkflowStatusBadge from "@/components/invoice/WorkflowStatusBadge";
import {
  useColumnWidths,
  useContainerFit,
  ColumnResizeHandle,
  COLS_TOAST_SAVED,
  COLS_TOAST_SAVE_FAILED,
  COLS_TOAST_EDIT_MODE,
  COLS_BTN_SAVE_LABEL,
  COLS_BTN_EDIT_LABEL,
  COLS_BTN_SAVE_TITLE,
  COLS_BTN_EDIT_TITLE,
} from "@/hooks/useColumnWidths";
import { userScopedLegacyKey } from "@/lib/userScopedKey";
import { toast } from "sonner";

interface Props {
  invoices: any[];
  isLoading: boolean;
  variant?: "regular" | "pos";
  /** أقصى عدد صفوف للعرض. الافتراضي 50. */
  limit?: number;
}

const statusStyles: Record<string, { label: string; className: string }> = {
  paid: { label: "مدفوعة", className: "bg-green-500 text-white" },
  partial: { label: "جزئي", className: "bg-indigo-500 text-white" },
  pending: { label: "غير مدفوعة", className: "bg-red-400 text-white" },
  overdue: { label: "متأخرة", className: "bg-red-600 text-white" },
  cancelled: { label: "ملغاة", className: "bg-muted text-muted-foreground" },
};

// Default column widths (px) for: الفاتورة#، العميل، حالة الدفع، التجهيز، التاريخ، المبلغ، الملاحظة
const DEFAULT_COL_WIDTHS: (number | null)[] = [56, 110, 64, 78, 64, 80, 130];

export default function DashboardRecentInvoices({ invoices, isLoading }: Props) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [colsLocked, setColsLocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = localStorage.getItem(LOCK_KEY);
    return v === null ? true : v === "true";
  });

  const { widths, minWidths, startDrag, tableProps, clampWidthsToContainer } =
    useColumnWidths(STORAGE_KEY, DEFAULT_COL_WIDTHS, colsLocked);

  useContainerFit(scrollRef, clampWidthsToContainer, { locked: colsLocked });

  const toggleLock = () => {
    try {
      const next = !colsLocked;
      localStorage.setItem(LOCK_KEY, next ? "true" : "false");
      setColsLocked(next);
      toast.success(next ? COLS_TOAST_SAVED : COLS_TOAST_EDIT_MODE);
    } catch {
      toast.error(COLS_TOAST_SAVE_FAILED);
    }
  };

  const formatDate = (d?: string | null) => {
    if (!d) return "-";
    try {
      return new Date(d).toLocaleDateString("ar-EG", { year: "2-digit", month: "2-digit", day: "2-digit" });
    } catch {
      return String(d);
    }
  };

  return (
    <Card className="flex flex-col" style={{ height: "var(--invoices-card-height, 500px)" }}>
      <CardHeader className="p-4 pb-2 border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-bold">الفواتير الأخيرة</CardTitle>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 rounded-full"
              onClick={toggleLock}
              title={colsLocked ? COLS_BTN_EDIT_TITLE : COLS_BTN_SAVE_TITLE}
            >
              {colsLocked ? COLS_BTN_EDIT_LABEL : COLS_BTN_SAVE_LABEL} الأعمدة
            </Button>
            <Button size="sm" className="text-xs h-7 rounded-full" onClick={() => navigate("/invoices/create")}>
              إضافة بيع
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 rounded-full bg-green-600 text-white border-green-600 hover:bg-green-700"
              onClick={() => navigate("/invoices")}
            >
              إدارة الفواتير
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        <div ref={scrollRef} className="overflow-auto h-full">
          <table
            className="w-full text-[10.5px]"
            style={{ tableLayout: "fixed", borderCollapse: "collapse" }}
            {...tableProps}
          >
            <colgroup>
              {DEFAULT_COL_WIDTHS.map((_, i) => {
                const w = widths[i];
                const mw = minWidths[i];
                return (
                  <col
                    key={i}
                    style={
                      w != null
                        ? { width: w }
                        : mw != null
                        ? { minWidth: mw as number }
                        : undefined
                    }
                  />
                );
              })}
            </colgroup>
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                {[
                  "الفاتورة#",
                  "العميل",
                  "حالة الدفع",
                  "التجهيز",
                  "التاريخ",
                  "المبلغ",
                  "الملاحظة",
                ].map((label, i) => (
                  <th
                    key={i}
                    className="text-right px-1.5 py-1 font-semibold text-muted-foreground text-[10px] whitespace-nowrap"
                    style={{ position: "relative", overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {label}
                    {i < DEFAULT_COL_WIDTHS.length - 1 && (
                      <ColumnResizeHandle
                        onMouseDown={(e) => startDrag(i, e)}
                        hidden={colsLocked}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-muted-foreground text-xs">
                    جاري التحميل...
                  </td>
                </tr>
              ) : (invoices || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-muted-foreground text-xs">
                    لا توجد فواتير بعد -{" "}
                    <button
                      onClick={() => navigate("/invoices/create")}
                      className="text-primary hover:underline"
                    >
                      أضف فاتورة جديدة
                    </button>
                  </td>
                </tr>
              ) : (
                (invoices || []).slice(0, 10).map((inv: any, idx: number) => {
                  const st = statusStyles[inv.status] || statusStyles.pending;
                  const note = inv.user_note || inv.notes || "";
                  const cellBase =
                    "px-1.5 py-1 text-[10.5px] text-foreground whitespace-nowrap overflow-hidden text-ellipsis";
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => navigate(`/invoices/view/${inv.id}`)}
                      className={`border-b border-border hover:bg-muted/50 transition-colors cursor-pointer ${
                        idx % 2 === 1 ? "bg-muted/10" : ""
                      }`}
                    >
                      <td className={`${cellBase} font-medium`}>{inv.invoice_number}</td>
                      <td className={cellBase} title={inv.customers?.name || inv.walk_in_customer_name || ""}>
                        {inv.customers?.name || inv.walk_in_customer_name || "-"}
                      </td>
                      <td className="px-1.5 py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                        <span
                          className={`inline-block px-1.5 py-0 rounded text-[9.5px] font-medium whitespace-nowrap ${st.className}`}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-1.5 py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                        <WorkflowStatusBadge status={inv.workflow_status} invoiceId={inv.id} />
                      </td>
                      <td className={cellBase}>{formatDate(inv.date)}</td>
                      <td className={`${cellBase} font-semibold`}>
                        {Number(inv.total || 0).toLocaleString()}
                      </td>
                      <td
                        className={cellBase}
                        title={note}
                        style={{ color: note ? undefined : "hsl(var(--muted-foreground))" }}
                      >
                        {note || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
