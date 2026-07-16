import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Columns3, ArrowUp, ArrowDown, ChevronsDown, RotateCcw, Eye, EyeOff } from "lucide-react";
import {
  useCustomerColsPref,
  CUSTOMERS_MIDDLE_KEYS,
  CUSTOMERS_COL_LABELS,
  type CustomerColKey,
} from "@/hooks/useCustomerColsPref";

/**
 * زر «تخصيص الأعمدة» في صفحة إدارة العملاء.
 * يفتح لوحة تسمح بـ:
 *   - إخفاء/إظهار أي عمود (خاصية إخفاء «العنوان» تحديداً مطلوبة).
 *   - تغيير ترتيب الأعمدة (سهم لأعلى/أسفل + زر «اجعله آخر»).
 *   - إعادة التعيين للترتيب الافتراضي.
 */
export default function CustomerColsControl(props: {
  prefs: ReturnType<typeof useCustomerColsPref>;
}) {
  const { prefs } = props;
  const [open, setOpen] = useState(false);
  const { order, hidden, moveUp, moveDown, moveToEnd, toggleHidden, reset } = prefs;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1"
          title="تخصيص الأعمدة — إظهار/إخفاء وترتيب"
        >
          <Columns3 size={14} />
          <span className="text-xs">الأعمدة</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" dir="rtl">
        <div className="flex items-center justify-between p-2 border-b border-border">
          <div className="text-sm font-bold">تخصيص الأعمدة</div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={reset}
            title="إعادة التعيين"
          >
            <RotateCcw size={12} />
            افتراضي
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {order.map((key, idx) => {
            const isHidden = hidden.includes(key);
            const isFirst = idx === 0;
            const isLast = idx === order.length - 1;
            return (
              <div
                key={key}
                className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-muted/50"
              >
                <button
                  type="button"
                  onClick={() => toggleHidden(key as CustomerColKey)}
                  className="p-1 hover:text-primary"
                  title={isHidden ? "إظهار العمود" : "إخفاء العمود"}
                >
                  {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <div
                  className={`flex-1 text-xs ${
                    isHidden ? "line-through text-muted-foreground" : "text-foreground font-semibold"
                  }`}
                >
                  {CUSTOMERS_COL_LABELS[key as CustomerColKey]}
                  <span className="ms-2 text-[10px] text-muted-foreground">#{idx + 1}</span>
                </div>
                <button
                  type="button"
                  onClick={() => moveUp(key as CustomerColKey)}
                  disabled={isFirst}
                  className="p-1 disabled:opacity-30 hover:text-primary"
                  title="تحريك لأعلى"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(key as CustomerColKey)}
                  disabled={isLast}
                  className="p-1 disabled:opacity-30 hover:text-primary"
                  title="تحريك لأسفل"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveToEnd(key as CustomerColKey)}
                  disabled={isLast}
                  className="p-1 disabled:opacity-30 hover:text-primary"
                  title="اجعله آخر عمود"
                >
                  <ChevronsDown size={14} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="text-[10px] text-muted-foreground p-2 border-t border-border leading-relaxed">
          هذه التفضيلات محفوظة لك حصراً — ولا تتشارك بين الموبايل والديسكتوب.
          المجموع الكلي {CUSTOMERS_MIDDLE_KEYS.length} أعمدة قابلة للتخصيص.
        </div>
      </PopoverContent>
    </Popover>
  );
}
