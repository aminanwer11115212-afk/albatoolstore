import { useCallback, useState } from "react";
import { toast } from "sonner";
import { fetchImageAsFile } from "@/utils/fetchImageAsFile";

type CroppedHandler = (file: File) => void | Promise<void>;

interface StartOptions {
  url: string;
  name?: string;
  onCropped: CroppedHandler;
}

/**
 * يفتح ImageCropDialog على صورة موجودة (بعد الحفظ) لإعادة قصّها.
 * الاستخدام:
 *   const recrop = useRecropImage();
 *   recrop.start({ url, name, onCropped: async (file) => { ... } });
 *   ...
 *   <ImageCropDialog
 *     open={recrop.open}
 *     file={recrop.file}
 *     onCancel={recrop.cancel}
 *     onConfirm={recrop.confirm}
 *     defaultAspect="free"
 *     title="إعادة قص الصورة"
 *   />
 */
export function useRecropImage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [handler, setHandler] = useState<CroppedHandler | null>(null);

  const start = useCallback(async ({ url, name, onCropped }: StartOptions) => {
    setLoading(true);
    const tid = toast.loading("جارٍ تحميل الصورة...");
    try {
      const f = await fetchImageAsFile(url, name);
      const withSuffix = new File([f], suffixName(f.name, "-recropped"), {
        type: f.type,
        lastModified: Date.now(),
      });
      setFile(withSuffix);
      setHandler(() => onCropped);
      toast.dismiss(tid);
    } catch (e: any) {
      toast.dismiss(tid);
      toast.error(e?.message || "تعذّر تحميل الصورة لإعادة القص");
      setFile(null);
      setHandler(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const cancel = useCallback(() => {
    setFile(null);
    setHandler(null);
  }, []);

  const confirm = useCallback(
    async (cropped: File) => {
      const cb = handler;
      setFile(null);
      setHandler(null);
      if (!cb) return;
      try {
        await cb(cropped);
      } catch (e: any) {
        toast.error(e?.message || "فشل حفظ الصورة الجديدة");
      }
    },
    [handler],
  );

  return {
    file,
    open: file !== null,
    loading,
    start,
    cancel,
    confirm,
  };
}

function suffixName(name: string, suffix: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name}${suffix}`;
  return `${name.slice(0, dot)}${suffix}${name.slice(dot)}`;
}
