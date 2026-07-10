import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * مكوّن خصم موحّد يدعم إدخال نسبة % أو مبلغ مقطوع.
 * القيمة الرسمية = مبلغ نهائي (amount). تُشتقّ النسبة من grandBeforeDiscount عند العرض.
 * تصميم tokens فقط (RTL). قابل للتضمين في الشريط الجانبي أو داخل الحوارات.
 */
export interface DiscountInputProps {
  /** المبلغ النهائي للخصم بالعملة */
  value: number;
  onChange: (nextAmount: number) => void;
  /** الإجمالي قبل الخصم — لحساب/تفسير النسبة */
  grandBeforeDiscount: number;
  label?: string;
  className?: string;
  disabled?: boolean;
  compact?: boolean;
}

export default function DiscountInput({
  value,
  onChange,
  grandBeforeDiscount,
  label = "الخصم",
  className,
  disabled,
  compact,
}: DiscountInputProps) {
  const [amountStr, setAmountStr] = useState<string>(value ? String(value) : "");
  const [pctStr, setPctStr] = useState<string>(() =>
    grandBeforeDiscount > 0 && value > 0
      ? String(Math.round((value / grandBeforeDiscount) * 10000) / 100)
      : "",
  );

  // مزامنة عند تغيّر value من الخارج
  useEffect(() => {
    setAmountStr(value ? String(value) : "");
    setPctStr(
      grandBeforeDiscount > 0 && value > 0
        ? String(Math.round((value / grandBeforeDiscount) * 10000) / 100)
        : "",
    );
  }, [value, grandBeforeDiscount]);

  const clampAmount = (n: number) =>
    Math.max(0, Math.min(grandBeforeDiscount || Infinity, Number.isFinite(n) ? n : 0));

  return (
    <div className={className} dir="rtl">
      {label && <Label className="text-xs">{label}</Label>}
      <div className={compact ? "flex gap-2" : "grid grid-cols-2 gap-2 mt-1"}>
        <div>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="نسبة %"
            disabled={disabled}
            value={pctStr}
            onChange={(e) => {
              const raw = e.target.value;
              setPctStr(raw);
              const p = Math.max(0, Math.min(100, parseFloat(raw) || 0));
              const amt = clampAmount((grandBeforeDiscount * p) / 100);
              setAmountStr(amt ? String(Math.round(amt * 100) / 100) : "");
              onChange(Math.round(amt * 100) / 100);
            }}
            aria-label="نسبة الخصم"
          />
          <div className="text-[10px] text-muted-foreground mt-0.5">نسبة %</div>
        </div>
        <div>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="مبلغ"
            disabled={disabled}
            value={amountStr}
            onChange={(e) => {
              const raw = e.target.value;
              setAmountStr(raw);
              const a = clampAmount(parseFloat(raw) || 0);
              setPctStr(
                grandBeforeDiscount > 0 && a > 0
                  ? String(Math.round((a / grandBeforeDiscount) * 10000) / 100)
                  : "",
              );
              onChange(Math.round(a * 100) / 100);
            }}
            aria-label="مبلغ الخصم"
          />
          <div className="text-[10px] text-muted-foreground mt-0.5">مبلغ مقطوع</div>
        </div>
      </div>
    </div>
  );
}
