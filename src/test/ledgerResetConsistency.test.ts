/**
 * تصفير كشف الحساب لا يتناقض مع حارس تناسق الدفعات.
 *
 * ## العطل الذي يحرسه
 * على `invoices` حارسٌ مؤجَّل حتى COMMIT:
 *   CONSTRAINT TRIGGER trg_invoices_payment_consistency
 *   AFTER UPDATE OF paid_amount, status … DEFERRABLE INITIALLY DEFERRED
 * يرفع `inconsistent_invoice_payment` إن خالف `paid_amount` مجموعَ دفعات
 * الفاتورة عند COMMIT.
 *
 * وكان فرعُ «تصفير كشف الحساب» في `admin_reset_stock_and_ledgers` يحذف كل
 * الدفعات ثم يكتب `paid_amount = total` — فيجد الحارسُ عند COMMIT
 * paid_amount=total وΣ=0 ويُلغي التصفيرَ كلَّه. أي أن الزرّ لا يفعل شيئاً
 * ويعيد خطأً.
 *
 * فبعد تعليم الفاتورة مدفوعةً صار الفرعُ يُدرج قيدَ تسويةٍ بقيمة الإجمالي —
 * فيتوازن Σ(الدفعات) = paid_amount ويمرّ الحارس. هذا الفحص يقرأ نصّ الهجرة
 * ويثبت أن التوازن قائم، فلا يعود العطل بحذف قيد التسوية.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS = "supabase/migrations";
const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

function latestDefining(fn: string): string {
  const files = fs.readdirSync(path.resolve(process.cwd(), MIGRATIONS))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const hits = files.filter((f) =>
    read(`${MIGRATIONS}/${f}`).includes(`FUNCTION public.${fn}`),
  );
  if (!hits.length) throw new Error(`لا هجرةَ تُعرّف ${fn}`);
  return read(`${MIGRATIONS}/${hits[hits.length - 1]}`);
}

/** جسمُ فرع `v_ledger` من الدالّة. */
function ledgerBranch(sql: string): string {
  const i = sql.indexOf("IF v_ledger THEN");
  expect(i, "لم يُعثر على فرع v_ledger").toBeGreaterThan(-1);
  // حتى `END IF;` الخاصّ بالفرع — نقرأ حتى `RETURN jsonb_build_object('ok'`
  return sql.slice(i, sql.indexOf("RETURN jsonb_build_object('ok'", i));
}

describe("حارس تناسق الدفعات موجودٌ فعلاً — الشرط الذي نحرس تجاهه", () => {
  it("CONSTRAINT TRIGGER مؤجَّل على invoices يفحص paid_amount", () => {
    const files = fs.readdirSync(path.resolve(process.cwd(), MIGRATIONS))
      .filter((f) => f.endsWith(".sql"));
    const defining = files.filter((f) =>
      /CONSTRAINT TRIGGER trg_invoices_payment_consistency/.test(read(`${MIGRATIONS}/${f}`)),
    );
    expect(defining.length).toBeGreaterThanOrEqual(1);
    const sql = read(`${MIGRATIONS}/${defining[defining.length - 1]}`);
    expect(sql).toMatch(/DEFERRABLE INITIALLY DEFERRED/);
    expect(sql).toMatch(/UPDATE OF paid_amount/);
  });
});

describe("تصفير كشف الحساب يوازن الدفعات — فلا يسقط عند COMMIT", () => {
  const branch = ledgerBranch(latestDefining("admin_reset_stock_and_ledgers"));

  it("يعلّم الفواتير مدفوعةً", () => {
    expect(branch).toMatch(/UPDATE\s+public\.invoices[\s\S]*?paid_amount\s*=\s*COALESCE\(\s*total/);
  });

  it("ويُدرج قيدَ تسويةٍ في transactions حتى يتوازن Σ(الدفعات) = paid_amount", () => {
    // بلا هذا الإدراج يرفع الحارسُ inconsistent_invoice_payment ويُلغى التصفير
    expect(branch).toMatch(/INSERT INTO public\.transactions/);
    expect(branch).toContain("'customer_payment'");
    expect(branch).toContain("ledger_reset_settlement");
    // القيمة = إجمالي الفاتورة، ومرجعُه معرّفها — فيطابق paid_amount
    expect(branch).toMatch(/COALESCE\(\s*i\.total/);
    expect(branch).toMatch(/i\.id::text/);
  });

  it("والقيدُ بلا أثرٍ بنكي: نقداً وبلا حساب", () => {
    expect(branch).toMatch(/'cash'/);
    // account_id = NULL في صفّ القيم
    expect(branch).toMatch(/'income',[\s\S]*?'customer_payment',[\s\S]*?'cash',\s*\n?\s*NULL/);
  });

  it("ثمّ يُصفّر الأرصدة ويعيد حسابها", () => {
    expect(branch).toMatch(/UPDATE\s+public\.customers[\s\S]*?balance\s*=\s*0/);
    expect(branch).toMatch(/recompute_customer_balance/);
  });
});
