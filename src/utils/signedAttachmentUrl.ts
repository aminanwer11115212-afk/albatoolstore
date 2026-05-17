import { supabase } from "@/integrations/supabase/client";

/**
 * Extracts the storage path of a file from a stored Supabase URL
 * (works for both public and signed URLs that contain the bucket marker).
 */
export function extractStoragePath(url: string, bucket: string): string | null {
  if (!url) return null;
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  let path = url.slice(idx + marker.length);
  // strip query string from signed urls
  const q = path.indexOf("?");
  if (q !== -1) path = path.slice(0, q);
  return path;
}

/**
 * Generates a signed URL (default 1h) for a file in a private bucket,
 * given a stored URL that includes the bucket name.
 */
export async function getSignedAttachmentUrl(
  storedUrl: string,
  bucket: "invoice-attachments" | "quote-attachments",
  expiresInSeconds = 3600
): Promise<string> {
  const path = extractStoragePath(storedUrl, bucket);
  if (!path) return storedUrl;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) return storedUrl;
  return data.signedUrl;
}

/**
 * Resolves signed URLs for a list of attachments (mutates a copy).
 */
export async function resolveAttachmentSignedUrls<T extends { file_url: string }>(
  attachments: T[],
  bucket: "invoice-attachments" | "quote-attachments",
  expiresInSeconds = 3600
): Promise<T[]> {
  return Promise.all(
    attachments.map(async (a) => ({
      ...a,
      file_url: await getSignedAttachmentUrl(a.file_url, bucket, expiresInSeconds),
    }))
  );
}
