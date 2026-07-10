/**
 * Pure helpers for image cropping so they can be unit-tested outside React.
 */

export interface CroppedFileOptions {
  /** يُلحق باسم الملف الأصلي قبل الامتداد */
  suffix?: string;
}

/**
 * يبني File جديدًا من Blob قصّ حديث، مع اختيار الامتداد/mime الصحيح بحسب المصدر:
 * - PNG يبقى PNG
 * - أي شيء آخر (JPEG/WebP/HEIC/...) يخرج كـ JPEG
 */
export function buildCroppedFile(
  blob: Blob,
  source: File,
  options: CroppedFileOptions = {},
): File {
  const suffix = options.suffix ?? "-cropped";
  const srcType = (source.type || "").toLowerCase();
  const isPng = srcType.includes("png") || (blob.type || "").includes("png");
  const outType = isPng ? "image/png" : "image/jpeg";
  const ext = isPng ? "png" : "jpg";
  const base = (source.name || "image").replace(/\.[^.]+$/, "");
  return new File([blob], `${base}${suffix}.${ext}`, {
    type: outType,
    lastModified: Date.now(),
  });
}

/** يحوّل مصفوفة ملفات إلى FileList عبر DataTransfer. */
export function filesFromArray(files: File[]): FileList {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  return dt.files;
}

export function isImageFile(f: File): boolean {
  return !!f.type && f.type.startsWith("image/");
}
