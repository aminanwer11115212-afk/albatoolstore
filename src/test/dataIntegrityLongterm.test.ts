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

describe("شحن الرصيد يُوزَّع تلقائياً على الأقدم أولاً", () => {
  const auto =
    allMigrations.find((m) => m.name.includes("auto_distribute_charge"))?.sql || "";
  /** الكود التنفيذي وحده — التعليقات تشرح السياسة القديمة أيضاً. */
  const code = auto.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  it("الهجرة موجودة وتُعيد تعريف مسار الشحن", () => {
    expect(auto).not.toBe("");
    expect(auto).toContain("CREATE OR REPLACE FUNCTION public.record_customer_charge");
  });

  it("يوزّع على الفواتير الأقدم أولاً", () => {
    expect(code).toContain("ORDER BY date ASC");
    expect(code).toContain("UPDATE public.invoices");
    expect(code).toContain("paid_amount = v_new_paid");
  });

  it("يستثني الملغاة وفواتير الكاش", () => {
    expect(code).toMatch(/status, ''\) <> 'cancelled'/);
    expect(code).toMatch(/source, ''\) <> 'pos'/);
  });

  it("كل تخصيص زوج كامل: دفعة credit_balance + استهلاك سالب", () => {
    const inserts = code.match(/INSERT INTO public\.transactions/g) || [];
    expect(inserts.length).toBe(3); // قيد الشحن + زوج التخصيص
    expect(code).toContain("'credit_balance'");
    expect(code).toContain("-v_apply");
  });

  it("الفائض يبقى مخزّناً ولا يُجبَر على التوزيع", () => {
    expect(code).toContain("EXIT WHEN v_remaining <= 0.01");
    expect(code).toContain("'surplus', v_remaining");
  });

  it("حارس الصافي يُلغي العملية عند أي انحراف", () => {
    // التوزيع نقل داخلي: أثر العملية كلّها هو الشحن وحده
    expect(code).toContain("v_net_before - v_amount");
    expect(code).toContain("RAISE EXCEPTION 'charge_failed:net_drift");
  });

  it("لا يكتب يدوياً على customers.balance", () => {
    expect(code).not.toMatch(/UPDATE\s+public\.customers\s+SET[^;]*\bbalance\b/i);
    expect(code).toContain("recompute_customer_balance");
  });

  it("يفحص تناسق كل فاتورة مسّها", () => {
    expect(code).toContain("assert_invoice_payment_consistency");
  });

  it("مسار توزيع واحد: القديم يفوّض للجديد", () => {
    const body = auto.slice(auto.indexOf("FUNCTION public.allocate_customer_charge"));
    expect(body).toContain("RETURN public.record_customer_charge(");
  });
});

describe("الواجهة لا تطبّق الرصيد من تلقاء نفسها عند فتح حوار الدفع", () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");

  it("حوار الدفع لا يملأ «استخدام الرصيد» من تلقاء نفسه عند الفتح", () => {
    const dlg = read("src/components/invoice/CustomerPaymentDialog.tsx");
    /** الكود التنفيذي وحده — التعليقات تشرح المنع فتذكر الكلمات نفسها. */
    const code = dlg.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    // كان يقترح تلقائياً: setCreditUse(String(useCredit)) داخل تأثير الفتح
    expect(code).not.toMatch(/const\s+useCredit\s*=\s*Math\.min\(credit,\s*remaining\)/);
    // لا استدعاء لـ setCreditUse بقيمة غير فارغة خارج معالِج يبدأه المستخدم
    expect(code).not.toMatch(/setCreditUse\(String\(useCredit\)\)/);
    // يبقى المسار اليدوي وحده: زر «استخدم الكل» + الكتابة في الحقل
    expect(dlg).toContain("استخدم الكل");
    expect(dlg).toContain("applyAllCredit");
  });

  it("لا نصّ في الواجهة يَعِد المستخدم باستخدام تلقائي للرصيد", () => {
    for (const f of [
      "src/components/invoice/CustomerPaymentDialog.tsx",
      "src/components/invoice/InvoiceCustomerCreditBanner.tsx",
      "src/components/dashboard/ChargeBalanceDialog.tsx",
    ]) {
      // النفي مسموح («لا يُستخدم تلقائياً») — الممنوع هو الوعد المُثبِت
      expect(read(f)).not.toMatch(/(?<!لا )(?:يُستخدم|يُوزَّع|يُسدَّد) تلقائياً/);
    }
  });

  it("المسارات التي تمسّ paid_amount من الرصيد معروفة ومحصورة", () => {
    // كلتاهما تُستدعى من نافذة يفتحها المستخدم بنفسه، لا من شحن أو فتح حوار.
    const manual = ["apply_customer_credit_to_invoice", "settle_invoices_from_credit"];
    for (const fn of manual) {
      expect(allSql).toContain(`FUNCTION public.${fn}`);
    }
    // ولا مسار ثالث: أي دالة أخرى تكتب دفعة method='credit_balance' تعني توزيعاً خفياً.
    // المسموح غير ذلك دوالُّ **تعكس** السداد (تُنقص paid_amount) لا تُنشئه، وكلها
    // يفتحها المستخدم بنفسه من نافذة تعديل/إلغاء صريحة.
    const reversals = [
      "revise_invoice_payment",
      "cancel_invoice_payment",
      "delete_invoice_with_reconciliation",
      "refund_payment_to_customer_credit",
      // تحذف الشحنة وتعكس استهلاكها على الفواتير — عكسٌ لا إنشاء سداد
      "delete_customer_credit_entry",
      // التوزيع التلقائي عند الشحن — بطلب صاحب المستودع، بحارس صافٍ
      "record_customer_charge",
    ];
    // نقسم كل ملف إلى أجسام دوال ونفحص كل جسم وحده — الفحص على مستوى الملف
    // يوقع دوالَّ بريئة تصادف وجودها في نفس الهجرة.
    const owners: string[] = [];
    for (const { sql } of allMigrations) {
      const parts = sql.split(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\./i).slice(1);
      for (const part of parts) {
        const name = part.match(/^(\w+)/)?.[1];
        if (!name) continue;
        const body = part.slice(0, part.search(/\n\$\$;/) + 1 || undefined);
        if (/'credit_balance'/.test(body) && /UPDATE\s+public\.invoices/i.test(body)) {
          owners.push(name);
        }
      }
    }
    expect(owners.length).toBeGreaterThan(0); // الفحص فعّال لا فارغ
    for (const fn of new Set(owners)) {
      expect([...manual, ...reversals]).toContain(fn);
    }
  });
});

describe("الحذف النهائي: الفاتورة تمحو دفعتها ولا تعيدها رصيداً", () => {
  const hard =
    allMigrations.find((m) => m.name.includes("hard_delete_invoice_and_charges"))?.sql || "";
  const code = hard.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  it("الهجرة موجودة وتُعيد تعريف الدالتين", () => {
    expect(hard).not.toBe("");
    expect(hard).toContain("CREATE OR REPLACE FUNCTION public.delete_invoice_with_reconciliation");
    expect(hard).toContain("CREATE OR REPLACE FUNCTION public.delete_customer_credit_entry");
  });

  it("دفعات الفاتورة تُحذف ولا تُحوَّل إلى رصيد دائن", () => {
    const body = code.slice(code.indexOf("delete_invoice_with_reconciliation"), code.indexOf("delete_customer_credit_entry"));
    expect(body).toContain("DELETE FROM public.transactions");
    // لا تحويل فئة: هذا ما كان يُرجع المال رصيداً في كشف الحساب
    expect(body).not.toMatch(/SET\s+category\s*=\s*'customer_credit'/i);
  });

  it("لقطة كاملة في activity_log قبل الحذف — الأثر التدقيقي الوحيد بعده", () => {
    expect(code).toContain("jsonb_agg(to_jsonb(t))");
    expect(code).toContain("INSERT INTO public.activity_log");
    expect(code).toContain("'policy', 'hard_delete_not_credited'");
  });

  it("يعيد حساب رصيد العميل والحسابات المتأثّرة", () => {
    expect(code).toContain("recompute_customer_balance");
    expect(code).toContain("recompute_account_balance");
  });

  it("حذف الشحنة يعكس استهلاكها على الفواتير أولاً بدل رفضه", () => {
    const body = code.slice(code.indexOf("delete_customer_credit_entry"));
    expect(body).toContain("UPDATE public.invoices");
    expect(body).toContain("paid_amount");
    // ولا يرفض بسبب الاستهلاك
    expect(body).not.toContain("explicit_consumption");
    expect(body).not.toContain("insufficient_remaining_credit");
  });

  it("يحذف نصفَي عملية السداد معاً فلا يبقى قيد بلا مقابله", () => {
    const body = code.slice(code.indexOf("delete_customer_credit_entry"));
    expect(body).toMatch(/DELETE FROM public\.transactions[\s\S]{0,400}method = 'credit_balance'/);
  });

  it("يبقى محصوراً بمدير النظام", () => {
    const body = code.slice(code.indexOf("delete_customer_credit_entry"));
    expect(body).toContain("unauthorized_admin_only");
  });
});

describe("ملف التطبيق المجمّع", () => {
  const applyPath = path.resolve(process.cwd(), "supabase/apply/APPLY_PENDING_MIGRATIONS.sql");

  it("موجود ويحمل كل الهجرات المعلّقة", () => {
    expect(fs.existsSync(applyPath)).toBe(true);
    const sql = fs.readFileSync(applyPath, "utf8");
    for (const fn of [
      "public.delete_customer_credit_entry",
      "public.record_customer_charge",
      "public.allocate_customer_charge",
      "public.delete_invoice_with_reconciliation",
    ]) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION ${fn}`);
    }
  });

  it("النسخة الأخيرة من record_customer_charge هي الموزِّعة تلقائياً", () => {
    const sql = fs.readFileSync(applyPath, "utf8");
    // التعريف الأخير هو الذي يبقى في القاعدة — يجب أن يكون التوزيع لا التخزين
    const last = sql.lastIndexOf("CREATE OR REPLACE FUNCTION public.record_customer_charge");
    expect(sql.slice(last)).toContain("ORDER BY date ASC");
    expect(sql.slice(last)).toContain("charge_failed:net_drift");
  });

  it("آمن التكرار: لا CREATE بلا OR REPLACE ولا DROP", () => {
    const sql = fs.readFileSync(applyPath, "utf8");
    const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).not.toMatch(/DROP\s+(TABLE|FUNCTION|COLUMN)/i);
    expect(code).not.toMatch(/CREATE\s+FUNCTION\s/i);
  });
});
