import { memo } from "react";
import { SUDAN_REGIONS, type MapRegion } from "@/data/sudanMap";

type Props = {
  selectedId?: string | null;
  onSelect: (region: MapRegion) => void;
};

function SudanMapImpl({ selectedId, onSelect }: Props) {
  return (
    <div className="relative w-full max-w-md mx-auto animate-fade-in">
      <svg
        viewBox="0 0 400 500"
        className="w-full h-auto drop-shadow-sm"
        role="img"
        aria-label="خريطة السودان — اختر الاتجاه"
      >
        {/* خلفية زخرفية خفيفة */}
        <defs>
          <radialGradient id="sudan-bg" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="hsl(var(--muted))" stopOpacity="0.4" />
            <stop offset="100%" stopColor="hsl(var(--muted))" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="400" height="500" fill="url(#sudan-bg)" />

        {SUDAN_REGIONS.map((r) => {
          const isSelected = selectedId === r.id;
          const dim = selectedId && !isSelected;
          return (
            <g
              key={r.id}
              className="cursor-pointer transition-all duration-300 focus:outline-none"
              tabIndex={0}
              role="button"
              aria-label={r.name}
              aria-pressed={isSelected}
              onClick={() => onSelect(r)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(r);
                }
              }}
              style={{ transformOrigin: `${r.labelXY[0]}px ${r.labelXY[1]}px` }}
            >
              <path
                d={r.path}
                className={[
                  "transition-all duration-300",
                  isSelected
                    ? "fill-primary stroke-primary"
                    : "fill-muted hover:fill-accent stroke-border",
                  dim ? "opacity-30" : "opacity-100",
                ].join(" ")}
                strokeWidth={1.5}
                style={{
                  filter: isSelected ? "drop-shadow(0 4px 12px hsl(var(--primary) / 0.45))" : undefined,
                }}
              />
              {isSelected && (
                <path
                  d={r.path}
                  className="fill-primary animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]"
                  opacity={0.25}
                />
              )}
              <text
                x={r.labelXY[0]}
                y={r.labelXY[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                className={[
                  "select-none pointer-events-none transition-colors duration-300",
                  isSelected ? "fill-primary-foreground" : "fill-foreground",
                ].join(" ")}
                style={{ fontSize: 14, fontWeight: 700, direction: "rtl" }}
              >
                {r.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default memo(SudanMapImpl);
