import { Minus, Plus, Maximize2 } from "lucide-react";
import type { DocumentFrameFit } from "@/utils/documentFrameFit";

/**
 * أزرار تكبير ورقة المستند — للمعاينة ولرابط العميل معاً.
 *
 * طلبها صاحب المستودع بعد أن رأى رابط العميل يعرض ثُلث الورقة: «اجعل رابط
 * العميل مثل شكل المعاينة، **أكبر لأرى أوضح**».
 *
 * فالورقة تُلائم عرض الإطار أوّلاً — يراها كاملةً كما في المعاينة — ثم `+`
 * يكبّرها ليقرأ. وهي تعمل حيث لا يعمل الضغط بالأصابع: داخل إطارٍ في تطبيقٍ
 * يمنع تكبير الصفحة، وهو حال من يفتح الرابط من واتساب.
 *
 * ولا تظهر إلا حين تكون الورقة أعرض من الإطار — على الحاسوب لا معنى لها،
 * وزرٌّ بلا عملٍ ضجيج.
 */
export default function DocumentFrameZoom({
  fit,
  compact = false,
}: {
  fit: DocumentFrameFit;
  /** شريطٌ ضيّق (رابط العميل على الهاتف) — بلا نصوصٍ زائدة */
  compact?: boolean;
}) {
  if (!fit.needsFit) return null;

  const btn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#111827",
    cursor: "pointer",
    padding: 0,
  };

  return (
    <div
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      data-testid="document-frame-zoom"
    >
      <button
        type="button"
        style={btn}
        onClick={fit.zoomOut}
        title="تصغير"
        aria-label="تصغير الورقة"
        data-testid="doc-zoom-out"
      >
        <Minus size={15} />
      </button>

      <button
        type="button"
        style={{ ...btn, width: "auto", padding: "0 8px", fontSize: 11, fontWeight: 700, gap: 4 }}
        onClick={fit.resetFit}
        title="عرض الورقة كاملة"
        aria-label="ملاءمة الورقة لعرض الشاشة"
        data-testid="doc-zoom-reset"
      >
        <Maximize2 size={13} />
        {!compact && <span>ملاءمة</span>}
        <span style={{ color: "#6b7280" }}>{fit.percent}%</span>
      </button>

      <button
        type="button"
        style={btn}
        onClick={fit.zoomIn}
        title="تكبير"
        aria-label="تكبير الورقة"
        data-testid="doc-zoom-in"
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
