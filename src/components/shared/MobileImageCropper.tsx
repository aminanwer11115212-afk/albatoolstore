import { useRef } from "react";
import { Cropper, ReactCropperElement } from "react-cropper";
import "cropperjs/dist/cropper.css";
import { RotateCw, FlipHorizontal, FlipVertical, X } from "lucide-react";

export interface MobileImageCropperProps {
  imageUrl: string;
  onSave: (dataUrl: string | null) => void;
  title?: string;
}

/**
 * Mobile-first fullscreen image cropper.
 * - Uses react-cropper with touch-friendly move mode.
 * - Outputs base64 JPEG via onSave; onSave(null) on close.
 */
export default function MobileImageCropper({
  imageUrl,
  onSave,
  title = "Crop Image",
}: MobileImageCropperProps) {
  const cropperRef = useRef<ReactCropperElement>(null);
  const flipHRef = useRef(1);
  const flipVRef = useRef(1);

  const getCropper = () => cropperRef.current?.cropper;

  const handleRotate = () => getCropper()?.rotate(90);
  const handleFlipH = () => {
    flipHRef.current = -flipHRef.current;
    getCropper()?.scaleX(flipHRef.current);
  };
  const handleFlipV = () => {
    flipVRef.current = -flipVRef.current;
    getCropper()?.scaleY(flipVRef.current);
  };

  const handleSave = () => {
    const cropper = getCropper();
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas({ imageSmoothingQuality: "high" });
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    onSave(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-[100] h-[100dvh] w-screen flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button
          type="button"
          onClick={() => onSave(null)}
          aria-label="إغلاق"
          className="w-10 h-10 flex items-center justify-center rounded-full text-white hover:bg-white/10 active:bg-white/20 transition-colors"
        >
          <X size={22} />
        </button>
        <div className="text-white text-base font-semibold">{title}</div>
        <div className="w-10 h-10" />
      </div>

      {/* Cropper */}
      <div className="flex-1 overflow-hidden">
        <Cropper
          src={imageUrl}
          className="w-full h-full"
          style={{ width: "100%", height: "100%" }}
          viewMode={2}
          dragMode="move"
          initialAspectRatio={NaN}
          responsive={true}
          restore={false}
          guides={true}
          center={true}
          background={false}
          highlight={false}
          autoCropArea={1}
          checkOrientation={false}
          toggleDragModeOnDblclick={false}
          ref={cropperRef}
        />
      </div>

      {/* Toolbar */}
      <div className="bg-[#1a1a1a] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0 space-y-3">
        <div className="flex items-center justify-around">
          <ToolButton icon={<RotateCw size={20} />} label="تدوير" onClick={handleRotate} />
          <ToolButton icon={<FlipHorizontal size={20} />} label="قلب أفقي" onClick={handleFlipH} />
          <ToolButton icon={<FlipVertical size={20} />} label="قلب عمودي" onClick={handleFlipV} />
        </div>
        <button
          type="button"
          onClick={handleSave}
          className="w-full min-h-[52px] rounded-xl bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-black font-bold text-base transition-colors"
        >
          قص وحفظ
        </button>
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg text-white/90 hover:bg-white/10 active:bg-white/20 transition-colors min-w-[72px]"
    >
      {icon}
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}
