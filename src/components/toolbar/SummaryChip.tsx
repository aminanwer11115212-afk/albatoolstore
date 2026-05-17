import React, { useState } from "react";
import { Pencil, EyeOff, Check, X } from "lucide-react";
import { useToolbarCustomization } from "./ToolbarCustomizationContext";
import { useToolbarLabels } from "./useToolbarLabels";
import { useToolbarHidden } from "./useToolbarHidden";

interface Props {
  /** مفتاح الشاشة الحالية — يجب أن يطابق screenKey الخاص بـ FreePositionToolbar. */
  screenKey: string;
  /** معرّف فريد للعنصر داخل الشاشة. */
  id: string;
  /** التسمية الافتراضية (مثل "المجموع"). */
  defaultLabel: string;
  /** القيمة المعروضة بجانب التسمية. */
  value: React.ReactNode;
  /** نمط القيمة (للـ"المجموع" مثلاً نريد إطار أخضر مميّز). */
  valueStyle?: React.CSSProperties;
  /** يفصل التسمية عن القيمة (افتراضياً ":"). */
  separator?: string;
  /** نمط الحاوية. */
  style?: React.CSSProperties;
}

/**
 * بطاقة ملخّص قابلة للسحب داخل FreePositionToolbar.
 * - في وضع التخصيص: يظهر زر تعديل التسمية وزر الإخفاء.
 * - الإخفاء/التسميات تُحفظ لكل جهاز ولكل شاشة.
 */
function SummaryChipImpl({
  screenKey,
  id,
  defaultLabel,
  value,
  valueStyle,
  separator = ":",
  style,
}: Props) {
  const ctx = useToolbarCustomization();
  const customizing = !!ctx?.customizing;
  const { getLabel, setLabel } = useToolbarLabels(screenKey);
  const { hide } = useToolbarHidden(screenKey);

  const label = getLabel(id, defaultLabel);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  const startEdit = () => {
    setDraft(label);
    setEditing(true);
  };
  const commitEdit = () => {
    const trimmed = draft.trim();
    setLabel(id, trimmed === defaultLabel ? null : trimmed);
    setEditing(false);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft(label);
  };

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {editing ? (
        <>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              else if (e.key === "Escape") cancelEdit();
            }}
            style={{
              width: 90,
              height: 24,
              padding: "0 6px",
              fontSize: 12,
              border: "1px solid hsl(var(--primary))",
              borderRadius: 4,
              textAlign: "center",
            }}
          />
          <button
            type="button"
            onClick={commitEdit}
            title="حفظ"
            style={{ padding: 2, background: "transparent", border: 0, cursor: "pointer", color: "#16a34a" }}
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            title="إلغاء"
            style={{ padding: 2, background: "transparent", border: 0, cursor: "pointer", color: "#dc2626" }}
          >
            <X size={14} />
          </button>
        </>
      ) : (
        <>
          <span>
            {label}
            {separator}
          </span>
          <span style={valueStyle}>{value}</span>
          {customizing && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); startEdit(); }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                title="تعديل التسمية"
                style={{
                  padding: 2,
                  marginInlineStart: 2,
                  background: "transparent",
                  border: "1px dashed hsl(var(--primary))",
                  borderRadius: 4,
                  cursor: "pointer",
                  color: "hsl(var(--primary))",
                  pointerEvents: "auto",
                }}
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); hide(id); }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                title="إخفاء العنصر"
                style={{
                  padding: 2,
                  background: "transparent",
                  border: "1px dashed hsl(var(--destructive))",
                  borderRadius: 4,
                  cursor: "pointer",
                  color: "hsl(var(--destructive))",
                  pointerEvents: "auto",
                }}
              >
                <EyeOff size={12} />
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default React.memo(SummaryChipImpl);
