import React from "react";
import { Eye } from "lucide-react";
import { useToolbarHidden } from "./useToolbarHidden";
import { useToolbarLabels } from "./useToolbarLabels";
import { isRetiredToolbarItem } from "./retiredItems";
import type { FreeToolbarItem } from "./FreePositionToolbar";

interface Props {
  screenKey: string;
  hiddenIds: string[];
  allItems: FreeToolbarItem[];
}

/**
 * لوحة عائمة تظهر فقط في وضع التخصيص داخل FreePositionToolbar.
 * تعرض العناصر المخفية وتسمح بإعادة إظهارها.
 */
export default function HiddenItemsTray({ screenKey, hiddenIds, allItems }: Props) {
  const { show } = useToolbarHidden(screenKey);
  const { getLabel } = useToolbarLabels(screenKey);

  const itemsById = new Map(allItems.map((it) => [it.id, it]));
  // Defense-in-depth: never render restore-chips for ids that were removed
  // from the UI permanently, even if leftover hidden state still exists.
  const visibleHiddenIds = hiddenIds.filter(
    (id) => !isRetiredToolbarItem(id) && itemsById.has(id),
  );
  if (visibleHiddenIds.length === 0) return null;

  return (
    <div
      dir="rtl"
      style={{
        position: "absolute",
        bottom: 4,
        insetInlineEnd: 4,
        zIndex: 30,
        background: "hsl(var(--card))",
        border: "1px dashed hsl(var(--primary))",
        borderRadius: 6,
        padding: "4px 6px",
        fontSize: 11,
        boxShadow: "0 4px 10px hsl(var(--foreground) / 0.08)",
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        alignItems: "center",
        maxWidth: "70%",
      }}
    >
      <span style={{ fontWeight: 600, color: "hsl(var(--muted-foreground))", marginInlineEnd: 4 }}>
        المخفية:
      </span>
      {visibleHiddenIds.map((id) => {
        const it = itemsById.get(id);
        const label = getLabel(id, it?.defaultLabel || id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => show(id)}
            title="إعادة إظهار"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              height: 22,
              padding: "0 6px",
              borderRadius: 4,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--background))",
              color: "hsl(var(--foreground))",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            <Eye size={12} /> {label}
          </button>
        );
      })}
    </div>
  );
}
