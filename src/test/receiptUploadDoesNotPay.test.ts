/**
 * رفع صورة الإيصال يُنهي **التجهيز** لا **الدفع**.
 *
 * الإيصال صورة يرفعها الموظّف لإثبات التسليم، وأثرها الوحيد المسموح به هو
 * `workflow_status = 'done'`. أمّا حالة الدفع فمشتقّة من `paid_amount`
 * مقابل `total` ولا تتغيّر إلا بدفعة مسجَّلة صراحةً. أي مسار يخلط بينهما —
 * في الواجهة أو في القاعدة — يسقط هنا.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");
const migrations = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort() // الطابع الزمني في مقدّمة الاسم، فالترتيب المعجمي هو الترتيب الزمني
  .map((f) => ({ name: f, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8") }));

/** آخر تعريف للدالة حسب زمن الهجرة — هو النسخة الحيّة في القاعدة. */
function lastDefinitionOf(fnName: string): string {
  const marker = new RegExp(`FUNCTION\\s+public\\.${fnName}\\s*\\(`, "i");
  for (let i = migrations.length - 1; i >= 0; i--) {
    const sql = migrations[i].sql;
    const at = sql.search(marker);
    if (at === -1) continue;
    // من مطلع التعريف حتى نهاية جسم الدالة
    const end = sql.indexOf("$function$;", at) + 1 || sql.indexOf("$$;", at) + 1 || sql.length;
    return sql.slice(at, end > at ? end + 12 : sql.length);
  }
  return "";
}

const PAYMENT_FIELDS = ["paid_amount", "due_amount", "'paid'", "'partial'"];

describe("advance_invoice_workflow لا تمسّ الدفع", () => {
  const def = lastDefinitionOf("advance_invoice_workflow");

  it("موجودة في الهجرات", () => {
    expect(def).not.toBe("");
  });

  it("تكتب workflow_status وحده على جدول الفواتير", () => {
    const update = def.slice(def.indexOf("UPDATE public.invoices"));
    expect(update).toContain("workflow_status = _target");
    for (const field of PAYMENT_FIELDS) {
      expect(update.slice(0, update.indexOf("WHERE id = _invoice_id"))).not.toContain(field);
    }
  });

  it("لا تُسند حالة دفع في أي موضع من جسمها", () => {
    expect(def).not.toMatch(/\bstatus\s*=\s*'(paid|partial)'/i);
    expect(def).not.toMatch(/\bpaid_amount\s*=/i);
  });
});

describe("محفّز رفع الإيصال", () => {
  const trigger = lastDefinitionOf("trg_auto_workflow_on_receipt");

  it("يكتفي بنداء advance_invoice_workflow بهدف done", () => {
    expect(trigger).toContain("advance_invoice_workflow(NEW.invoice_id, 'done'");
  });

  it("لا يلمس الفواتير مباشرة ولا يسجّل دفعة", () => {
    expect(trigger).not.toMatch(/UPDATE\s+public\.invoices/i);
    expect(trigger).not.toMatch(/INSERT\s+INTO\s+public\.transactions/i);
    expect(trigger).not.toMatch(/paid_amount/i);
  });
});

describe("نافذة مرفقات الفاتورة في الواجهة", () => {
  const src = read("src/components/invoice/InvoiceAttachmentsDialog.tsx");

  it("أثر رفع الإيصال محصور في حالة التجهيز", () => {
    expect(src).toContain('_target: "done"');
    // لا كتابة على الفاتورة من هنا — لا حالة ولا مبلغ مدفوع
    expect(src).not.toMatch(/from\("invoices"\)[\s\S]{0,120}\.update\(/);
    expect(src).not.toMatch(/paid_amount\s*:/);
  });

  it("رسالة النجاح تتحدّث عن حالة الفاتورة لا عن السداد", () => {
    expect(src).not.toContain("مدفوعة");
    expect(src).toContain("حالة التجهيز");
  });
});

describe("عمود الحالة في بطاقة العميل", () => {
  const src = read("src/components/CustomerDetailView.tsx");

  it("يفصل التجهيز عن الدفع في عمودين", () => {
    expect(src).toContain('"التجهيز", "الدفع"');
    expect(src).toContain("<WorkflowChip value={inv.workflow_status} />");
    expect(src).toContain("<PaymentChip total={inv.total} paid={inv.paid_amount}");
  });

  it("لا يعرض workflow_status كبديل عن حالة الفاتورة", () => {
    expect(src).not.toContain("inv.workflow_status || inv.status");
  });

  it("حالة الدفع مشتقّة من المدفوع والإجمالي", () => {
    expect(src).toContain("computeInvoiceStatusAfterPayment(");
  });
});
