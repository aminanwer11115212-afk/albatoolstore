import { memo, useEffect, useRef, useState } from "react";
import { SUDAN_REGIONS, SUDAN_VIEWBOX, type MapRegion } from "@/data/sudanMap";

type Props = {
  selectedId?: string | null;
  onSelect: (region: MapRegion) => void;
};

function SudanMapImpl({ selectedId, onSelect }: Props) {
  const [focusIdx, setFocusIdx] = useState<number>(-1);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRefs = useRef<Array<SVGGElement | null>>([]);

  // مزامنة focus أولي مع الاختيار
  useEffect(() => {
    if (selectedId) {
      const i = SUDAN_REGIONS.findIndex(r => r.id === selectedId);
      if (i >= 0) setFocusIdx(i);
    }
  }, [selectedId]);

  useEffect(() => {
    if (focusIdx >= 0) groupRefs.current[focusIdx]?.focus();
  }, [focusIdx]);

  const showTooltipFor = (idx: number) => {
    const r = SUDAN_REGIONS[idx];
    if (!r || !svgRef.current) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    const vb = SUDAN_VIEWBOX.split(/\s+/).map(Number);
    const [, , vw, vh] = vb.length === 4 ? vb : [0, 0, 400, 500];
    const x = (r.labelXY[0] / vw) * svgRect.width;
    const y = (r.labelXY[1] / vh) * svgRect.height;
    setTooltip({ x, y, text: r.name });
  };

  const onKey = (e: React.KeyboardEvent<SVGGElement>, idx: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(SUDAN_REGIONS[idx]);
      return;
    }
    if (e.key === "Escape") {
      (e.currentTarget as SVGGElement).blur();
      setTooltip(null);
      return;
    }
    const len = SUDAN_REGIONS.length;
    let next = idx;
    if (["ArrowRight", "ArrowDown"].includes(e.key)) next = (idx + 1) % len;
    else if (["ArrowLeft", "ArrowUp"].includes(e.key)) next = (idx - 1 + len) % len;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = len - 1;
    else return;
    e.preventDefault();
    setFocusIdx(next);
    showTooltipFor(next);
  };

  return (
    <div className="relative w-full max-w-md mx-auto animate-fade-in">
      <svg
        ref={svgRef}
        viewBox={SUDAN_VIEWBOX}
        className="w-full h-auto drop-shadow-sm"
        role="group"
        aria-label="خريطة السودان — تنقّل بالأسهم، اختر بـ Enter"
      >
        <defs>
          <radialGradient id="sudan-bg" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="hsl(var(--muted))" stopOpacity="0.4" />
            <stop offset="100%" stopColor="hsl(var(--muted))" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="url(#sudan-bg)" />

        {SUDAN_REGIONS.map((r, idx) => {
          const isSelected = selectedId === r.id;
          const dim = selectedId && !isSelected;
          const isHover = hoverId === r.id;
          return (
            <g
              key={r.id}
              ref={(el) => { groupRefs.current[idx] = el; }}
              className="cursor-pointer transition-all duration-300 focus:outline-none"
              tabIndex={0}
              role="button"
              aria-label={r.name}
              aria-pressed={isSelected}
              onClick={() => onSelect(r)}
              onKeyDown={(e) => onKey(e, idx)}
              onFocus={() => { setFocusIdx(idx); showTooltipFor(idx); }}
              onBlur={() => setTooltip(null)}
              onMouseEnter={() => { setHoverId(r.id); showTooltipFor(idx); }}
              onMouseLeave={() => { setHoverId(null); setTooltip(null); }}
            >
              {/* Tooltip أصلي للـ screen readers والمتصفح */}
              <title>{r.name}</title>

              <path
                d={r.path}
                className={[
                  "transition-all duration-300",
                  isSelected
                    ? "fill-primary stroke-primary"
                    : "fill-muted hover:fill-accent stroke-border",
                  dim ? "opacity-30" : "opacity-100",
                ].join(" ")}
                strokeWidth={isHover || focusIdx === idx ? 2.5 : 1.5}
                style={{
                  filter: isSelected ? "drop-shadow(0 4px 12px hsl(var(--primary) / 0.45))" : undefined,
                }}
              />
              {/* حلقة focus مرئية */}
              {focusIdx === idx && !isSelected && (
                <path
                  d={r.path}
                  className="fill-none stroke-primary"
                  strokeWidth={3}
                  strokeDasharray="4 3"
                  pointerEvents="none"
                />
              )}
              {isSelected && (
                <path
                  d={r.path}
                  className="fill-primary animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]"
                  opacity={0.25}
                  pointerEvents="none"
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

      {/* Tooltip عائم مقروء (فوق كل شيء) */}
      {tooltip && (
        <div
          role="tooltip"
          className="absolute pointer-events-none -translate-x-1/2 -translate-y-[calc(100%+8px)] px-2.5 py-1 rounded-md bg-foreground text-background text-xs font-semibold shadow-lg animate-fade-in whitespace-nowrap z-10"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

export default memo(SudanMapImpl);
