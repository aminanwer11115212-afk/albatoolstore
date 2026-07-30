---
name: albatool-data-integrity-longterm
description: Long-term database integrity for Albatool — verify no orphaned references survive any delete (invoices, payments, credit charges, items), and that indexes keep customer-statement / ledger queries fast as tables grow. Use after adding any delete path or RPC that removes rows, when the user reports slow statements or "الأرقام لا تتطابق بعد الحذف", or before a release that touches transactions/invoices.
---

# Albatool Data Integrity — سلامة القاعدة على المدى الطويل

يكمّل `albatool-finance-audit` (صحة الأرقام الآن) و`albatool-reports-validation`
(تطابق التقارير) بالبعد الثالث: **هل تبقى القاعدة سليمة وسريعة بعد آلاف
عمليات الحذف ومع نمو الجداول؟**

## 1) خريطة المراجع — أين تنشأ الأيتام

الخطر ليس في المفاتيح الأجنبية الحقيقية (Postgres يحرسها) بل في **الروابط
النصية غير المُقيَّدة**:

| العمود | النوع | مُقيَّد؟ | خطر اليُتم |
|---|---|---|---|
| `transactions.reference_id` | **TEXT** | ❌ لا FK | 🔴 عالٍ — يخزّن `invoices.id` كنص؛ حذف الفاتورة لا يُنظّفه |
| `transactions.allocation->>'group_id'` | JSONB | ❌ | 🟠 حذف صف واحد من مجموعة يترك بقيتها بلا أصل |
| `transactions.allocation->>'invoice_id'` | JSONB | ❌ | 🟠 نفس المشكلة |
| `transactions.customer_id` | UUID | ✅ `ON DELETE SET NULL` | 🟢 |
| `transactions.account_id` / `to_account_id` | UUID | ✅ `ON DELETE SET NULL` | 🟢 |
| `invoice_items.invoice_id` | UUID | ✅ FK | 🟢 |
| `activity_log.record_id` / `entity_id` | UUID بلا FK | ❌ **بقصد** | ⚪️ ليست يُتماً — شواهد تدقيق يجب أن تبقى بعد حذف الصف |

**القاعدة:** أي عمود يشير لسجل آخر بلا FK يحتاج تنظيفاً صريحاً في مسار الحذف،
أو حارساً يمنع الحذف. لا تعتمد على القاعدة لتنظّفه عنك.

## 2) مسارات الحذف القائمة وكيف تحمي نفسها

| المسار | ما يحذفه | حماية اليُتم |
|---|---|---|
| `delete_invoice_with_reconciliation` + `deleteInvoiceWithStockRestore` | فاتورة | يحوّل دفعاتها إلى `customer_credit` ويصفّر `reference_id` قبل الحذف — فلا يبقى صف يشير لفاتورة غير موجودة |
| `cancel_invoice_payment` | صف دفعة واحد | يُنقص `paid_amount` ثم يحذف الصف نفسه؛ لا شيء يشير إليه |
| `delete_customer_credit_entry` | شحن رصيد | **يمنع** الحذف إن وُجد استهلاك مرتبط، ويعكس المجموعة كاملة عبر `reverse_customer_charge` إن كان للشحنة `group_id` — فلا تبقى صفوف مجموعة بلا أصلها |
| `reverse_customer_charge` | مجموعة شحن كاملة | يحذف كل صفوف `allocation->>'group_id'` معاً |
| `delete_invoice_items_silent` | بنود فاتورة | FK حقيقي، والحذف ضمن نفس المعاملة |

## 3) استعلامات كشف الأيتام (شغّلها بعد أي مسار حذف جديد)

```sql
-- (أ) حركات تشير لفواتير غير موجودة — أخطر حالة
SELECT t.id, t.category, t.amount, t.reference_id, t.date
FROM public.transactions t
WHERE t.reference_id IS NOT NULL
  AND t.reference_id ~ '^[0-9a-fA-F-]{36}$'
  AND NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = t.reference_id::uuid)
ORDER BY t.date DESC;
-- المتوقّع: 0 صفوف

-- (ب) صفوف استهلاك رصيد بلا شحنة أصل في مجموعتها
SELECT c.id, c.amount, c.allocation->>'group_id' AS group_id
FROM public.transactions c
WHERE c.category = 'customer_credit' AND c.amount < 0
  AND c.allocation->>'group_id' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.transactions s
    WHERE s.category = 'customer_credit' AND s.amount > 0
      AND s.allocation->>'group_id' = c.allocation->>'group_id');
-- المتوقّع: 0 صفوف

-- (ج) بنود فواتير بلا فاتورة (يجب أن يمنعها الـFK — فحص شبكة أمان)
SELECT ii.id FROM public.invoice_items ii
LEFT JOIN public.invoices i ON i.id = ii.invoice_id
WHERE i.id IS NULL;

-- (د) رصيد دائن سالب — أثر حذف شحنة استُهلك منها
SELECT id, name, balance, credit_balance, net_balance
FROM public.customers WHERE credit_balance < -0.01;
-- المتوقّع: 0 صفوف

-- (هـ) انحراف الرصيد عن مصدر الحقيقة بعد الحذف
SELECT c.id, c.name, c.balance AS stored,
       COALESCE(SUM(GREATEST(i.total - i.paid_amount, 0)), 0) AS expected
FROM public.customers c
LEFT JOIN public.invoices i
  ON i.customer_id = c.id AND i.source <> 'pos' AND i.status <> 'cancelled'
GROUP BY c.id, c.name, c.balance
HAVING ABS(c.balance - COALESCE(SUM(GREATEST(i.total - i.paid_amount, 0)), 0)) > 0.01;
-- المتوقّع: 0 صفوف — وإلا شغّل recalc_all_customer_balances
```

## 4) الفهارس — ما هو موجود وما يجب ألّا يُكرَّر

موجودة فعلاً (لا تُعِد إنشاءها):

| الفهرس | الأعمدة | يخدم |
|---|---|---|
| `idx_transactions_customer_date` | `(customer_id, date DESC)` | كشف حساب العميل، دفتر الأستاذ |
| `idx_transactions_customer_category` | `(customer_id, category)` | حارس استهلاك الرصيد، تبويب المعاملات، ملخّص مصادر الرصيد |
| `idx_transactions_reference_type` | `(reference_id, type)` | ربط الدفعات بالفاتورة، عزل POS |
| `idx_transactions_account` | `(account_id)` | كشف حساب البنك |
| `idx_invoices_customer_date` | `(customer_id, date DESC)` | فواتير العميل |
| `idx_invoices_status` / `invoices_source_idx` | | تصفية الحالة/المصدر |

⚠️ `CREATE INDEX IF NOT EXISTS` يطابق **بالاسم فقط**: إعادة تعريف فهرس بنفس
الاسم وشرط مختلف تمرّ بصمت بلا أثر. تحقّق من الوجود قبل الكتابة:

```sql
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('transactions','invoices')
ORDER BY tablename, indexname;
```

### متى تُضاف فهارس جديدة

أضف فهرساً فقط بعد إثبات الحاجة بخطة تنفيذ فعلية:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.transactions
WHERE customer_id = $1 AND category = 'customer_credit' ORDER BY date DESC;
-- Seq Scan على جدول كبير ⇒ فهرس ناقص. Index Scan ⇒ لا تُضف شيئاً.
```

كل فهرس زائد يُبطئ كل INSERT/UPDATE على الجدول — و`transactions` من أكثر
الجداول كتابةً في النظام.

### مؤشّرات النمو التي تستدعي مراجعة

```sql
SELECT relname,
       n_live_tup AS rows,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       seq_scan, idx_scan
FROM pg_stat_user_tables
WHERE relname IN ('transactions','invoices','invoice_items','activity_log')
ORDER BY n_live_tup DESC;
```
`seq_scan` ينمو أسرع من `idx_scan` على `transactions` ⇒ استعلام جديد بلا فهرس.
`activity_log` ينمو بلا حد ⇒ خطّط لأرشفة دورية، لا تحذفه (سجل تدقيق).

## 5) القواعد الإلزامية لأي مسار حذف جديد

1. **لا كتابة يدوية على الأرصدة.** احذف من `transactions` / `invoices` ودع
   `recompute_customer_balance` / `recompute_account_balance` تعمل عبر الـtriggers.
2. **نظّف أو امنع.** أي مرجع نصي/JSONB يشير للصف المحذوف: إمّا تُنظّفه في نفس
   المعاملة، وإمّا تمنع الحذف بحارس ورسالة عربية واضحة.
3. **المجموعة تُحذف كاملة.** لا تحذف صفاً من مجموعة `allocation.group_id` وحده.
4. **سجّل في `activity_log`** بنفس نمط حذف الفواتير: `action`, `entity_type`,
   `entity_id`, `table_name`, `record_id`, `changed_by`, `old_data`, `details`
   (مع `net_before` / `net_after` حين يتأثر رصيد).
5. **أعِد الرصيد بعد التنفيذ من القاعدة** لا من تقدير الواجهة، واعرضه للمستخدم.
6. **حارس مزدوج**: نفس الشرط في الواجهة (لتعطيل الزر ورسالة مفهومة) وفي
   الـRPC (لأن الواجهة ليست حدود أمان).
7. **بعد الحذف** شغّل استعلامات القسم 3 على بيئة فيها بيانات فعلية.

## 6) بروتوكول الإخراج

جدول: `الفحص | الاستعلام | المتوقّع | الفعلي | ✅/❌`، ثم سطر ختامي:
`🎯 سلامة القاعدة: سليمة / تحتاج إصلاح` مع معرّفات الصفوف المخالفة إن وُجدت.

## 7) اختبارات مرجعية في المستودع

- `src/test/ledgerEntryActions.test.ts` — حارس استهلاك الرصيد وأثر الحذف على الرصيد.
- `src/test/buildStatementByInvoice.test.ts` — تطابق المجموع مع `net_balance`.
- `src/test/dataIntegrityLongterm.test.ts` — عقود مسارات الحذف (منع اليُتم + وجود الفهارس).
- `src/test/financeInvariants.test.ts` — ثوابت الطبقة المالية العامة.
