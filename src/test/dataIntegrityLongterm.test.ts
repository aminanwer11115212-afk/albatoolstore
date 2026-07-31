/**
 * سلامة القاعدة على المدى الطويل — عقود مسارات الحذف والفهارس.
 *
 * يفحص ملفات الـmigrations نفسها لأن هذه العقود لا يمكن اختبارها من الواجهة:
 * لو حُذف حارس أو استُبدل بكتابة يدوية على الرصيد، يسقط الاختبار قبل النشر.
 * التوثيق الكامل في `.agents/skills/albatool-data-integrity-longterm/SKILL.md`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  creditChargeDeletability,
  findLinkedConsumptions,
  type LedgerTx,
} from "@/utils/ledgerEntryActions";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");
const allMigrations = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => ({ name: f, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8") }));
const allSql = allMigrations.map((m) => m.sql).join("\n");

const deleteCreditEntry =
  allMigrations.find((m) => m.sql.includes("FUNCTION public.delete_customer_credit_entry"))?.sql || "";

describe("delete_customer_credit_entry — عقد مسار حذف شحن الرصيد", () => {
  it("موجود ومحصور بمدير النظام", () => {
    expect(deleteCreditEntry).not.toBe("");
    expect(deleteCreditEntry).toContain("has_role(auth.uid(), 'admin')");
    expect(deleteCreditEntry).toContain("unauthorized_admin_only");
  });

  it("يرفض ما ليس شحن رصيد موجب", () => {
    expect(deleteCreditEntry).toContain("not_a_credit_charge");
    expect(deleteCreditEntry).toContain("credit_consumption_not_deletable");
  });

  it("يمنع الحذف عند وجود استهلاك مرتبط صراحةً", () => {
    expect(deleteCreditEntry).toContain("explicit_consumption");
    expect(deleteCreditEntry).toMatch(/allocation->>'charge_tx_id'\s*=\s*_tx_id::text/);
  });

  it("يمنع الحذف حين يقلّ الرصيد الدائن المتبقي عن قيمة الشحنة", () => {
    expect(deleteCreditEntry).toContain("insufficient_remaining_credit");
    expect(deleteCreditEntry).toContain("v_net_credit < v_amount - 0.01");
  });

  it("يعكس المجموعة كاملة بدل حذف صف منها فتبقى بقيتها يتيمة", () => {
    expect(deleteCreditEntry).toContain("reverse_customer_charge(v_group)");
  });

  it("لا يكتب يدوياً على customers.balance — يترك trigger إعادة الحساب يعمل", () => {
    expect(deleteCreditEntry).not.toMatch(/UPDATE\s+public\.customers\s+SET[^;]*\bbalance\b/i);
    expect(deleteCreditEntry).toContain("recompute_customer_balance");
  });

  it("يسجّل في activity_log بنفس نمط حذف الفواتير مع الرصيد قبل/بعد", () => {
    expect(deleteCreditEntry).toContain("INSERT INTO public.activity_log");
    for (const col of ["action", "entity_type", "entity_id", "table_name", "record_id", "changed_by", "old_data", "details"]) {
      expect(deleteCreditEntry).toContain(col);
    }
    expect(deleteCreditEntry).toContain("'net_before', v_net_before");
    expect(deleteCreditEntry).toContain("'net_after', v_net_after");
  });

  it("يقفل الصف قبل قراءته منعاً للتسابق", () => {
    expect(deleteCreditEntry).toContain("FOR UPDATE");
  });
});

describe("مسارات الحذف الأخرى لا تُنشئ مراجع يتيمة", () => {
  it("cancel_invoice_payment يحذف صف الدفعة نفسه ويعيد الحساب", () => {
    const sql = allMigrations.find((m) => m.sql.includes("FUNCTION public.cancel_invoice_payment"))!.sql;
    expect(sql).toContain("DELETE FROM public.transactions WHERE id = _tx_id");
    expect(sql).toContain("recompute_customer_balance");
    expect(sql).toContain("INSERT INTO public.activity_log");
  });

  it("حذف الفاتورة يصفّر reference_id في دفعاتها قبل الحذف (العمود TEXT بلا FK)", () => {
    const sql = allMigrations.find((m) =>
      m.sql.includes("FUNCTION public.delete_invoice_with_reconciliation"))!.sql;
    expect(sql).toContain("reference_id = NULL");
  });

  it("reverse_customer_charge يحذف كل صفوف المجموعة معاً", () => {
    const sql = allMigrations.find((m) => m.sql.includes("FUNCTION public.reverse_customer_charge"))!.sql;
    expect(sql).toMatch(/DELETE FROM public\.transactions\s+WHERE \(allocation->>'group_id'\)::uuid = _group_id/);
  });
});

describe("الفهارس — تغطية استعلامات كشف الحساب مع النمو", () => {
  const indexed = (name: string) => allSql.includes(name);

  it.each([
    ["idx_transactions_customer_date", "معاملات العميل مرتّبة بالتاريخ"],
    ["idx_transactions_customer_category", "تصفية معاملات العميل حسب الفئة"],
    ["idx_transactions_reference_type", "ربط الحركة بالفاتورة"],
    ["idx_invoices_customer_date", "فواتير العميل مرتّبة بالتاريخ"],
  ])("%s موجود (%s)", (name) => {
    expect(indexed(name)).toBe(true);
  });

  /**
   * تعارضات معروفة ومقبولة — لا تُضَف إليها إلا بتبرير مكتوب:
   * التعريف القائم يغطي المقصود فعلاً، فلا فهرس ناقص.
   */
  const ACCEPTED_INDEX_CONFLICTS: Record<string, string> = {
    idx_purchase_attachments_order:
      "القائم (purchase_order_id, deleted_at) يغطي البحث بـ purchase_order_id وحده",
    idx_data_anomalies_status:
      "المُركَّب المقصود أُنشئ باسم مستقل idx_data_anomalies_status_severity_seen",
  };

  it("لا فهرس مُعرَّف مرّتين بتعريفين مختلفين — CREATE INDEX IF NOT EXISTS يطابق بالاسم فقط", () => {
    const defs = new Map<string, Set<string>>();
    for (const { sql } of allMigrations) {
      const re = /CREATE\s+INDEX\s+(?:IF NOT EXISTS\s+)?(\w+)\s+ON\s+([^;]+);/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sql))) {
        // توحيد المسافات حول الأقواس والفواصل حتى لا يُعدّ اختلاف تنسيق تعارضاً
        const body = m[2]
          .replace(/\s+/g, " ")
          .replace(/\s*\(\s*/g, "(")
          .replace(/\s*\)\s*/g, ")")
          .replace(/\s*,\s*/g, ",")
          .trim()
          .toLowerCase();
        if (!defs.has(m[1])) defs.set(m[1], new Set());
        defs.get(m[1])!.add(body);
      }
    }
    const conflicting = [...defs.entries()]
      .filter(([, bodies]) => bodies.size > 1)
      .map(([n]) => n)
      .filter((n) => !(n in ACCEPTED_INDEX_CONFLICTS));
    expect(conflicting).toEqual([]);
  });

  it("الفهرس المُركَّب الذي ابتلعه IF NOT EXISTS أُنشئ باسم مستقل", () => {
    expect(allSql).toContain("idx_data_anomalies_status_severity_seen");
    expect(allSql).toMatch(/idx_data_anomalies_status_severity_seen\s*\n?\s*ON public\.data_anomalies \(status, severity, last_seen_at DESC\)/);
  });
});

describe("الحارس المنطقي في الواجهة يطابق حارس الـRPC", () => {
  const tx = (o: Partial<LedgerTx>): LedgerTx => ({
    id: "x", customer_id: "c1", category: "customer_credit", amount: 100, date: "2026-01-01", ...o,
  });

  it("شحنة استُهلك منها لا تُحذف — فلا يبقى استهلاك بلا أصل", () => {
    const charge = tx({ id: "c", amount: 200, allocation: { group_id: "g1" } });
    const consume = tx({ id: "u", amount: -50, allocation: { group_id: "g1" } });
    expect(findLinkedConsumptions(charge, [charge, consume])).toHaveLength(1);
    expect(creditChargeDeletability(charge, [charge, consume]).canDelete).toBe(false);
  });

  it("حذف شحنة سليمة لا يجعل الرصيد الدائن سالباً أبداً", () => {
    const charges = [
      tx({ id: "c1", amount: 200, allocation: { group_id: "g1" } }),
      tx({ id: "c2", amount: 150, allocation: { group_id: "g2" } }),
    ];
    const consume = tx({ id: "u1", amount: -180, allocation: { group_id: "g1" } });
    const all = [...charges, consume];
    const totalCredit = all.reduce((s, t) => s + Number(t.amount || 0), 0); // 170
    for (const c of charges) {
      const guard = creditChargeDeletability(c, all);
      if (guard.canDelete) {
        expect(totalCredit - Number(c.amount || 0)).toBeGreaterThanOrEqual(-0.01);
      }
    }
  });

  it("لا شحنة تُحذف حين يكفي الرصيد لواحدة فقط ولا رابط صريح", () => {
    const c1 = tx({ id: "c1", amount: 100 });
    const c2 = tx({ id: "c2", amount: 100 });
    const used = tx({ id: "u", amount: -150 });
    const all = [c1, c2, used];
    // المتبقي 50 < قيمة أي شحنة ⇒ الاثنتان محميّتان
    expect(creditChargeDeletability(c1, all).canDelete).toBe(false);
    expect(creditChargeDeletability(c2, all).canDelete).toBe(false);
  });
});

describe("شحن الرصيد لا يسدّد أي فاتورة تلقائياً", () => {
  const forced =
    allMigrations.find((m) => m.name.includes("force_charge_store_only"))?.sql || "";
  /** الكود التنفيذي وحده — التعليقات تذكر paid_amount شرحاً لا تنفيذاً. */
  const forcedCode = forced
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

  it("هجرة الإجبار موجودة وتُعيد تعريف الدالتين", () => {
    expect(forced).not.toBe("");
    expect(forced).toContain("CREATE OR REPLACE FUNCTION public.record_customer_charge");
    expect(forced).toContain("CREATE OR REPLACE FUNCTION public.allocate_customer_charge");
  });

  it("لا تلمس invoices ولا paid_amount", () => {
    expect(forcedCode).not.toMatch(/UPDATE\s+public\.invoices/i);
    expect(forcedCode).not.toMatch(/paid_amount/i);
  });

  it("لا تُدرج قيد سداد من الرصيد (customer_credit سالب أو دفعة credit_balance)", () => {
    expect(forcedCode).not.toMatch(/credit_balance/i);
    // القيد الوحيد المُدرَج موجب بكامل المبلغ
    const inserts = forcedCode.match(/INSERT INTO public\.transactions/g) || [];
    expect(inserts).toHaveLength(1);
    expect(forced).toContain("'stored_only', true");
  });

  it("المسار القديم الموزِّع صار يفوّض للتخزين فقط", () => {
    const body = forced.slice(forced.indexOf("FUNCTION public.allocate_customer_charge"));
    expect(body).toContain("RETURN public.record_customer_charge(");
    // ولا يحتوي أي منطق توزيع
    expect(body).not.toMatch(/FOR\s+\w+\s+IN\s+SELECT/i);
  });

  it("الواجهة تستدعي مسار التخزين وحده", () => {
    const dialog = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/dashboard/ChargeBalanceDialog.tsx"),
      "utf8",
    );
    expect(dialog).toContain('rpc("record_customer_charge"');
    expect(dialog).not.toContain('rpc("allocate_customer_charge"');
  });
});
