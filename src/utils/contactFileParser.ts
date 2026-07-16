import { normalizePhoneInput } from "@/utils/phoneNormalize";

/**
 * محلّل مبسّط لملفات جهات الاتصال (vCard 2.1/3.0/4.0 و CSV).
 * يعمل على كل الأجهزة (iPhone/iPad/Android/Desktop) لأنه معتمد على رفع ملف.
 *
 * كيفية التصدير من الأجهزة الشائعة:
 *  - iPhone/iPad: افتح جهة الاتصال → "مشاركة جهة الاتصال" → حفظ في الملفات → ملف .vcf.
 *  - أندرويد: تطبيق جهات الاتصال → قائمة → استيراد/تصدير → تصدير إلى .vcf.
 *  - Gmail/Google Contacts: contacts.google.com → تصدير → vCard أو CSV.
 *  - Outlook: تصدير جهات الاتصال إلى CSV.
 */

export type ParsedContact = { name?: string; tel?: string };

export function parseVCard(text: string): ParsedContact[] {
  const out: ParsedContact[] = [];
  if (!text) return out;
  // vCard قد يحتوي على أسطر مطويّة (Line Folding): سطر يبدأ بمسافة/تاب هو تكملة للسابق.
  const unfolded = text.replace(/\r\n[ \t]|\n[ \t]|\r[ \t]/g, "");
  const lines = unfolded.split(/\r\n|\n|\r/);
  let current: ParsedContact | null = null;
  const decodeValue = (raw: string, params: string) => {
    let v = raw;
    if (/ENCODING=QUOTED-PRINTABLE/i.test(params)) {
      try {
        v = v.replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
        // فك UTF-8 من bytes
        try { v = decodeURIComponent(escape(v)); } catch { /* ignore */ }
      } catch { /* ignore */ }
    }
    return v.trim();
  };
  for (const raw of lines) {
    const line = raw.replace(/^\uFEFF/, "");
    if (/^BEGIN:VCARD/i.test(line)) { current = {}; continue; }
    if (/^END:VCARD/i.test(line)) {
      if (current && (current.name || current.tel)) out.push(current);
      current = null; continue;
    }
    if (!current) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const left = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const [propRaw, ...paramParts] = left.split(";");
    const prop = (propRaw || "").toUpperCase();
    const params = paramParts.join(";");
    if (prop === "FN") {
      current.name = decodeValue(value, params);
    } else if (prop === "N" && !current.name) {
      // N:Last;First;Middle;Prefix;Suffix — رتّبها كـ First Last
      const parts = decodeValue(value, params).split(";");
      const last = parts[0] || "";
      const first = parts[1] || "";
      current.name = [first, last].filter(Boolean).join(" ").trim();
    } else if (prop === "TEL" && !current.tel) {
      const tel = normalizePhoneInput(decodeValue(value, params));
      if (tel) current.tel = tel;
    }
  }
  return out.filter(c => c.tel || c.name);
}

/** محلّل CSV بسيط يدعم الحقول بين علامات اقتباس مزدوجة. */
function csvParse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\r") { /* skip */ }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c && c.trim()));
}

export function parseCSV(text: string): ParsedContact[] {
  const rows = csvParse((text || "").replace(/^\uFEFF/, ""));
  if (rows.length === 0) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  const nameIdx = header.findIndex(h => /^(name|full ?name|display ?name|الاسم|اسم)/i.test(h));
  // نأخذ أوّل عمود يشبه رقم الهاتف
  const telIdx = header.findIndex(h => /(phone|tel|mobile|هاتف|جوال|جوّال|رقم)/i.test(h));
  if (telIdx < 0) {
    // ملف بلا رأس واضح — نحاول أن نعتبر كل سطر: name,tel
    return rows
      .map(r => ({
        name: (r[0] || "").trim() || undefined,
        tel: normalizePhoneInput(r[1] || r[0] || "") || undefined,
      }))
      .filter(c => c.tel);
  }
  const out: ParsedContact[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const tel = normalizePhoneInput(r[telIdx] || "");
    if (!tel) continue;
    const name = nameIdx >= 0 ? (r[nameIdx] || "").trim() : "";
    out.push({ name: name || undefined, tel });
  }
  return out;
}

/** يحدد النوع تلقائياً حسب المحتوى/الامتداد ويحلل. */
export async function parseContactsFile(file: File): Promise<ParsedContact[]> {
  const name = (file.name || "").toLowerCase();
  const text = await file.text();
  if (name.endsWith(".vcf") || /BEGIN:VCARD/i.test(text)) return parseVCard(text);
  if (name.endsWith(".csv") || /,/.test(text)) return parseCSV(text);
  // fallback: حاول vCard ثم CSV
  const v = parseVCard(text);
  return v.length ? v : parseCSV(text);
}
