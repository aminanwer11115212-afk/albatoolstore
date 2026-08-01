// الفاتورة الآجلة وفاتورة الكاش: **صفحتان منفصلتان فوق شاشة واحدة**.
//
// الفصل في الصفحة لا في المنطق قصداً. نسخ الملف كان يعني صيانة نسختين من
// ثلاثة آلاف سطر — كل إصلاح يُطبَّق مرّتين، وأوّل مرّة يُنسى فيها تتباعد
// الشاشتان صامتتين. وهو ما وقع فعلاً حين حملت الطباعة والمعاينة منطقَي
// «الحساب القديم» متوازيين فبقي أحدهما مقلوباً.
//
// هذه الاختبارات تحرس الشكلين معاً: أن الصفحات منفصلة، وأن المنطق واحد.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const THIN_PAGES = [
  ["src/pages/InvoiceCreatePage.tsx", "@/screens/InvoiceCreateScreen"],
  ["src/pages/CashInvoiceCreatePage.tsx", "@/screens/InvoiceCreateScreen"],
  ["src/pages/InvoicesPage.tsx", "@/screens/InvoicesScreen"],
  ["src/pages/CashInvoicesPage.tsx", "@/screens/InvoicesScreen"],
] as const;

describe("فصل الفواتير عن الكاش", () => {
  it("الشاشتان المشتركتان في مكانهما", () => {
    expect(fs.existsSync(path.resolve(process.cwd(), "src/screens/InvoiceCreateScreen.tsx"))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), "src/screens/InvoicesScreen.tsx"))).toBe(true);
  });

  it.each(THIN_PAGES)("%s صفحة رفيعة تفوّض للشاشة المشتركة", (page, screen) => {
    const src = read(page);
    expect(src).toContain(`from "${screen}"`);
    // رفيعة فعلاً: لو عاد المنطق إليها لانتفى الغرض من الفصل
    expect(src.split("\n").length).toBeLessThan(20);
  });

  it("كل صفحة تثبّت قناتها صراحةً — لا وراثة صامتة", () => {
    expect(read("src/pages/InvoiceCreatePage.tsx")).toContain("pos={false}");
    expect(read("src/pages/CashInvoiceCreatePage.tsx")).toMatch(/<InvoiceCreateScreen\s+pos\s*\/>/);
    expect(read("src/pages/InvoicesPage.tsx")).toContain("posOnly={false}");
    expect(read("src/pages/CashInvoicesPage.tsx")).toMatch(/<InvoicesScreen\s+posOnly\s*\/>/);
  });

  it("مسارات الكاش تشير إلى صفحاتها لا إلى صفحة الفاتورة بعَلَم", () => {
    const app = read("src/App.tsx");
    for (const route of ["/invoices/cash", "/invoices/cash/new", "/invoices/cash/edit/:id"]) {
      const line = app.split("\n").find((l) => l.includes(`path="${route}"`));
      expect(line, `مسار ${route} مفقود`).toBeTruthy();
      expect(line).toContain("CashInvoiceCreatePage");
    }
    const listLine = app.split("\n").find((l) => l.includes('path="/invoices/cash/list"'));
    expect(listLine).toContain("CashInvoicesPage");
  });

  it("لا مسار يمرّر العَلَم مباشرةً — الفصل في الصفحة لا في السطر", () => {
    const app = read("src/App.tsx");
    expect(app).not.toMatch(/<InvoiceCreatePage\s+pos\s*\/>/);
    expect(app).not.toMatch(/<InvoicesPage\s+posOnly\s*\/>/);
  });

  it("المنطق يبقى واحداً — لا نسخة ثانية من الشاشة", () => {
    const screen = read("src/screens/InvoiceCreateScreen.tsx");
    // الشاشة هي الضخمة، والصفحات رفيعة: لو نُسخت لانقلبت النسبة
    expect(screen.split("\n").length).toBeGreaterThan(1000);
    for (const [page] of THIN_PAGES) {
      expect(read(page).split("\n").length).toBeLessThan(20);
    }
  });
});
