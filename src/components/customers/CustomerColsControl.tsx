import { useState, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Columns3, ChevronsDown, RotateCcw, Eye, EyeOff, GripVertical } from "lucide-react";
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
 *   - إعادة ترتيب الأعمدة بالسحب والإفلات (drag & drop).
 *   - نقل عمود إلى النهاية بضغطة واحدة.
 *   - إعادة التعيين للترتيب الافتراضي (مع تأكيد قبل التنفيذ).
 */
export default function CustomerColsControl(props: {
  prefs: ReturnType<typeof useCustomerColsPref>;
}) {
  const { prefs } = props;
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const { order, hidden, moveToEnd, reorder, toggleHidden, reset, formFactor } = prefs;

  const draggingRef = useRef<CustomerColKey | null>(null);
  const [dragOver, setDragOver] = useState<{ key: CustomerColKey; before: boolean } | null>(null);

  const onDragStart = (key: CustomerColKey) => (e: React.DragEvent) => {
    draggingRef.current = key;
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", key);
    } catch {
      /* Safari sometimes throws for non-string types */
    }
  };

  const onDragOver = (key: CustomerColKey) => (e: React.DragEvent) => {
    if (!draggingRef.current || draggingRef.current === key) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    setDragOver((cur) => (cur?.key === key && cur.before === before ? cur : { key, before }));
  };

  const onDrop = (key: CustomerColKey) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = draggingRef.current;
    draggingRef.current = null;
    const before = dragOver?.key === key ? dragOver.before : true;
    setDragOver(null);
    if (!src || src === key) return;
    reorder(src, key, before);
  };

  const onDragEnd = () => {
    draggingRef.current = null;
    setDragOver(null);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            title="تخصيص الأعمدة — إظهار/إخفاء وترتيب بالسحب"
            data-testid="customer-cols-trigger"
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
              onClick={() => setConfirmReset(true)}
              title="إعادة التعيين للحالة الافتراضية"
              data-testid="customer-cols-reset"
            >
              <RotateCcw size={12} />
              افتراضي
            </Button>
          </div>

          <div
            className="max-h-[60vh] overflow-y-auto p-1.5"
            data-testid="customer-cols-list"
            data-form-factor={formFactor}
            role="listbox"
            aria-label="ترتيب أعمدة صفحة العملاء — استخدم أزرار الأسهم مع Alt للتحريك"
          >
            {order.map((key, idx) => {
              const isHidden = hidden.includes(key);
              const isLast = idx === order.length - 1;
              const isFirst = idx === 0;
              const showIndicatorBefore = dragOver?.key === key && dragOver.before;
              const showIndicatorAfter = dragOver?.key === key && !dragOver.before;
              const label = CUSTOMERS_COL_LABELS[key as CustomerColKey];
              const onRowKeyDown = (e: React.KeyboardEvent) => {
                // Alt+Up/Down = حرّك العنصر ذاته؛ Up/Down بدون Alt = انقل التركيز.
                if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                  e.preventDefault();
                  if (e.key === "ArrowUp" && !isFirst) prefs.moveUp(key as CustomerColKey);
                  if (e.key === "ArrowDown" && !isLast) prefs.moveDown(key as CustomerColKey);
                  // Move focus to follow the item.
                  requestAnimationFrame(() => {
                    const list = (e.currentTarget as HTMLElement).parentElement;
                    const nextEl = list?.querySelector<HTMLElement>(`[data-col-key="${key}"]`);
                    nextEl?.focus();
                  });
                  return;
                }
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  const list = (e.currentTarget as HTMLElement).parentElement;
                  const rows = list ? Array.from(list.querySelectorAll<HTMLElement>("[data-col-key]")) : [];
                  const cur = rows.indexOf(e.currentTarget as HTMLElement);
                  const nxt = e.key === "ArrowUp" ? cur - 1 : cur + 1;
                  if (nxt >= 0 && nxt < rows.length) rows[nxt].focus();
                  return;
                }
                if (e.key === " " || e.key === "Enter") {
                  // مسافة/إدخال على الصف = تبديل الإخفاء (تعادُل زر العين).
                  e.preventDefault();
                  toggleHidden(key as CustomerColKey);
                }
                if (e.key === "End") {
                  e.preventDefault();
                  if (!isLast) moveToEnd(key as CustomerColKey);
                }
              };
              return (
                <div
                  key={key}
                  draggable
                  tabIndex={0}
                  role="option"
                  aria-selected={!isHidden}
                  aria-label={`${label} — الموضع ${idx + 1} من ${order.length}${isHidden ? " (مخفي)" : ""}. Alt+سهم للتحريك، مسافة للإخفاء، End لجعله الأخير.`}
                  aria-grabbed={dragOver?.key === key ? true : undefined}
                  onKeyDown={onRowKeyDown}
                  onDragStart={onDragStart(key as CustomerColKey)}
                  onDragOver={onDragOver(key as CustomerColKey)}
                  onDrop={onDrop(key as CustomerColKey)}
                  onDragEnd={onDragEnd}
                  data-testid={`customer-col-row-${key}`}
                  data-col-key={key}
                  data-col-index={idx}
                  className={`relative flex items-center gap-1 px-1.5 py-1 rounded cursor-grab active:cursor-grabbing hover:bg-muted/50 outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    showIndicatorBefore ? "border-t-2 border-primary" : ""
                  } ${showIndicatorAfter ? "border-b-2 border-primary" : ""}`}
                >
                  <GripVertical size={14} className="text-muted-foreground" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => toggleHidden(key as CustomerColKey)}
                    className="p-1 hover:text-primary"
                    aria-label={isHidden ? `إظهار عمود ${label}` : `إخفاء عمود ${label}`}
                    aria-pressed={!isHidden}
                    title={isHidden ? "إظهار العمود" : "إخفاء العمود"}
                    data-testid={`customer-col-toggle-${key}`}
                  >
                    {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <div
                    className={`flex-1 text-xs ${
                      isHidden ? "line-through text-muted-foreground" : "text-foreground font-semibold"
                    }`}
                  >
                    {label}
                    <span className="ms-2 text-[10px] text-muted-foreground" aria-hidden="true">#{idx + 1}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => moveToEnd(key as CustomerColKey)}
                    disabled={isLast}
                    className="p-1 disabled:opacity-30 hover:text-primary"
                    aria-label={`نقل عمود ${label} إلى النهاية`}
                    title="اجعله آخر عمود"
                    data-testid={`customer-col-end-${key}`}
                  >
                    <ChevronsDown size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="text-[10px] text-muted-foreground p-2 border-t border-border leading-relaxed">
            اسحب أي صف لتغيير ترتيبه، أو استخدم <kbd>Alt</kbd>+<kbd>↑/↓</kbd> للتحريك بلوحة المفاتيح
            و<kbd>مسافة</kbd> للإخفاء و<kbd>End</kbd> للنقل إلى النهاية.
            التفضيلات محفوظة لك حصراً — منفصلة تماماً بين الموبايل والديسكتوب
            (الحالي: {formFactor === "mobile" ? "موبايل" : "سطح مكتب"}).
            المجموع {CUSTOMERS_MIDDLE_KEYS.length} أعمدة قابلة للتخصيص.
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إعادة تعيين تفضيلات الأعمدة؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم استرجاع الترتيب الافتراضي وإظهار جميع الأعمدة المخفية في هذا
              الجهاز ({formFactor === "mobile" ? "موبايل" : "سطح مكتب"}) فقط.
              لن تتأثر إعداداتك على الأجهزة الأخرى.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                reset();
                setConfirmReset(false);
              }}
              data-testid="customer-cols-reset-confirm"
            >
              نعم، إعادة التعيين
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
