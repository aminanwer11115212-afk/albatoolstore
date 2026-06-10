/**
 * DispatchEntitiesBar — شريط علوي في صفحة الترحيلات
 * يعرض عدد الناقلين والوجهات ويتيح إضافتهم سريعاً بدون مغادرة الصفحة.
 */
import { useState } from "react";
import { Truck, MapPin, Plus } from "lucide-react";
import { useTransporters, useDestinations } from "@/hooks/useData";
import QuickAddTransporterDialog from "./QuickAddTransporterDialog";
import QuickAddDestinationDialog from "./QuickAddDestinationDialog";

export default function DispatchEntitiesBar() {
  const { data: transporters } = useTransporters();
  const { data: destinations } = useDestinations();
  const [trOpen, setTrOpen] = useState(false);
  const [dsOpen, setDsOpen] = useState(false);

  const tCount = (transporters as any[] | undefined)?.length ?? 0;
  const dCount = (destinations as any[] | undefined)?.length ?? 0;

  return (
    <div dir="rtl" className="deb-wrap">
      <style>{`
        .deb-wrap {
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
          margin-bottom: 10px;
        }
        @media (max-width: 640px) {
          .deb-wrap { grid-template-columns: 1fr; }
        }
        .deb-card {
          display: flex; align-items: center; justify-content: space-between;
          gap: 10px;
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 10px;
          padding: 10px 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.03);
        }
        .deb-info { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .deb-icon {
          width: 36px; height: 36px; border-radius: 8px;
          display: inline-flex; align-items: center; justify-content: center;
          background: hsl(var(--primary) / 0.1);
          color: hsl(var(--primary));
        }
        .deb-title { font-size: 12px; font-weight: 800; color: hsl(var(--foreground)); }
        .deb-meta { font-size: 11px; color: hsl(var(--muted-foreground)); margin-top: 2px; }
        .deb-meta b { color: hsl(var(--primary)); font-variant-numeric: tabular-nums; }
        .deb-btn {
          min-height: 40px; padding: 0 12px; border-radius: 8px;
          background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
          border: none; font-size: 12px; font-weight: 800; cursor: pointer;
          display: inline-flex; align-items: center; gap: 5px;
          transition: opacity 0.15s;
        }
        .deb-btn:hover { opacity: 0.9; }
      `}</style>

      <div className="deb-card">
        <div className="deb-info">
          <div className="deb-icon"><Truck size={18} /></div>
          <div>
            <div className="deb-title">الناقلون</div>
            <div className="deb-meta"><b>{tCount}</b> ناقل مُسجَّل</div>
          </div>
        </div>
        <button type="button" className="deb-btn" onClick={() => setTrOpen(true)}>
          <Plus size={14} /> إضافة ناقل
        </button>
      </div>

      <div className="deb-card">
        <div className="deb-info">
          <div className="deb-icon"><MapPin size={18} /></div>
          <div>
            <div className="deb-title">الوجهات</div>
            <div className="deb-meta"><b>{dCount}</b> وجهة مُسجَّلة</div>
          </div>
        </div>
        <button type="button" className="deb-btn" onClick={() => setDsOpen(true)}>
          <Plus size={14} /> إضافة وجهة
        </button>
      </div>

      <QuickAddTransporterDialog open={trOpen} onOpenChange={setTrOpen} />
      <QuickAddDestinationDialog open={dsOpen} onOpenChange={setDsOpen} />
    </div>
  );
}
