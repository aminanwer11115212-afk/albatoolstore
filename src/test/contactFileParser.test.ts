import { describe, it, expect } from "vitest";
import { parseVCard, parseCSV, parseContactsFile } from "@/utils/contactFileParser";

describe("parseVCard", () => {
  it("يقرأ بطاقة vCard 3.0 عادية", () => {
    const v = `BEGIN:VCARD\nVERSION:3.0\nFN:أحمد علي\nTEL;TYPE=CELL:+249 912 345 678\nEND:VCARD`;
    const res = parseVCard(v);
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe("أحمد علي");
    expect(res[0].tel).toBe("+249912345678");
  });

  it("يقرأ عدة بطاقات ويحافظ على الترتيب", () => {
    const v = [
      "BEGIN:VCARD", "VERSION:3.0", "FN:أول", "TEL:0912000001", "END:VCARD",
      "BEGIN:VCARD", "VERSION:3.0", "FN:ثاني", "TEL:0912000002", "END:VCARD",
    ].join("\n");
    const res = parseVCard(v);
    expect(res.map(r => r.name)).toEqual(["أول", "ثاني"]);
    expect(res.map(r => r.tel)).toEqual(["0912000001", "0912000002"]);
  });

  it("يستخدم N عندما لا يوجد FN", () => {
    const v = `BEGIN:VCARD\nVERSION:2.1\nN:محمد;عبدالله;;;\nTEL:0912111222\nEND:VCARD`;
    const res = parseVCard(v);
    expect(res[0].name).toBe("عبدالله محمد");
  });

  it("يفكّ Line Folding في vCard", () => {
    const v = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:اسم\r\n طويل\r\nTEL:0912\r\n999\r\nEND:VCARD";
    const res = parseVCard(v);
    expect(res[0].name).toBe("اسمطويل");
    expect(res[0].tel).toBe("0912999");
  });

  it("يتجاهل البطاقات بدون رقم/اسم", () => {
    const v = "BEGIN:VCARD\nVERSION:3.0\nEND:VCARD";
    expect(parseVCard(v)).toHaveLength(0);
  });
});

describe("parseCSV", () => {
  it("يقرأ رأساً إنجليزياً", () => {
    const csv = "Name,Phone\nأحمد,0912345678\nسارة,\"+249 912 000 000\"";
    const res = parseCSV(csv);
    expect(res).toEqual([
      { name: "أحمد", tel: "0912345678" },
      { name: "سارة", tel: "+249912000000" },
    ]);
  });

  it("يقرأ رأساً عربياً (الاسم/الهاتف)", () => {
    const csv = "الاسم,الهاتف\nخالد,0999888777";
    const res = parseCSV(csv);
    expect(res[0]).toEqual({ name: "خالد", tel: "0999888777" });
  });

  it("يتخطى الصفوف بلا رقم صالح", () => {
    const csv = "Name,Phone\nOnly,\n,\nX,abc";
    const res = parseCSV(csv);
    expect(res).toHaveLength(0);
  });
});

describe("parseContactsFile (E2E)", () => {
  it("يتعرف على .vcf من الامتداد", async () => {
    const f = new File([`BEGIN:VCARD\nVERSION:3.0\nFN:X\nTEL:0912\nEND:VCARD`], "contacts.vcf");
    const res = await parseContactsFile(f);
    expect(res[0].tel).toBe("0912");
  });

  it("يتعرف على .csv من الامتداد", async () => {
    const f = new File(["Name,Phone\nX,0913"], "contacts.csv");
    const res = await parseContactsFile(f);
    expect(res[0].tel).toBe("0913");
  });
});
