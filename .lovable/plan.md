# التسوية التلقائية من الرصيد الدائن + كشف تفصيلي تسويي

## ما تم التحقق منه في الكود الحالي (قبل الخطة)

- `settle_invoices_from_credit(_customer_id,_items,_date)` موجودة وذرّية: تقفل صف العميل `FOR UPDATE`، تكتب زوج قيود لكل فاتورة (`customer_payment` بطريقة `credit_balance` + `customer_credit` سالب)، تستدعي `recompute_customer_balance` و`assert_invoice_payment_consistency`، وتحرس ثبات `net = balance - credit`. هذه هي الدالة التي سنعيد استخدامها كما هي.
- `record_customer_charge` (مهاجرة 2026-07-26) تكتب قيد رصيد دائن واحد فقط بلا توزيع، وتعليقها ينصّ صراحة على أن التوزيع التلقائي أُلغي عمداً واستُبدل بالسداد اليدوي من كشف الحساب.
- الفائض عند الدفع يُكتب اليوم من مسارين مختلفين للواجهة:
  - `CustomerPaymentDialog.tsx` (سطر ~426): قيد `customer_credit` بـ `allocation.kind='overpay_surplus'`.
  - `InvoiceCreatePage.tsx` (سطر ~700): قيد `customer_credit` بوصف «فائض دفعة فاتورة - سلفة عميل» **بدون allocation** — مصدر تفاوت يجب توحيده.
- `CustomerStatementPage.tsx` يستخدم تبويبات يدوية عبر `tab` state (`invoices | deleted | transactions | audit`) — إضافة تبويب خامس تتبع نفس النمط.

## المعالجة المقصودة للقرار التاريخي

القرار السابق ألغى التوزيع لأن الشحن كان يرفع `paid_amount` لفواتير قديمة بصمت، فيرى العميل «مسددة» بلا تفسير ويختفي الرصيد الذي دفعه. الحل الجديد لا يعيد نفس اللبس لأن: (1) كل تسوية تلقائية تحمل مصدرها ويُعرض نصاً بجانب حالة الفاتورة، (2) الكشف التسويي الجديد يفسّر كل سطر، (3) مفتاح إيقاف في إعدادات الشركة يسمح بالرجوع للسلوك اليدوي فوراً بدون مهاجرة عكسية.

## القرارات المعمارية المقترحة

**1) نقطة الاستدعاء: RPC واحدة جديدة `auto_settle_customer_credit`، لا trigger.**

سبب رفض الـ trigger على `transactions`: التسوية نفسها تُدرِج قيود `customer_credit` سالبة ⇒ استدعاء ذاتي، وتتداخل مع `assert_invoice_payment_consistency` ومع مسار الحذف/العكس. الـ RPC صريحة وقابلة للإيقاف والتتبّع.

```
auto_settle_customer_credit(
  _customer_id uuid,
  _source_kind text,        -- 'invoice_overpay' | 'manual_charge'
  _source_ref  text,        -- invoice_id (للفائض) أو group_id (للشحن)
  _exclude_invoice_id uuid, -- الفاتورة مصدر الفائض: لا تُسوَّى من فائضها
  _date date
) RETURNS jsonb
```

المنطق (خطوات قصيرة، كلها داخل معاملة واحدة):
1. لو `company_settings.auto_settle_credit_enabled = false` ⇒ ترجع `{ok:false, reason:'disabled'}` بدون أي كتابة.
2. تقرأ `credit_balance` للعميل و`credit_consumption_order` من `company_settings` (افتراضي `fifo`).
3. تختار الفواتير المفتوحة: `status <> 'cancelled'`, `source <> 'pos'`, `total - paid_amount > 0.01`, `id <> _exclude_invoice_id`، مرتّبة `date, created_at` تصاعدياً لـ FIFO أو تنازلياً لـ LIFO — نفس ترتيب `allocateCreditConsumption`.
4. تبني مصفوفة `_items` بتخصيص المتاح على المتبقي حتى ينفد (نفس معادلة `autoAllocateFifo`).
5. تستدعي `settle_invoices_from_credit(_customer_id, _items, _date)` — **لا منطق مالي مواز**؛ كل الحراسات والقيود تبقى في مكان واحد.
6. بعد النجاح تُحدِّث `allocation` لقيود المجموعة (`settle_group`) بإضافة `auto:true, source_kind, source_ref, source_invoice_number/charge_date`، وتكتب `invoice_revisions` لكل فاتورة مُسوّاة بـ `action='auto_settle'`.

مواضع الاستدعاء (ثلاثة فقط):
- داخل `record_customer_charge` نفسها، بعد `recompute_customer_balance` ⇒ الشحن والتسوية في نفس المعاملة (النتيجة تُعاد ضمن `auto_settlement` في الـ jsonb).
- من `CustomerPaymentDialog.tsx` بعد نجاح كتابة قيد الفائض (`cashOver > 0`).
- من `InvoiceCreatePage.tsx` في نفس الموضع، بعد توحيد قيد الفائض ليحمل `allocation.kind='overpay_surplus'` مثل الحوار.

الحوارات اليدوية (`SettleInvoicesFromCreditDialog`, `ApplyCreditToInvoiceDialog`) تبقى كما هي بلا تغيير كمسار تصحيحي.

**2) تخزين/استخراج «المصدر»**

لا تغيير على الـ schema: المصدر يُخزَّن في `transactions.allocation` لقيود `credit_used` (المتاحة أصلاً بـ `invoice_id`/`settle_group`) بالحقول الجديدة `auto`, `source_kind`, `source_ref`, `source_invoice_number`, `source_date`.
العرض: توسعة `src/utils/creditSource.ts` بدالة `describeAutoSettlement(row)` تُرجع نصاً عربياً، ومكوّن صغير `AutoSettledBadge` يُستعمل في:
- عمود الحالة في تبويب الفواتير داخل كشف الحساب،
- `InvoiceViewPage` بجانب شارة الحالة،
- `InvoicePaymentHistory` كسطر «مصدر السداد».
النص: «مسددة بالكامل (من دفعة فاتورة رقم X)» أو «مسددة بالكامل (من شحن رصيد بتاريخ Y)».

**3) تبويب «كشف تفصيلي تسويي»**

تبويب خامس `settlement` في `CustomerStatementPage`، معتمد على نفس البيانات المحمّلة حالياً (فواتير + معاملات العميل) بلا استعلام جديد ثقيل — منطق البناء في ملف نقي `src/lib/settlementLedger.ts` قابل للاختبار بـ vitest:

- تُدمج الأحداث في خط زمني واحد: كل فاتورة = صف **مدين** بقيمتها؛ كل قيد `customer_payment` (نقدي أو `credit_balance`) و`customer_credit` موجب غير مستهلَك = صف **دائن**؛ الترتيب `date` ثم `created_at`.
- عمود «الرصيد التراكمي» = تراكم تصاعدي (`مدين − دائن`)، موجب = مطلوب من العميل، سالب = رصيد دائن له.
- «ملاحظات التسوية» تُشتق من `allocation` لصفوف الدائن ومن حالة الفاتورة:
  - متبقٍ مفتوح ⇒ «متبقي X (مفتوحة)»
  - الفائض صفّر كل المتبقي السابق تماماً (الرصيد التراكمي بعد الصف = 0) ⇒ «تم تصفير المديونية السابقة كاملة» بتمييز أخضر
  - تسوية جزئية على فاتورة محددة ⇒ «خصم من متبقي الفاتورة رقم N»
  - فائض يتجاوز كل الديون ⇒ «… ويتبقى Z رصيد دائن للعميل»
- شريط علوي يعرض الصافي النهائي بنفس `netBalanceOf` المستخدَم في باقي الصفحة، وزر طباعة/PDF بنفس ترويسة كشف الحساب الحالية.

## سيناريو القبول

اختبار vitest نقي على `settlementLedger` + `allocateCreditConsumption`، واختبار Playwright يُنفّذ التسلسل (500/300 · 600/400 · 300/200 · 500/1000 · 500/100 · شحن 300) ويؤكد بدون أي ضغطة يدوية: فواتير 1–3 `paid` بمصدر «دفعة فاتورة 4»، فاتورة 4 مسددة بلا فائض ظاهر، فاتورة 5 متبقٍ 400 ثم 100، والصافي النهائي 100 مطلوب سداده (−100 في اصطلاح الصافي المعروض).

## التفاصيل التقنية

- مهاجرة واحدة: عمود `company_settings.auto_settle_credit_enabled boolean NOT NULL DEFAULT true`، دالة `auto_settle_customer_credit` (SECURITY DEFINER, `GRANT EXECUTE ... TO authenticated, service_role`)، وتعديل `record_customer_charge` لاستدعائها.
- لا كتابة مباشرة على `paid_amount`/`balance`/`credit_balance` من الواجهة — كل شيء عبر الـ RPC القائمة.
- بعد كل استدعاء من الواجهة: `invalidateQueries` لـ `invoices`, `customers`, `transactions`, `activity-log`, وإطلاق `invoices:changed`.
- ملفات متأثرة: مهاجرة جديدة، `src/lib/settlementLedger.ts` (جديد)، `src/utils/creditSource.ts`، `src/components/statement/SettlementLedgerTab.tsx` (جديد)، `src/pages/CustomerStatementPage.tsx`، `src/components/invoice/CustomerPaymentDialog.tsx`، `src/pages/InvoiceCreatePage.tsx`، `src/components/invoice/InvoicePaymentHistory.tsx`، اختبارات vitest + Playwright.

## نقطة تحتاج تأكيدك

الافتراضي المقترح لمفتاح `auto_settle_credit_enabled` هو **مُفعَّل** لكل العملاء. لو تفضّل تفعيله يدوياً من الإعدادات أولاً (تشغيل تدريجي) أخبرني وأجعل الافتراضي مُطفأ.
