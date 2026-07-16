import { ChevronLeft } from "lucide-react";

type Crumb = { label: string; onClick?: () => void; muted?: boolean };

export default function LocationBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="مسار الموقع" className="flex flex-wrap items-center gap-1 text-sm">
      {crumbs.map((c, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronLeft size={14} className="text-muted-foreground" />}
          {c.onClick && !c.muted ? (
            <button
              type="button"
              onClick={c.onClick}
              className="text-primary hover:underline font-medium"
            >
              {c.label}
            </button>
          ) : (
            <span className={c.muted ? "text-muted-foreground" : "text-foreground font-medium"}>{c.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
