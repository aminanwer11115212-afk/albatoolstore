import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Download, RotateCcw, FileText } from "lucide-react";

export interface LightboxItem {
  id: string;
  file_url: string;
  file_name: string;
  file_type: string | null;
}

interface Props {
  items: LightboxItem[];
  /** فهرس المرفق المفتوح، و`null` = مغلق */
  index: number | null;
  onIndexChange: (i: number | null) => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const STEP = 0.25;

const isImage = (t: string | null | undefined) => !!t && t.startsWith("image/");

/**
 * عارض المرفقات بحجم الشاشة.
 *
 * ## العطل الذي عالجه
 * مصغّرة المرفق 48×48 بكسل — لا تكفي للتأكّد من إيصالٍ مصوَّر ولا من ورقة
 * جرد. ولم تكن قابلة للنقر أصلاً، فالسبيل الوحيد لرؤية المستند كان تنزيله
 * أو فتحه في تبويبٍ آخر ومغادرة الفاتورة. صار النقر يفتحه هنا مكبَّراً.
 *
 * التكبير بالعجلة (`Ctrl`+عجلة أو العجلة وحدها) وبالأزرار، والتنقّل بين
 * مرفقات الفئة نفسها بالسهمين، والإغلاق بـ`Escape`.
 */
export default function AttachmentLightbox({ items, index, onIndexChange }: Props) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragFrom, setDragFrom] = useState<{ x: number; y: number } | null>(null);

  const open = index != null && index >= 0 && index < items.length;
  const item = open ? items[index] : null;

  const reset = useCallback(() => { setZoom(1); setOffset({ x: 0, y: 0 }); }, []);

  // كل انتقال إلى مرفقٍ آخر يبدأ من حجمه الطبيعي — لا يرث تكبير سابقه.
  useEffect(() => { reset(); }, [index, reset]);

  const go = useCallback((delta: number) => {
    if (index == null || items.length === 0) return;
    const next = (index + delta + items.length) % items.length;
    onIndexChange(next);
  }, [index, items.length, onIndexChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onIndexChange(null); return; }
      if (e.key === "ArrowRight") { go(1); return; }
      if (e.key === "ArrowLeft") { go(-1); return; }
      if (e.key === "+" || e.key === "=") { setZoom((z) => Math.min(MAX_ZOOM, z + STEP)); return; }
      if (e.key === "-") { setZoom((z) => Math.max(MIN_ZOOM, z - STEP)); return; }
      if (e.key === "0") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go, onIndexChange, reset]);

  if (!open || !item) return null;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/90 flex flex-col"
      dir="rtl"
      onClick={() => onIndexChange(null)}
      role="dialog"
      aria-modal="true"
      aria-label="عارض المرفقات"
    >
      {/* شريط علوي */}
      <div
        className="flex items-center gap-2 px-3 py-2 text-white bg-black/60 flex-shrink-0"
        onClick={stop}
      >
        <span className="text-sm truncate flex-1" title={item.file_name}>{item.file_name}</span>
        {items.length > 1 && (
          <span className="text-xs opacity-70 tabular-nums">{index + 1} / {items.length}</span>
        )}
        <button type="button" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - STEP))}
          className="p-2 rounded hover:bg-white/15" title="تصغير" aria-label="تصغير">
          <ZoomOut size={18} />
        </button>
        <span className="text-xs w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + STEP))}
          className="p-2 rounded hover:bg-white/15" title="تكبير" aria-label="تكبير">
          <ZoomIn size={18} />
        </button>
        <button type="button" onClick={reset}
          className="p-2 rounded hover:bg-white/15" title="الحجم الطبيعي" aria-label="الحجم الطبيعي">
          <RotateCcw size={17} />
        </button>
        <a href={item.file_url} target="_blank" rel="noopener noreferrer"
          className="p-2 rounded hover:bg-white/15" title="فتح/تنزيل" aria-label="فتح أو تنزيل">
          <Download size={18} />
        </a>
        <button type="button" onClick={() => onIndexChange(null)}
          className="p-2 rounded hover:bg-white/15" title="إغلاق" aria-label="إغلاق">
          <X size={18} />
        </button>
      </div>

      {/* المحتوى */}
      <div
        className="flex-1 min-h-0 flex items-center justify-center overflow-hidden relative"
        onClick={stop}
        onWheel={(e) => {
          const dir = e.deltaY > 0 ? -STEP : STEP;
          setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + dir)));
        }}
        onPointerDown={(e) => setDragFrom({ x: e.clientX - offset.x, y: e.clientY - offset.y })}
        onPointerMove={(e) => {
          if (!dragFrom) return;
          setOffset({ x: e.clientX - dragFrom.x, y: e.clientY - dragFrom.y });
        }}
        onPointerUp={() => setDragFrom(null)}
        onPointerLeave={() => setDragFrom(null)}
        style={{ cursor: dragFrom ? "grabbing" : zoom > 1 ? "grab" : "default", touchAction: "none" }}
      >
        {items.length > 1 && (
          <>
            <button type="button" onClick={() => go(1)}
              className="absolute right-2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
              title="السابق" aria-label="المرفق السابق">
              <ChevronRight size={22} />
            </button>
            <button type="button" onClick={() => go(-1)}
              className="absolute left-2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
              title="التالي" aria-label="المرفق التالي">
              <ChevronLeft size={22} />
            </button>
          </>
        )}

        {isImage(item.file_type) ? (
          <img
            src={item.file_url}
            alt={item.file_name}
            draggable={false}
            className="max-w-full max-h-full object-contain select-none"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: "center" }}
          />
        ) : item.file_type === "application/pdf" ? (
          // الـPDF لا يُكبَّر بـtransform — يعرضه المتصفّح بأدواته داخل الإطار.
          <iframe src={item.file_url} title={item.file_name} className="w-full h-full bg-white" />
        ) : (
          <div className="text-center text-white/80 px-6">
            <FileText size={48} className="mx-auto mb-3 opacity-70" />
            <div className="text-sm mb-3">لا يمكن عرض هذا النوع داخل الصفحة</div>
            <a href={item.file_url} target="_blank" rel="noopener noreferrer"
              className="inline-block px-4 py-2 rounded bg-white/15 hover:bg-white/25 text-sm">
              فتح الملف
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
