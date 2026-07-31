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

describe("لا تطبيق تلقائي لرصيد العميل في أي مسار بالنظام", () => {
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

  it("المسارات الوحيدة التي تمسّ paid_amount من الرصيد صريحة ويدوية", () => {
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

  it("النسخة الأخيرة من record_customer_charge هي المخزِّنة بلا توزيع", () => {
    const sql = fs.readFileSync(applyPath, "utf8");
    // التعريف الأخير هو الذي يبقى في القاعدة — يجب ألا يمسّ أي فاتورة
    const last = sql.lastIndexOf("CREATE OR REPLACE FUNCTION public.record_customer_charge");
    const body = sql.slice(last).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(body).toContain("'stored_only', true");
    expect(body.slice(0, body.indexOf("$$;"))).not.toMatch(/UPDATE\s+public\.invoices/i);
  });

  it("آمن التكرار: لا CREATE بلا OR REPLACE ولا DROP", () => {
    const sql = fs.readFileSync(applyPath, "utf8");
    const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).not.toMatch(/DROP\s+(TABLE|FUNCTION|COLUMN)/i);
    expect(code).not.toMatch(/CREATE\s+FUNCTION\s/i);
  });
});

describe("مُعرِّف مشروع Supabase موحّد", () => {
  /**
   * كان `config.toml` يحمل مشروعاً آخر لا صلة له بالبيانات، فأي رابط لوحة أو
   * `supabase link` يُبنى منه يذهب للمكان الخطأ — وقد ضلّل فعلاً.
   */
  it("config.toml يطابق المشروع الذي يستعمله التطبيق في .env", () => {
    const toml = fs.readFileSync(path.resolve(process.cwd(), "supabase/config.toml"), "utf8");
    const env = fs.readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
    const fromToml = toml.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
    const fromEnv = env.match(/VITE_SUPABASE_URL\s*=\s*"?https:\/\/([^.]+)\.supabase\.co/)?.[1];
    expect(fromToml).toBeTruthy();
    expect(fromEnv).toBeTruthy();
    expect(fromToml).toBe(fromEnv);
  });
});

describe("لا مراجع لمشروع Supabase القديم في الكود الحيّ", () => {
  /**
   * المستودع انتقل من مشروع `vifrecsqxdbwqtcfkdyb` إلى `exmasfdcjgwapmobefne`،
   * لكن روابط شعار مثبّتة في دوال Edge بقيت تشير للقديم — فتصل العميل صورة
   * ميتة في المستند المشارَك. الهجرات التاريخية مستثناة: هي سجلّ لا يُعاد.
   */
  const OLD_REF = "vifrecsqxdbwqtcfkdyb";

  const walk = (dir: string): string[] => {
    const abs = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === "test" ? [] : walk(full);
      // الاختبارات نفسها تذكر المُعرِّف القديم شرحاً — وليست كوداً يُشحن
      if (/\.test\.(ts|tsx)$/.test(e.name)) return [];
      return /\.(ts|tsx|sql|toml|json)$/.test(e.name) ? [full] : [];
    });
  };

  it("الكود الحيّ يشير للمشروع الحالي وحده", () => {
    const offenders = walk("supabase/functions")
      .concat(walk("supabase/apply"), walk("src"))
      .filter((f) => fs.readFileSync(path.resolve(process.cwd(), f), "utf8").includes(OLD_REF));
    expect(offenders).toEqual([]);
  });

  it("رابط ملف التطبيق يشير للمشروع الصحيح", () => {
    const sql = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/apply/APPLY_PENDING_MIGRATIONS.sql"), "utf8");
    const env = fs.readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
    const ref = env.match(/VITE_SUPABASE_URL\s*=\s*"?https:\/\/([^.]+)\.supabase\.co/)?.[1];
    expect(sql).toContain(`dashboard/project/${ref}/sql/new`);
  });
});

/**
 * القاعدة: **حالة الفاتورة لا تتغيّر بشحن الرصيد — إلا بعد التوزيع من كشف
 * الحساب.** أي أن المسار الوحيد الذي يُغيّر الحالة بسبب الرصيد هو توزيع
 * يدوي صريح يفتحه المستخدم من كشف حساب العميل:
 *   `apply_customer_credit_to_invoice` (فاتورة واحدة)
 *   `settle_invoices_from_credit`      (عدة فواتير دفعةً واحدة)
 */
describe("حالة الفاتورة لا تتغيّر بشحن الرصيد إلا بتوزيع يدوي من كشف الحساب", () => {
  const forced =
    allMigrations.find((m) => m.name.includes("force_charge_store_only"))?.sql || "";
  const code = forced.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  it("دالة الشحن لا تكتب status ولا تلمس invoices إطلاقاً", () => {
    expect(code).not.toMatch(/UPDATE\s+public\.invoices/i);
    expect(code).not.toMatch(/\bstatus\b\s*=/i);
    expect(code).not.toMatch(/paid_amount/i);
  });

  /**
   * التريغر الوحيد على `transactions` يعيد حساب رصيد **العميل** فقط. لو أُضيف
   * يوماً تريغر يشتقّ حالة الفاتورة من الحركات، لتغيّرت الحالة بمجرّد الشحن
   * دون أن يمرّ أحد بمسار سداد — وهذا ما يمنعه هذا الاختبار.
   */
  it("لا تريغر على transactions يكتب على invoices", () => {
    for (const { sql } of allMigrations) {
      const triggers = [...sql.matchAll(
        /CREATE\s+(?:OR REPLACE\s+)?TRIGGER\s+(\w+)[\s\S]{0,200}?ON\s+public\.transactions[\s\S]{0,200}?EXECUTE\s+FUNCTION\s+public\.(\w+)/gi,
      )];
      for (const [, , fnName] of triggers) {
        // جسم الدالة التي يستدعيها التريغر
        const at = sql.indexOf(`FUNCTION public.${fnName}(`);
        if (at < 0) continue;
        const body = sql.slice(at, sql.indexOf("$$;", at) + 3)
          .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
        expect(body).not.toMatch(/UPDATE\s+public\.invoices/i);
      }
    }
  });

  it("تغيير حالة الفاتورة محصور بدوال يستدعيها المستخدم صراحةً", () => {
    // **التعريف الأخير وحده هو الحيّ**: الهجرات مرتّبة بالطابع الزمني، وكل
    // `CREATE OR REPLACE` لاحق يستبدل ما قبله. فحص التعريفات المُستبدَلة يوقع
    // دوالَّ صُلِحت فعلاً — مثل `allocate_customer_charge` التي كانت توزّع
    // ثم صارت تفوّض للتخزين.
    const latest = new Map<string, string>();
    for (const { sql } of [...allMigrations].sort((a, b) => a.name.localeCompare(b.name))) {
      const parts = sql.split(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\./i).slice(1);
      for (const part of parts) {
        const name = part.match(/^(\w+)/)?.[1];
        if (!name) continue;
        latest.set(name, part.slice(0, part.search(/\n\$\$;/) + 1 || undefined));
      }
    }
    const owners = new Set<string>();
    for (const [name, body] of latest) {
      if (/UPDATE\s+public\.invoices[\s\S]{0,300}?\bstatus\b\s*=/i.test(body)) owners.add(name);
    }
    // المسارات المسموحة كلها يفتحها المستخدم صراحةً. أوّلان منها هما
    // **التوزيع من كشف الحساب** — الطريق الوحيد الذي يُغيّر الحالة بسبب الرصيد.
    const allowed = [
      "apply_customer_credit_to_invoice", "settle_invoices_from_credit",
      "revise_invoice_payment", "cancel_invoice_payment",
      "delete_invoice_with_reconciliation", "refund_payment_to_customer_credit",
      "delete_customer_credit_entry", "mark_overdue_invoices",
      "advance_invoice_workflow", "recalc_invoice_payment_state",
      // تصفير إداري صريح يطلبه المدير من شاشة الصيانة — لا علاقة له بالشحن
      "admin_reset_stock_and_ledgers",
    ];
    for (const fn of owners) expect(allowed).toContain(fn);
  });
});

describe("مسارا التوزيع من كشف الحساب — الطريق الوحيد لتغيير الحالة بالرصيد", () => {
  const bodyOf = (fn: string) =>
    allMigrations.find((m) => m.sql.includes(`FUNCTION public.${fn}`))?.sql || "";

  it.each([
    ["apply_customer_credit_to_invoice", "توزيع على فاتورة واحدة"],
    ["settle_invoices_from_credit", "توزيع على عدة فواتير"],
  ])("%s موجود ويكتب الحالة (%s)", (fn) => {
    const sql = bodyOf(fn);
    expect(sql).not.toBe("");
    expect(sql).toMatch(/UPDATE\s+public\.invoices/i);
    expect(sql).toContain("recompute_customer_balance");
  });

  it("كلاهما يُستدعى من كشف الحساب لا من مسار الشحن", () => {
    const apply = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/statement/ApplyCreditToInvoiceDialog.tsx"), "utf8");
    expect(apply).toContain('rpc("apply_customer_credit_to_invoice"');
    // حوار الشحن لا **يستدعي** أياً منهما (ذِكرهما في تعليق شرحاً مقبول)
    const charge = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/dashboard/ChargeBalanceDialog.tsx"), "utf8");
    const rpcs = [...charge.matchAll(/rpc\(\s*"(\w+)"/g)].map((m) => m[1]);
    expect(rpcs).toEqual(["record_customer_charge"]);
  });
});

describe("ملف الفحص والإصلاح", () => {
  const p = path.resolve(process.cwd(), "supabase/apply/VERIFY_AND_REPAIR.sql");

  it("موجود ويكشف النسخة الحيّة", () => {
    expect(fs.existsSync(p)).toBe(true);
    const sql = fs.readFileSync(p, "utf8");
    expect(sql).toContain("pg_get_functiondef");
    expect(sql).toContain("AUTO_DISTRIBUTE");
    expect(sql).toContain("STORE_ONLY");
  });

  it("نسخة الإصلاح مطابقة لهجرة «تخزين فقط» — لا تلمس الفواتير", () => {
    const sql = fs.readFileSync(p, "utf8");
    const fix = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.record_customer_charge"));
    const code = fix.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).toContain("'stored_only', true");
    expect(code).not.toMatch(/UPDATE\s+public\.invoices/i);
    expect(code).not.toMatch(/paid_amount/i);
  });

  it("لا يحذف بيانات بجملة عامة — الحذف يمرّ بمسار العكس", () => {
    const sql = fs.readFileSync(p, "utf8");
    const code = sql
      .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
      // النصوص المقتبسة ليست جُملاً: استعلام الكشف يبحث عن 'UPDATE public.invoices'
      // داخل تعريف الدالة، فلا يُعدّ تنفيذاً
      .replace(/'[^']*'/g, "''");
    expect(code).not.toMatch(/DELETE\s+FROM/i);
    expect(code).not.toMatch(/\bUPDATE\s+public\.(invoices|customers)\b/i);
  });
});
