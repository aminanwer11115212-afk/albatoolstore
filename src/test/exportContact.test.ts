import { describe, it, expect } from "vitest";
import { buildVCard } from "@/utils/exportContact";

describe("buildVCard", () => {
  it("emits a valid vCard 3.0 with normalized phone", () => {
    const v = buildVCard({ name: "مينا جابر", phone: "٠٩١ ٢٣٤ ٥٦٧٨" });
    expect(v).toContain("BEGIN:VCARD");
    expect(v).toContain("VERSION:3.0");
    expect(v).toContain("FN:مينا جابر");
    expect(v).toContain("TEL;TYPE=CELL,VOICE:0912345678");
    expect(v.trim().endsWith("END:VCARD")).toBe(true);
  });

  it("emits WhatsApp line only when different from phone", () => {
    const same = buildVCard({ name: "x", phone: "0912345678", whatsapp: "091 234 5678" });
    expect(same).not.toContain("WhatsApp");
    const diff = buildVCard({ name: "x", phone: "0912345678", whatsapp: "0999999999" });
    expect(diff).toContain("TEL;TYPE=CELL,WhatsApp:0999999999");
  });

  it("escapes commas, semicolons, backslashes and newlines in text fields", () => {
    const v = buildVCard({ name: "Ali; Co, Ltd", notes: "line1\nline2\\end" });
    expect(v).toContain("FN:Ali\\; Co\\, Ltd");
    expect(v).toContain("NOTE:line1\\nline2\\\\end");
  });

  it("never emits raw spaces/dashes/parens in TEL", () => {
    const v = buildVCard({ name: "x", phone: "+249 (91) 234-5678", whatsapp: "٠٩٩ ٩٩٩ ٩٩٩٩" });
    const telLines = v.split(/\r\n/).filter((l) => l.startsWith("TEL"));
    for (const l of telLines) {
      const val = l.split(":")[1] || "";
      expect(val).toMatch(/^\+?\d+$/);
    }
  });
});
