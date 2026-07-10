/**
 * تنزيل صورة من رابط (عام أو موقّع) وتحويلها إلى File جاهز لـ ImageCropDialog.
 */
export async function fetchImageAsFile(
  url: string,
  fallbackName: string = "image.jpg",
): Promise<File> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`تعذّر تحميل الصورة (${res.status})`);
  const blob = await res.blob();
  const type = blob.type || guessMimeFromUrl(url) || "image/jpeg";
  const name = deriveNameFromUrl(url) || fallbackName;
  return new File([blob], name, { type, lastModified: Date.now() });
}

function guessMimeFromUrl(url: string): string | null {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

function deriveNameFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}
