import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RotateCw, Check, X, Square, RectangleHorizontal, Maximize2 } from "lucide-react";
import { buildCroppedFile } from "@/utils/cropImage";

type AspectPreset = "free" | "1:1" | "4:3" | "16:9";

const ASPECT_MAP: Record<AspectPreset, number | undefined> = {
  free: undefined,
  "1:1": 1,
  "4:3": 4 / 3,
  "16:9": 16 / 9,
};

export interface ImageCropDialogProps {
  open: boolean;
  file: File | null;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => void;
  defaultAspect?: AspectPreset;
  /** true = يقفل النسبة على المفضّلة ولا يعرض المبدّلات */
  lockAspect?: boolean;
  title?: string;
}

/** يقص الصورة من blob URL بحسب مساحة البكسل ثم يُرجع Blob جديد */
async function cropToBlob(
  imageSrc: string,
  areaPixels: Area,
  rotation: number,
  mime: string,
): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = imageSrc;
  });

  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bBoxWidth = img.width * cos + img.height * sin;
  const bBoxHeight = img.width * sin + img.height * cos;

  // Rotated canvas
  const rot = document.createElement("canvas");
  rot.width = bBoxWidth;
  rot.height = bBoxHeight;
  const rctx = rot.getContext("2d")!;
  rctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  rctx.rotate(rad);
  rctx.drawImage(img, -img.width / 2, -img.height / 2);

  // Crop canvas
  const out = document.createElement("canvas");
  out.width = Math.round(areaPixels.width);
  out.height = Math.round(areaPixels.height);
  const octx = out.getContext("2d")!;
  octx.drawImage(
    rot,
    areaPixels.x,
    areaPixels.y,
    areaPixels.width,
    areaPixels.height,
    0,
    0,
    areaPixels.width,
    areaPixels.height,
  );

  const outMime = mime === "image/png" ? "image/png" : "image/jpeg";
  return new Promise<Blob>((resolve, reject) =>
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("فشل توليد الصورة المقصوصة"))),
      outMime,
      0.92,
    ),
  );
}

export default function ImageCropDialog({
  open,
  file,
  onCancel,
  onConfirm,
  defaultAspect = "1:1",
  lockAspect = false,
  title = "قص الصورة",
}: ImageCropDialogProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspectKey, setAspectKey] = useState<AspectPreset>(defaultAspect);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setAspectKey(defaultAspect);
    return () => URL.revokeObjectURL(url);
  }, [open, file, defaultAspect]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!src || !areaPixels || !file) return;
    setBusy(true);
    try {
      const blob = await cropToBlob(src, areaPixels, rotation, file.type || "image/jpeg");
      const isPng = (file.type || "").includes("png");
      const ext = isPng ? "png" : "jpg";
      const base = (file.name || "image").replace(/\.[^.]+$/, "");
      const cropped = new File([blob], `${base}-cropped.${ext}`, {
        type: isPng ? "image/png" : "image/jpeg",
        lastModified: Date.now(),
      });
      onConfirm(cropped);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const aspects: { key: AspectPreset; label: string; icon: any }[] = [
    { key: "1:1", label: "مربع", icon: Square },
    { key: "4:3", label: "٤:٣", icon: RectangleHorizontal },
    { key: "16:9", label: "١٦:٩", icon: RectangleHorizontal },
    { key: "free", label: "حر", icon: Maximize2 },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-[min(720px,96vw)] p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base font-bold">{title}</DialogTitle>
        </DialogHeader>

        <div className="relative w-full h-[60vh] bg-muted">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={ASPECT_MAP[aspectKey]}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              restrictPosition={false}
              showGrid
            />
          )}
        </div>

        <div className="px-4 py-3 space-y-3 border-t border-border">
          {!lockAspect && (
            <div className="flex flex-wrap gap-1.5">
              {aspects.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAspectKey(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    aspectKey === key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-foreground border-border hover:bg-accent"
                  }`}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-14 shrink-0">تكبير</span>
              <Slider
                value={[zoom]}
                min={1}
                max={4}
                step={0.05}
                onValueChange={(v) => setZoom(v[0])}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs bg-muted text-foreground border border-border hover:bg-accent"
                title="تدوير 90°"
              >
                <RotateCw size={12} /> تدوير
              </button>
              <Slider
                value={[rotation]}
                min={0}
                max={360}
                step={1}
                onValueChange={(v) => setRotation(v[0])}
              />
              <span className="text-[10px] text-muted-foreground w-8 text-center">{rotation}°</span>
            </div>
          </div>
        </div>

        <DialogFooter className="px-4 py-3 border-t border-border flex-row-reverse gap-2 sm:justify-start">
          <Button onClick={handleConfirm} disabled={busy || !areaPixels} size="sm">
            <Check size={14} className="ml-1" />
            {busy ? "جارٍ..." : "قص واعتماد"}
          </Button>
          <Button variant="outline" onClick={onCancel} size="sm" disabled={busy}>
            <X size={14} className="ml-1" /> إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
