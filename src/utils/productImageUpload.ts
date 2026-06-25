import { supabase } from "@/integrations/supabase/client";

const BUCKET = "company-assets";
// ~100 years — effectively permanent for a private bucket asset.
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 100;

export async function uploadProductImage(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filename = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, file, { upsert: false, contentType: file.type || undefined });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filename, SIGNED_URL_TTL);
  if (signError || !data?.signedUrl) {
    throw signError ?? new Error("تعذّر إنشاء رابط الصورة");
  }
  return data.signedUrl;
}
