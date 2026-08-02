// المصدر الواحد للأرقام المالية — حارسٌ على النمط الذي تكرّر عطله.
//
// كل عطل مالي في هذا المستودع كان من نوعٍ واحد: **رقمٌ يُحسب في مكانين**.
// الإشارة المقلوبة في الطباعة، والمتبقّي المجمَّد، وهوية الكاش بلونين — ثلاثتها
// وُلدت من نسخةٍ ثانية للحساب نُسي تحديثها.
//
// فهذه الاختبارات لا تفحص رقماً بعينه، بل تمنع وجود النسخة الثانية أصلاً.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== "test" && e.name !== "__tests__") walk(rel, out); }
    else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

const FILES = walk("src").filter((f) => !f.includes("/integrations/supabase/types"));
const readOf = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

/** الملفات التي يحقّ لها حساب المتبقّي — هي المصدر نفسه أو فاحصه. */
const DUE_OWNERS = [
  "src/utils/invoiceDue.ts",
  "src/utils/purchaseSave.ts",
  "src/lib/financeInvariants.ts",   // يقارن المخزَّن بالمحسوب عمداً
  "src/lib/dbHealthCheck.ts",       // فاحص سلامة، يقرأ العمود ليكشف انحرافه
];

describe("المتبقّي يُحسب من مصدر واحد", () => {
  /**
   * `due_amount ?? (total − paid)` كان يبدو محصّناً وليس كذلك: `??` يسقط على
   * البديل عند `null` وحده، **لا عند قيمةٍ خاطئة** — وهي حالتنا بالضبط، إذ
   * تترك `settle_invoices_from_credit` العمودَ منحرفاً بقيمةٍ موجودة لا غائبة.
   */
  it("لا ملف يقرأ due_amount للعرض بحيلة `??`", () => {
    const offenders = FILES.filter((f) => {
      if (DUE_OWNERS.includes(f)) return false;
      return /due_amount\s*\?\?/.test(readOf(f));
    });
    expect(offenders).toEqual([]);
  });

  it("لا ملف يقرأ due_amount ليعرضه رقماً للمستخدم", () => {
    // الكتابة إليه مسموحة (`due_amount:` في payload) — القراءة للعرض ممنوعة.
    const offenders = FILES.filter((f) => {
      if (DUE_OWNERS.includes(f)) return false;
      const src = readOf(f);
      return /(?:Number|fmt|toLocaleString)\s*\(\s*[\w.]*\bdue_amount\b/.test(src)
          || /\bdue_amount\s*\)/.test(src.replace(/due_amount:\s*[^,\n]+/g, ""));
    });
    expect(offenders).toEqual([]);
  });
});

describe("المصادر الواحدة موجودة ومصدَّرة", () => {
  it.each([
    ["src/utils/invoiceDue.ts", ["invoiceDue", "totalInvoiceDue"]],
    ["src/utils/purchaseSave.ts", ["countsInSupplierStatement", "supplierBalanceOf"]],
    ["src/utils/buildCustomerAccountView.ts", ["signedAmountText", "accountRowBand"]],
  ])("%s يصدّر دوالّه", (file, names) => {
    const src = readOf(file);
    for (const n of names) expect(src).toContain(`export function ${n}`);
  });
});

describe("إشارة العرض من مصدر واحد", () => {
  /**
   * `signedAmountText` تحكم الكشف والواتساب والطباعة. وكان قالب الطباعة يبني
   * إشارته بيده فكتب «+» أحمر لما على العميل — زائدٌ بلون الدَّين.
   */
  it("قالب طباعة الفاتورة ينادي المصدر ولا يبني الإشارة بيده", () => {
    const src = readOf("src/utils/printTemplate.ts");
    expect(src).toContain("signedAmountText");
    // النمط القديم: بناء الإشارة من مقارنة مباشرة
    expect(src).not.toMatch(/\?\s*"\+ "\s*:\s*"− "/);
  });
});
