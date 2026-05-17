import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Check } from "lucide-react";

export interface StatusOption {
  value: string;
  label: string;
  /** Tailwind background color, e.g. "#eab308" or hsl(...) */
  color: string;
  icon?: React.ComponentType<{ size?: number }>;
}

interface Props {
  statuses: StatusOption[];
  current: string;
  onChange: (newValue: string) => void;
  disabled?: boolean;
  disabledTitle?: string;
}

/**
 * Compact status pill button used in form toolbars (Quote / Invoice / Purchase / Stock-Return).
 * Shows the current status label and opens a dropdown of all options.
 */
export default function StatusButton({
  statuses,
  current,
  onChange,
  disabled,
  disabledTitle,
}: Props) {
  const active =
    statuses.find((s) => s.value === current) || statuses[0];
  const Icon = active?.icon;
  const bg = active?.color || "#64748b";

  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 4,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    height: 30,
    lineHeight: 1,
    whiteSpace: "nowrap",
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
    opacity: disabled ? 0.55 : 1,
  };

  if (disabled) {
    return (
      <button type="button" style={baseStyle} title={disabledTitle || "غير متاح"} disabled>
        {Icon ? <Icon size={14} /> : null}
        {active?.label || "—"}
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" style={baseStyle} title="تغيير الحالة">
          {Icon ? <Icon size={14} /> : null}
          {active?.label || "—"}
          <ChevronDown size={12} style={{ opacity: 0.85 }} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {statuses.map((s) => {
          const SIcon = s.icon;
          const isActive = s.value === current;
          return (
            <DropdownMenuItem
              key={s.value}
              onClick={() => onChange(s.value)}
              className="cursor-pointer flex items-center gap-2"
            >
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: s.color,
                }}
              />
              {SIcon ? <SIcon size={14} /> : null}
              <span className="flex-1">{s.label}</span>
              {isActive && <Check size={14} className="opacity-70" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Quote lifecycle (4 statuses). Setting "accepted" auto-converts to invoice. */
export const QUOTE_STATUS_OPTIONS: StatusOption[] = [
  { value: "draft",    label: "عرض سعر", color: "#6b7280" },
  { value: "sent",     label: "مرسل",  color: "#3b82f6" },
  { value: "accepted", label: "مقبول", color: "#16a34a" },
  { value: "rejected", label: "مرفوض", color: "#ef4444" },
];

/** Kept for backward-compat imports; the financial status button is no longer rendered. */
export const INVOICE_STATUS_OPTIONS: StatusOption[] = [
  { value: "new",        label: "جديد",                 color: "#6b7280" },
  { value: "preparing",  label: "قيد التجهيز",          color: "#eab308" },
  { value: "in_transit", label: "في الطريق للترحيلات", color: "#a855f7" },
  { value: "done",       label: "تم",                   color: "#16a34a" },
];

/** Invoice workflow (4 statuses only). */
export const WORKFLOW_STATUS_OPTIONS: StatusOption[] = [
  { value: "new",        label: "جديد",                 color: "#6b7280" },
  { value: "preparing",  label: "قيد التجهيز",          color: "#eab308" },
  { value: "in_transit", label: "في الطريق للترحيلات", color: "#a855f7" },
  { value: "done",       label: "تم",                   color: "#16a34a" },
];

export const PURCHASE_STATUS_OPTIONS: StatusOption[] = [
  { value: "pending", label: "قيد الانتظار", color: "#eab308" },
  { value: "completed", label: "مكتمل", color: "#16a34a" },
  { value: "cancelled", label: "ملغى", color: "#ef4444" },
];

export const STOCK_RETURN_STATUS_OPTIONS: StatusOption[] = [
  { value: "pending", label: "قيد المراجعة", color: "#eab308" },
  { value: "approved", label: "معتمد", color: "#16a34a" },
  { value: "rejected", label: "مرفوض", color: "#dc2626" },
  { value: "cancelled", label: "ملغى", color: "#6b7280" },
];
