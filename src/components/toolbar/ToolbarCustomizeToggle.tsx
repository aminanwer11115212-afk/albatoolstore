import { Settings2, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useToolbarCustomization } from "./ToolbarCustomizationContext";

interface Props {
  className?: string;
  style?: React.CSSProperties;
  showReset?: boolean;
  /** Force-show the toggle even though it's hidden globally by default. */
  forceShow?: boolean;
}

const baseBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  height: 28,
  padding: "0 10px",
  borderRadius: 4,
  border: "1px solid hsl(var(--border))",
  fontSize: 12,
  cursor: "pointer",
};

/**
 * زر "تخصيص / تم" قابل للاستخدام مستقلاً (مثلاً ضمن FreePositionToolbar).
 *
 * - في الوضع العادي: نقرة واحدة تفعّل وضع التخصيص.
 * - في وضع التخصيص: نقرة واحدة لا تفعل شيئًا (حتى لا تتعارض مع السحب)،
 *   والخروج يكون بالنقر المزدوج (onDoubleClick) أو بمفتاح Escape.
 */
export function CustomizeButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const ctx = useToolbarCustomization();
  if (!ctx) return null;
  const { customizing, toggleCustomizing } = ctx;

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        // فقط نقرة واحدة تُفعّل التخصيص. أثناء التخصيص: تجاهَل النقرة المفردة.
        if (!customizing) toggleCustomizing();
      }}
      onDoubleClick={() => {
        // نقرة مزدوجة تخرج من وضع التخصيص.
        if (customizing) toggleCustomizing();
      }}
      style={{
        ...baseBtn,
        background: customizing ? "#22c55e" : "hsl(var(--card))",
        color: customizing ? "#fff" : "hsl(var(--foreground))",
        ...style,
      }}
      title={customizing ? "اضغط مرتين للخروج من وضع التخصيص" : "تخصيص ترتيب الأزرار"}
    >
      {customizing ? (
        <>
          <Check size={14} /> تم
        </>
      ) : (
        <>
          <Settings2 size={14} /> تخصيص
        </>
      )}
    </button>
  );
}

/** زر إعادة الترتيب الافتراضي لكل أشرطة الأدوات في الصفحة. */
export function ResetDefaultsButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const ctx = useToolbarCustomization();
  if (!ctx) return null;
  const { resetAll } = ctx;

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        toast("إعادة ترتيب الأزرار للافتراضي؟", {
          description: "سيتم إعادة كل أشرطة الأدوات في هذه الصفحة إلى وضعها الأصلي.",
          action: {
            label: "تأكيد",
            onClick: () => { resetAll(); toast.success("تمت إعادة الترتيب إلى الافتراضي"); },
          },
          cancel: { label: "إلغاء", onClick: () => {} },
        });
      }}
      style={{
        ...baseBtn,
        background: "hsl(var(--card))",
        color: "hsl(var(--foreground))",
        ...style,
      }}
      title="إعادة ترتيب كل أشرطة الأدوات في هذه الصفحة إلى الافتراضي"
    >
      <RotateCcw size={14} /> إعادة الافتراضي
    </button>
  );
}

/**
 * مكوّن مُجمَّع للتوافق الخلفي (يَجمع الزرّين). الصفحات الجديدة تُفضّل استخدام
 * `CustomizeButton` و `ResetDefaultsButton` منفصلين داخل FreePositionToolbar.
 */
export default function ToolbarCustomizeToggle({ className, style, showReset = true, forceShow = false }: Props) {
  const ctx = useToolbarCustomization();
  if (!forceShow || !ctx) return null;

  return (
    <div className={className} style={{ display: "inline-flex", alignItems: "center", gap: 6, ...style }}>
      {showReset && <ResetDefaultsButton />}
      <CustomizeButton />
    </div>
  );
}
