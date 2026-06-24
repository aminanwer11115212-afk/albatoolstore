import { supabase } from "@/integrations/supabase/client";
import { openWhatsApp } from "@/utils/whatsapp";
import html2canvas from "html2canvas";
import { generatePackagingReportHTML } from "@/utils/transportPackagingPrint";

export interface PackagingRow {
  packaging_type: string;
  product_name: string;
  packs_count: number;
  pieces_per_pack: number;
  quantity: number;
}

export function buildPackagingTextMessage(opts: {
  isInvoice: boolean;
  docNumber: string | undefined;
  customerName?: string;
  date?: string;
  rows: PackagingRow[];
}): string {
  const { isInvoice, docNumber, customerName, date, rows } = opts;
  const greeting = customerName ? `مرحباً ${customerName} 👋` : "مرحباً 👋";
  const title = isInvoice ? `📦 *تقرير تغليف الفاتورة #${docNumber || "-"}*` : `📦 *تقرير تغليف عرض السعر #${docNumber || "-"}*`;
  const lines: string[] = [greeting, "", title];
  if (date) lines.push(`📅 التاريخ: ${date}`);
  lines.push("");
  if (rows.length === 0) {
    lines.push("لا توجد بنود تغليف.");
  } else {
    rows.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.packaging_type} — ${r.product_name}: ${r.packs_count} × ${r.pieces_per_pack} = *${r.quantity.toLocaleString()}*`);
    });
    const totalPacks = rows.reduce((s, r) => s + r.packs_count, 0);
    const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
    lines.push("");
    lines.push(`📊 إجمالي العبوات: *${totalPacks.toLocaleString()}*`);
    lines.push(`📊 إجمالي القطع: *${totalQty.toLocaleString()}*`);
  }
  lines.push("");
  lines.push("شكراً لتعاملكم معنا 🙏");
  return lines.join("\n");
}

export function openWhatsAppPackagingText(phone: string | undefined, message: string) {
  openWhatsApp(phone, message);
}

export async function createPackagingShareLink(opts: {
  isInvoice: boolean;
  docId: string;
}): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  const accessToken = sess?.session?.access_token;
  if (!accessToken) throw new Error("يجب تسجيل الدخول");
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-document-share-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: ANON,
    },
    body: JSON.stringify({
      doc_type: opts.isInvoice ? "packaging-invoice" : "packaging-quote",
      doc_id: opts.docId,
      ttl_hours: 24,
    }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || "فشل إنشاء الرابط");
  return json.url as string;
}

export async function openWhatsAppPackagingLink(opts: {
  isInvoice: boolean;
  docId: string;
  docNumber?: string;
  customerName?: string;
  phone?: string;
}) {
  const url = await createPackagingShareLink({ isInvoice: opts.isInvoice, docId: opts.docId });
  const greeting = opts.customerName ? `مرحباً ${opts.customerName} 👋` : "مرحباً 👋";
  const label = opts.isInvoice ? `تقرير تغليف الفاتورة #${opts.docNumber || ""}` : `تقرير تغليف عرض السعر #${opts.docNumber || ""}`;
  const msg = `${greeting}\n${label}\n${url}`;
  openWhatsApp(opts.phone, msg);
  return url;
}

export async function shareWhatsAppPackagingImage(opts: {
  isInvoice: boolean;
  docId: string;
  docNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  date?: string;
  rows: Array<{
    type?: string;
    product?: string;
    quantity?: number;
    packs_count?: number;
    pieces_per_pack?: number;
    weight?: any;
    dimensions?: any;
    cost?: any;
    notes?: any;
  }>;
  company?: any;
}) {
  const { isInvoice, docId, docNumber, customerName, customerPhone, customerAddress, date, rows, company } = opts;
  const reportHtml = generatePackagingReportHTML({
    docType: isInvoice ? "invoice" : "quote",
    doc: {
      id: docId,
      number: docNumber,
      date: date || "",
      customerName: customerName || "كاش",
      customerPhone,
      customerAddress,
    },
    company,
    rows,
  });

  // Render in offscreen container
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;background:#fff;z-index:-1;";
  // Extract <body> content from full HTML
  const bodyMatch = reportHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const styleMatch = reportHtml.match(/<style>([\s\S]*?)<\/style>/i);
  wrap.innerHTML = (styleMatch ? `<style>${styleMatch[1]}</style>` : "") + (bodyMatch ? bodyMatch[1] : reportHtml);
  document.body.appendChild(wrap);

  try {
    const target = wrap.querySelector(".page") as HTMLElement || wrap;
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("فشل توليد الصورة"))), "image/png")
    );
    const filename = `packaging-${docNumber || docId}.png`;
    const file = new File([blob], filename, { type: "image/png" });

    const greeting = customerName ? `مرحباً ${customerName} 👋` : "مرحباً 👋";
    const label = isInvoice
      ? `📦 تقرير تغليف الفاتورة #${docNumber || ""}`
      : `📦 تقرير تغليف عرض السعر #${docNumber || ""}`;
    const text = `${greeting}\n${label}`;

    // Try Web Share with files
    const nav: any = navigator;
    if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      try {
        await nav.share({ files: [file], text, title: label });
        return;
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }

    // Fallback: download image + open WhatsApp with text only
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    openWhatsApp(customerPhone, customerPhone ? `${text}\n(الصورة محفوظة عندك — أرفقها في المحادثة)` : text);
  } finally {
    wrap.remove();
  }
}
