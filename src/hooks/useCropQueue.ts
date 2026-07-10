import { useCallback, useRef, useState } from "react";
import { isImageFile } from "@/utils/cropImage";

/**
 * ترتيب قصّ الصور المتعددة قبل رفعها:
 * - يفرز الصور من غيرها
 * - يرفع غير الصور فورًا عبر uploader
 * - يفتح حوار القصّ للصور واحدة تلو الأخرى، ثم يرفعها معًا بعد الانتهاء
 *
 * تخطّى (skip) صورة يحتفظ بها كما هي بدون قص.
 */
export function useCropQueue(uploader: (files: File[]) => void | Promise<void>) {
  const [current, setCurrent] = useState<File | null>(null);
  const queueRef = useRef<File[]>([]);
  const croppedRef = useRef<File[]>([]);

  const flush = useCallback(() => {
    const out = croppedRef.current;
    croppedRef.current = [];
    queueRef.current = [];
    setCurrent(null);
    if (out.length) uploader(out);
  }, [uploader]);

  const advance = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    setCurrent(next);
    if (!next) flush();
  }, [flush]);

  const start = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return;
      const arr = Array.from(files);
      if (arr.length === 0) return;
      const images = arr.filter(isImageFile);
      const rest = arr.filter((f) => !isImageFile(f));
      if (rest.length) uploader(rest);
      if (images.length === 0) return;
      queueRef.current = images;
      croppedRef.current = [];
      advance();
    },
    [advance, uploader],
  );

  const confirm = useCallback(
    (cropped: File) => {
      croppedRef.current.push(cropped);
      advance();
    },
    [advance],
  );

  /** يبقي الصورة الأصلية دون قص */
  const skip = useCallback(() => {
    if (current) croppedRef.current.push(current);
    advance();
  }, [advance, current]);

  const cancelAll = useCallback(() => {
    queueRef.current = [];
    croppedRef.current = [];
    setCurrent(null);
  }, []);

  return {
    current,
    open: current !== null,
    remaining: queueRef.current.length,
    start,
    confirm,
    skip,
    cancelAll,
  };
}
