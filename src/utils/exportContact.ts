import { normalizePhoneInput } from "@/utils/phoneNormalize";

export type ContactExportInput = {
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  organization?: string | null;
};

/**
 * يبني بطاقة vCard 3.0 من بيانات عميل.
 * كل الأرقام تُطبَّع أولاً بحيث لا تتسرّب فراغات/شرطات إلى جهات الاتصال.
 */
export function buildVCard(input: ContactExportInput): string {
  const esc = (v: string) => v.replace(/([\\;,])/g, "\\$1").replace(/\n/g, "\\n");
  const name = (input.name || "عميل").trim();
  const phone = normalizePhoneInput(input.phone);
  const whatsapp = normalizePhoneInput(input.whatsapp);
  const lines: string[] = [];
  lines.push("BEGIN:VCARD");
  lines.push("VERSION:3.0");
  lines.push(`FN:${esc(name)}`);
  lines.push(`N:${esc(name)};;;;`);
  if (input.organization) lines.push(`ORG:${esc(input.organization)}`);
  if (phone) lines.push(`TEL;TYPE=CELL,VOICE:${phone}`);
  if (whatsapp && whatsapp !== phone) lines.push(`TEL;TYPE=CELL,WhatsApp:${whatsapp}`);
  if (input.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(input.email.trim())}`);
  const addrParts = [input.address, input.city].filter(Boolean).map(String).map((s) => s.trim());
  if (addrParts.length) lines.push(`ADR;TYPE=WORK:;;${esc(addrParts.join(" — "))};;;;`);
  if (input.notes) lines.push(`NOTE:${esc(String(input.notes))}`);
  lines.push("END:VCARD");
  return lines.join("\r\n") + "\r\n";
}

/**
 * يصدّر بطاقة العميل: يجرّب Web Share API مع ملف .vcf أولاً (يفتح مباشرة
 * "إضافة إلى جهات الاتصال" على iOS/Android)، وإلا يحمّل الملف عادياً.
 * جميع الأرقام مضمونة أنها مطبَّعة عبر normalizePhoneInput.
 */
export async function exportContactToDevice(input: ContactExportInput): Promise<"shared" | "downloaded"> {
  const vcf = buildVCard(input);
  const safeName = (input.name || "customer").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40) || "customer";
  const filename = `${safeName}.vcf`;
  const blob = new Blob([vcf], { type: "text/vcard;charset=utf-8" });

  const nav: any = typeof navigator !== "undefined" ? navigator : {};
  try {
    if (typeof File !== "undefined" && typeof nav.canShare === "function") {
      const file = new File([blob], filename, { type: "text/vcard" });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: input.name, text: input.name });
        return "shared";
      }
    }
  } catch {
    // fall through to download
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch {}
    URL.revokeObjectURL(url);
  }, 200);
  return "downloaded";
}
