// Data Anomaly Scanner — يفحص قاعدة البيانات لكشف الأخطاء غير المنطقية
// رسائل ثابتة بالعربية (بدون AI) لأقصى سرعة وأقل تكلفة
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Severity = "critical" | "warning" | "info";
type Category = "financial" | "pricing" | "stock" | "logical" | "data";

interface Anomaly {
  rule_code: string;
  category: Category;
  severity: Severity;
  table_name: string;
  record_id: string | null;
  record_label: string | null;
  description: string;
  observed_value: Record<string, unknown>;
}

interface Rule {
  code: string;
  category: Category;
  severity: Severity;
  table: string;
  sql: string;
  describe: (row: Record<string, any>) => { description: string; label: string };
}

// ========== تعريف القواعد ==========
const RULES: Rule[] = [
  // ===== مالية =====
  {
    code: "FIN_PAID_GT_TOTAL",
    category: "financial",
    severity: "critical",
    table: "invoices",
    // ملاحظة: paid_amount يُقفَل تلقائياً عند total والفائض يُسجَّل كقيد customer_credit.
    // لذلك نستبعد الحالات التي وُجد لها قيد سلفة (customer_credit) مرتبط بنفس الفاتورة،
    // وكذلك الفائض البسيط الذي يساوي مجموع قيود السلفة المسجَّلة لتلك الفاتورة.
    sql: `SELECT i.id, i.invoice_number, i.total, i.paid_amount,
                 COALESCE((
                   SELECT SUM(t.amount) FROM transactions t
                   WHERE t.reference_id::text = i.id::text
                     AND t.category = 'customer_credit'
                 ), 0) AS recorded_credit
          FROM invoices i
          WHERE i.paid_amount IS NOT NULL AND i.total IS NOT NULL
            AND i.paid_amount > i.total + 0.01
            AND NOT EXISTS (
              SELECT 1 FROM transactions t
              WHERE t.reference_id::text = i.id::text
                AND t.category = 'customer_credit'
            )`,
    describe: (r) => ({
      description: `المدفوع (${r.paid_amount}) أكبر من إجمالي الفاتورة (${r.total}) ولم يُسجَّل قيد سلفة للعميل بالفائض`,
      label: `فاتورة ${r.invoice_number}`,
    }),
  },
  {
    code: "FIN_OVERPAY_NOT_RECORDED",
    category: "financial",
    severity: "warning",
    table: "invoices",
    // فائض دفعة لم يُسجَّل كقيد customer_credit رغم أن المدفوع تجاوز الإجمالي.
    // هذا يكتشف الفواتير القديمة قبل تطبيق منطق "الفائض → سلفة عميل".
    sql: `SELECT i.id, i.invoice_number, i.total, i.paid_amount,
                 (i.paid_amount - i.total) AS overpay_amount
          FROM invoices i
          WHERE i.paid_amount > i.total + 0.01
            AND i.customer_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM transactions t
              WHERE t.reference_id::text = i.id::text
                AND t.category = 'customer_credit'
            )`,
    describe: (r) => ({
      description: `فائض دفعة بقيمة ${r.overpay_amount} لم يُسجَّل كسلفة للعميل (يفترض أن يصبح قيد customer_credit)`,
      label: `فاتورة ${r.invoice_number}`,
    }),
  },
  {
    code: "FIN_TOTAL_ZERO_WITH_ITEMS",
    category: "financial",
    severity: "warning",
    table: "invoices",
    sql: `SELECT i.id, i.invoice_number, i.total,
                 (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = i.id) AS items_count
          FROM invoices i
          WHERE COALESCE(i.total, 0) = 0
            AND EXISTS (SELECT 1 FROM invoice_items WHERE invoice_id = i.id)`,
    describe: (r) => ({
      description: `الفاتورة إجماليها صفر لكنها تحتوي على ${r.items_count} بند`,
      label: `فاتورة ${r.invoice_number}`,
    }),
  },
  {
    code: "FIN_ITEMS_SUM_MISMATCH",
    category: "financial",
    severity: "warning",
    table: "invoices",
    sql: `SELECT i.id, i.invoice_number, i.total, i.subtotal, i.discount, i.shipping,
                 (SELECT COALESCE(SUM(total),0) FROM invoice_items WHERE invoice_id = i.id) AS items_sum
          FROM invoices i
          WHERE i.total IS NOT NULL
            AND ABS(
              COALESCE(i.total,0) - (
                (SELECT COALESCE(SUM(total),0) FROM invoice_items WHERE invoice_id = i.id)
                - COALESCE(i.discount,0)
                + COALESCE(i.shipping,0)
              )
            ) > 1
            AND EXISTS (SELECT 1 FROM invoice_items WHERE invoice_id = i.id)`,
    describe: (r) => ({
      description: `إجمالي الفاتورة (${r.total}) لا يطابق مجموع البنود (${r.items_sum}) − خصم (${r.discount || 0}) + شحن (${r.shipping || 0})`,
      label: `فاتورة ${r.invoice_number}`,
    }),
  },
  {
    code: "FIN_NEGATIVE_BALANCE_NO_REASON",
    category: "financial",
    severity: "warning",
    table: "customers",
    // balance يُحسب كـ GREATEST(0, debt) في recalc_customer_balance — فلا يصبح سالباً عادة.
    // نُبقي القاعدة كحارس لأي بيانات قديمة أو تعديل يدوي مباشر على الجدول.
    sql: `SELECT c.id, c.name, c.balance, c.credit_balance
          FROM customers c
          WHERE COALESCE(c.balance, 0) < -0.01`,
    describe: (r) => ({
      description: `رصيد العميل بالسالب (${r.balance}). يجب إعادة احتساب الرصيد (recalc_customer_balance)`,
      label: `عميل ${r.name}`,
    }),
  },
  {
    code: "FIN_CREDIT_BALANCE_MISMATCH",
    category: "financial",
    severity: "warning",
    table: "customers",
    // credit_balance المخزَّن يجب أن يساوي مجموع قيود customer_credit للعميل.
    sql: `SELECT c.id, c.name, COALESCE(c.credit_balance,0) AS stored_credit,
                 COALESCE((
                   SELECT SUM(amount) FROM transactions
                   WHERE customer_id = c.id
                     AND type = 'income'
                     AND category = 'customer_credit'
                 ), 0) AS computed_credit
          FROM customers c
          WHERE ABS(
            COALESCE(c.credit_balance,0) - COALESCE((
              SELECT SUM(amount) FROM transactions
              WHERE customer_id = c.id
                AND type = 'income'
                AND category = 'customer_credit'
            ), 0)
          ) > 0.01`,
    describe: (r) => ({
      description: `رصيد السلفة المخزَّن (${r.stored_credit}) لا يساوي مجموع قيود customer_credit (${r.computed_credit})`,
      label: `عميل ${r.name}`,
    }),
  },
  {
    code: "FIN_NO_CUSTOMER_LARGE",
    category: "financial",
    severity: "info",
    table: "invoices",
    sql: `SELECT id, invoice_number, total
          FROM invoices
          WHERE customer_id IS NULL AND COALESCE(total,0) > 10000`,
    describe: (r) => ({
      description: `فاتورة بمبلغ كبير (${r.total}) بدون عميل مرتبط`,
      label: `فاتورة ${r.invoice_number}`,
    }),
  },

  // ===== التسعير =====
  {
    code: "PRC_INVOICE_UNIT_PRICE_MISMATCH",
    category: "pricing",
    severity: "warning",
    table: "invoice_items",
    sql: `SELECT ii.id, ii.product_name, ii.unit_price, ii.foreign_price, i.exchange_rate, i.invoice_number
          FROM invoice_items ii
          JOIN invoices i ON i.id = ii.invoice_id
          WHERE ii.foreign_price IS NOT NULL AND ii.foreign_price > 0
            AND i.exchange_rate IS NOT NULL AND i.exchange_rate > 0
            AND ABS(ii.unit_price - (ii.foreign_price * i.exchange_rate)) > 0.5`,
    describe: (r) => ({
      description: `سعر الوحدة (${r.unit_price}) لا يساوي السعر الأجنبي (${r.foreign_price}) × معدل التحويل (${r.exchange_rate})`,
      label: `بند: ${r.product_name} (فاتورة ${r.invoice_number})`,
    }),
  },
  {
    code: "PRC_QUOTE_UNIT_PRICE_MISMATCH",
    category: "pricing",
    severity: "warning",
    table: "quote_items",
    sql: `SELECT qi.id, qi.product_name, qi.unit_price, qi.foreign_price, q.exchange_rate_to_base, q.quote_number
          FROM quote_items qi
          JOIN quotes q ON q.id = qi.quote_id
          WHERE qi.foreign_price IS NOT NULL AND qi.foreign_price > 0
            AND q.exchange_rate_to_base IS NOT NULL AND q.exchange_rate_to_base > 0
            AND ABS(qi.unit_price - (qi.foreign_price * q.exchange_rate_to_base)) > 0.5`,
    describe: (r) => ({
      description: `سعر الوحدة (${r.unit_price}) لا يساوي السعر الأجنبي (${r.foreign_price}) × معدل التحويل (${r.exchange_rate_to_base})`,
      label: `بند: ${r.product_name} (عرض ${r.quote_number})`,
    }),
  },
  {
    code: "PRC_FOREIGN_NO_RATE",
    category: "pricing",
    severity: "critical",
    table: "invoice_items",
    sql: `SELECT ii.id, ii.product_name, ii.foreign_price, i.invoice_number, i.exchange_rate
          FROM invoice_items ii
          JOIN invoices i ON i.id = ii.invoice_id
          WHERE ii.foreign_price IS NOT NULL AND ii.foreign_price > 0
            AND (i.exchange_rate IS NULL OR i.exchange_rate = 0)`,
    describe: (r) => ({
      description: `بند له سعر أجنبي (${r.foreign_price}) لكن معدل التحويل صفر/فارغ`,
      label: `بند: ${r.product_name} (فاتورة ${r.invoice_number})`,
    }),
  },
  {
    code: "PRC_DISCOUNT_GT_PRICE",
    category: "pricing",
    severity: "warning",
    table: "invoice_items",
    sql: `SELECT ii.id, ii.product_name, ii.unit_price, ii.discount, ii.quantity, i.invoice_number
          FROM invoice_items ii
          JOIN invoices i ON i.id = ii.invoice_id
          WHERE ii.discount IS NOT NULL
            AND ii.format_discount = 'amount'
            AND ii.discount > (ii.unit_price * ii.quantity)`,
    describe: (r) => ({
      description: `الخصم (${r.discount}) أكبر من قيمة البند (${r.unit_price} × ${r.quantity})`,
      label: `بند: ${r.product_name} (فاتورة ${r.invoice_number})`,
    }),
  },

  // ===== المخزون =====
  {
    code: "STK_NEGATIVE_QUANTITY",
    category: "stock",
    severity: "critical",
    table: "products",
    sql: `SELECT id, name, sku, stock_quantity
          FROM products
          WHERE stock_quantity < 0`,
    describe: (r) => ({
      description: `المنتج رصيده بالسالب: ${r.stock_quantity}`,
      label: `${r.name}${r.sku ? ` (${r.sku})` : ""}`,
    }),
  },
  {
    code: "STK_INVOICE_NOT_DEDUCTED",
    category: "stock",
    severity: "warning",
    table: "invoices",
    sql: `SELECT id, invoice_number, total, status, workflow_status, created_at
          FROM invoices
          WHERE stock_deducted_at IS NULL
            AND workflow_status NOT IN ('preparing', 'cancelled')
            AND EXISTS (SELECT 1 FROM invoice_items WHERE invoice_id = invoices.id)
            AND created_at < now() - interval '1 day'`,
    describe: (r) => ({
      description: `فاتورة معتمدة (${r.workflow_status}) لكن لم يُخصم منها المخزون`,
      label: `فاتورة ${r.invoice_number}`,
    }),
  },
  {
    code: "STK_BELOW_MIN",
    category: "stock",
    severity: "info",
    table: "products",
    sql: `SELECT id, name, sku, stock_quantity, min_stock
          FROM products
          WHERE min_stock > 0 AND stock_quantity <= min_stock AND stock_quantity >= 0`,
    describe: (r) => ({
      description: `المخزون (${r.stock_quantity}) وصل أو نزل تحت الحد الأدنى (${r.min_stock})`,
      label: `${r.name}${r.sku ? ` (${r.sku})` : ""}`,
    }),
  },
  // ملاحظة: عرض السعر لا يخصم من المخزون أبداً، والخصم يتم على الفاتورة فقط
  // عبر stock_deducted_at. لا يوجد جدول مستقل يربط العرض بخصم مخزوني، لذا
  // لا حاجة لقاعدة فحص خاصة بذلك على مستوى البيانات الحالية.

  // ===== منطقية =====
  {
    code: "LOG_FUTURE_DATE",
    category: "logical",
    severity: "warning",
    table: "invoices",
    sql: `SELECT id, invoice_number, date
          FROM invoices
          WHERE date > CURRENT_DATE + interval '7 days'`,
    describe: (r) => ({
      description: `الفاتورة بتاريخ مستقبلي (${r.date})`,
      label: `فاتورة ${r.invoice_number}`,
    }),
  },
  {
    code: "LOG_QUOTE_CONVERTED_BUT_PENDING",
    category: "logical",
    severity: "warning",
    table: "quotes",
    sql: `SELECT id, quote_number, status, converted_to_invoice_id
          FROM quotes
          WHERE converted_to_invoice_id IS NOT NULL
            AND status NOT IN ('converted', 'accepted')`,
    describe: (r) => ({
      description: `العرض مُحوّل لفاتورة لكن حالته لا تزال "${r.status}"`,
      label: `عرض ${r.quote_number}`,
    }),
  },
  {
    code: "LOG_QUOTE_CONVERTED_INVOICE_MISSING",
    category: "logical",
    severity: "critical",
    table: "quotes",
    // العرض المحوَّل يجب أن تكون فاتورته موجودة فعلياً.
    sql: `SELECT q.id, q.quote_number, q.converted_to_invoice_id
          FROM quotes q
          WHERE q.converted_to_invoice_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = q.converted_to_invoice_id)`,
    describe: (r) => ({
      description: `العرض محوَّل لفاتورة (${r.converted_to_invoice_id}) لكنها غير موجودة`,
      label: `عرض ${r.quote_number}`,
    }),
  },
  {
    code: "LOG_DUE_DATE_BEFORE_DATE",
    category: "logical",
    severity: "warning",
    table: "invoices",
    sql: `SELECT id, invoice_number, date, due_date
          FROM invoices
          WHERE due_date IS NOT NULL AND date IS NOT NULL AND due_date < date`,
    describe: (r) => ({
      description: `تاريخ الاستحقاق (${r.due_date}) قبل تاريخ الفاتورة (${r.date})`,
      label: `فاتورة ${r.invoice_number}`,
    }),
  },
  {
    code: "LOG_ORPHAN_INVOICE_ITEMS",
    category: "logical",
    severity: "critical",
    table: "invoice_items",
    sql: `SELECT ii.id, ii.product_name, ii.invoice_id
          FROM invoice_items ii
          LEFT JOIN invoices i ON i.id = ii.invoice_id
          WHERE i.id IS NULL`,
    describe: (r) => ({
      description: `بند يتيم — يشير إلى فاتورة محذوفة (${r.invoice_id})`,
      label: `بند: ${r.product_name}`,
    }),
  },
  {
    code: "LOG_PROFORMA_WITH_PAYMENT",
    category: "logical",
    severity: "warning",
    table: "invoices",
    // الفاتورة المبدئية (proforma) لا يفترض أن تستقبل دفعات.
    sql: `SELECT id, invoice_number, paid_amount
          FROM invoices
          WHERE is_proforma = true AND COALESCE(paid_amount, 0) > 0`,
    describe: (r) => ({
      description: `فاتورة مبدئية (proforma) عليها دفعات بمبلغ ${r.paid_amount}`,
      label: `فاتورة ${r.invoice_number}`,
    }),
  },

  // ===== بيانات =====
  {
    code: "DAT_DUPLICATE_CUSTOMER_PHONE",
    category: "data",
    severity: "info",
    table: "customers",
    sql: `WITH dups AS (
            SELECT phone, COUNT(*) AS cnt
            FROM customers
            WHERE phone IS NOT NULL AND TRIM(phone) <> ''
            GROUP BY phone HAVING COUNT(*) > 1
          )
          SELECT c.id, c.name, c.phone, d.cnt
          FROM customers c
          JOIN dups d ON d.phone = c.phone`,
    describe: (r) => ({
      description: `رقم الهاتف (${r.phone}) مكرر في ${r.cnt} عملاء`,
      label: `عميل ${r.name}`,
    }),
  },
  {
    code: "DAT_PRODUCT_NO_PRICE",
    category: "data",
    severity: "info",
    table: "products",
    sql: `SELECT id, name, sku
          FROM products
          WHERE (sale_price IS NULL OR sale_price = 0)
            AND (foreign_price IS NULL OR foreign_price = 0)`,
    describe: (r) => ({
      description: `المنتج بدون سعر بيع (لا محلي ولا أجنبي)`,
      label: `${r.name}${r.sku ? ` (${r.sku})` : ""}`,
    }),
  },
  {
    code: "DAT_PRODUCT_NO_UNIT",
    category: "data",
    severity: "info",
    table: "products",
    sql: `SELECT id, name, sku
          FROM products
          WHERE unit IS NULL OR TRIM(unit) = ''`,
    describe: (r) => ({
      description: `المنتج بدون وحدة قياس`,
      label: `${r.name}${r.sku ? ` (${r.sku})` : ""}`,
    }),
  },
];

// ========== المحرك ==========
async function runScan(
  supabase: ReturnType<typeof createClient>,
  triggeredBy: "manual" | "cron",
  triggeredByUid: string | null,
  existingRunId?: string,
) {
  const startedAt = new Date();
  const startMs = performance.now();

  let runId: string;
  if (existingRunId) {
    runId = existingRunId;
  } else {
    const { data: runRow, error: runErr } = await supabase
      .from("data_anomaly_runs")
      .insert({
        triggered_by: triggeredBy,
        triggered_by_uid: triggeredByUid,
        status: "running",
      })
      .select("id")
      .single();
    if (runErr) throw runErr;
    runId = (runRow as any).id;
  }

  const allAnomalies: Anomaly[] = [];
  let rulesRun = 0;

  for (const rule of RULES) {
    try {
      // تنفيذ الـ SQL عبر RPC مخصص؟ — نستخدم raw query عبر pg via supabase-js: غير ممكن مباشرة.
      // البديل: استخدام REST مع PostgREST view-like — لكن SQL مخصص يحتاج RPC.
      // الحل: نستخدم postgres meta عبر service role + fetch إلى /rest/v1/rpc/exec_sql
      // لكن هذا غير آمن. سنستخدم بدلاً من ذلك postgres direct via pg client.

      // الأفضل: تنفيذ عبر deno postgres
      const rows = await execSql(rule.sql);
      rulesRun++;

      for (const row of rows) {
        const desc = rule.describe(row);
        allAnomalies.push({
          rule_code: rule.code,
          category: rule.category,
          severity: rule.severity,
          table_name: rule.table,
          record_id: row.id ?? null,
          record_label: desc.label,
          description: desc.description,
          observed_value: row,
        });
      }
    } catch (e) {
      console.error(`Rule ${rule.code} failed:`, e);
    }
  }

  // جلب الحالات المفتوحة/المُحَلّة الحالية دفعة واحدة لتقليل عدد الاستعلامات
  const { data: existingRows } = await supabase
    .from("data_anomalies")
    .select("id, rule_code, table_name, record_id, status");

  const NULL_KEY = "00000000-0000-0000-0000-000000000000";
  const keyOf = (rc: string, tn: string, rid: string | null) =>
    `${rc}::${tn}::${rid ?? NULL_KEY}`;

  const existingMap = new Map<string, { id: string; status: string }>();
  for (const r of (existingRows ?? []) as any[]) {
    existingMap.set(keyOf(r.rule_code, r.table_name, r.record_id), {
      id: r.id,
      status: r.status,
    });
  }

  const nowIso = new Date().toISOString();
  const toInsert: any[] = [];
  const toUpdateReopen: string[] = [];
  const toUpdateSeen: { id: string; description: string; observed_value: any; record_label: string }[] = [];
  const seenKeys = new Set<string>();
  let newCount = 0;

  for (const a of allAnomalies) {
    const k = keyOf(a.rule_code, a.table_name, a.record_id);
    seenKeys.add(k);
    const ex = existingMap.get(k);
    if (!ex) {
      toInsert.push({
        rule_code: a.rule_code,
        category: a.category,
        severity: a.severity,
        table_name: a.table_name,
        record_id: a.record_id,
        record_label: a.record_label,
        description: a.description,
        observed_value: a.observed_value,
      });
      newCount++;
    } else {
      toUpdateSeen.push({
        id: ex.id,
        description: a.description,
        observed_value: a.observed_value,
        record_label: a.record_label,
      });
      if (ex.status === "resolved") toUpdateReopen.push(ex.id);
    }
  }

  // إدراج الجديد دفعة واحدة
  if (toInsert.length) {
    await supabase.from("data_anomalies").insert(toInsert);
  }

  // تحديث الموجود — على دفعات لتجنّب طلبات ضخمة
  const CHUNK = 50;
  for (let i = 0; i < toUpdateSeen.length; i += CHUNK) {
    const chunk = toUpdateSeen.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map((u) =>
        supabase
          .from("data_anomalies")
          .update({
            last_seen_at: nowIso,
            description: u.description,
            observed_value: u.observed_value,
            record_label: u.record_label,
          })
          .eq("id", u.id),
      ),
    );
  }

  // إعادة فتح الـ resolved التي ظهرت من جديد
  if (toUpdateReopen.length) {
    await supabase
      .from("data_anomalies")
      .update({ status: "open", resolved_at: null, resolved_by: null })
      .in("id", toUpdateReopen);
  }

  // resolved تلقائياً: المفتوحة الحالية التي لم تظهر في هذا الفحص
  const toResolveIds: string[] = [];
  for (const [k, v] of existingMap.entries()) {
    if (v.status === "open" && !seenKeys.has(k)) toResolveIds.push(v.id);
  }
  let resolvedCount = 0;
  if (toResolveIds.length) {
    await supabase
      .from("data_anomalies")
      .update({ status: "resolved", resolved_at: nowIso })
      .in("id", toResolveIds);
    resolvedCount = toResolveIds.length;
  }

  const durationMs = Math.round(performance.now() - startMs);
  await supabase
    .from("data_anomaly_runs")
    .update({
      finished_at: new Date().toISOString(),
      rules_run: rulesRun,
      anomalies_found: allAnomalies.length,
      anomalies_new: newCount,
      anomalies_resolved: resolvedCount,
      duration_ms: durationMs,
      status: "success",
    })
    .eq("id", runId);

  return {
    run_id: runId,
    rules_run: rulesRun,
    anomalies_found: allAnomalies.length,
    anomalies_new: newCount,
    anomalies_resolved: resolvedCount,
    duration_ms: durationMs,
    started_at: startedAt.toISOString(),
  };
}

// ===== تنفيذ SQL مخصص عبر postgres مباشرة =====
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

let pgClient: Client | null = null;
async function getPgClient(): Promise<Client> {
  if (pgClient) return pgClient;
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) throw new Error("SUPABASE_DB_URL not set");
  pgClient = new Client(dbUrl);
  await pgClient.connect();
  return pgClient;
}

function sanitizeBigInts(value: any): any {
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(sanitizeBigInts);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) out[k] = sanitizeBigInts(value[k]);
    return out;
  }
  return value;
}

async function execSql(sql: string): Promise<Record<string, any>[]> {
  const client = await getPgClient();
  const result = await client.queryObject(sql);
  return sanitizeBigInts(result.rows) as Record<string, any>[];
}

// ========== HTTP Handler ==========
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const isCron = url.searchParams.get("cron") === "1";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let userId: string | null = null;

    if (isCron) {
      // Cron path must present a shared secret header
      const cronSecret = Deno.env.get("CRON_SECRET");
      const provided = req.headers.get("x-cron-secret");
      if (!cronSecret || provided !== cronSecret) {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else {
      // Manual path requires an authenticated admin
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      userId = userData.user.id;
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }


    // إنشاء سجل تشغيل فوراً ثم تنفيذ الفحص في الخلفية لتجنّب WORKER_RESOURCE_LIMIT
    const { data: runRow, error: runErr } = await supabase
      .from("data_anomaly_runs")
      .insert({
        triggered_by: isCron ? "cron" : "manual",
        triggered_by_uid: userId,
        status: "running",
      })
      .select("id")
      .single();
    if (runErr) throw runErr;
    const runId = (runRow as any).id;

    // @ts-ignore EdgeRuntime متوفر في بيئة Supabase Edge
    EdgeRuntime.waitUntil(
      runScan(supabase, isCron ? "cron" : "manual", userId, runId).catch(async (err) => {
        console.error("Background scan failed:", err);
        await supabase
          .from("data_anomaly_runs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error_message: err instanceof Error ? err.message : String(err),
          })
          .eq("id", runId);
      }),
    );

    return new Response(
      JSON.stringify({ success: true, run_id: runId, status: "running" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("Scanner error:", e);
    return new Response(
      JSON.stringify({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
