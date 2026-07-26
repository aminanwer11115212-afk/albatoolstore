-- ============================================================
-- [حرِج] إسقاط تريغرات الرصيد القديمة المتعارضة مع النموذج الموحّد
--
-- المشكلة: يتعايش نظامان لإعادة حساب رصيد العميل على نفس الجدولين:
--   • الجديد (الصحيح): recompute_customer_balance
--       - balance = Σ(total-paid) للفواتير غير الملغاة وغير POS
--       - credit_balance = Σ كل قيود customer_credit (بما فيها الاستهلاك السالب)
--       تريغرات: invoices_recompute_customer_balance / transactions_recompute_customer_balance
--   • القديم (الخاطئ): recalc_customer_balance عبر
--       sync_customer_balance_from_invoice + sync_customer_balance_from_credit
--       - balance يشمل POS والفواتير الملغاة
--       - credit_balance = Σ القيود الموجبة فقط (type='income') ⇒ يتجاهل الاستهلاك
--
-- التريغران القديمان (trg_sync_customer_balance على invoices و
-- trg_sync_customer_balance_credit على transactions) لم يُسقطا في أي migration،
-- ويُنفَّذان AFTER ROW بترتيب أبجدي بعد التريغرين الجديدين، فيطمسان القيمة الصحيحة.
--
-- الأثر المباشر على خطة كشف الحساب الجديدة: عند تسوية الرصيد الدائن يدوياً على
-- فاتورة (apply_customer_credit_to_invoice يُدرج قيد customer_credit سالب)، يعيد
-- التريغر القديم حساب credit_balance من القيود الموجبة فقط فلا يُخصم المستهلَك ⇒
-- ازدواج/إعادة استخدام نفس الرصيد. كما تتضخّم المديونية بفواتير POS/الملغاة.
--
-- الإصلاح آمن وidempotent:
--   1) إسقاط التريغرين القديمين (IF EXISTS — بلا أثر إن كانا غير موجودين).
--   2) إعادة تعريف recalc_customer_balance(uuid) لتفوّض للنسخة الموحّدة (دفاعياً
--      لأي مستدعٍ متبقٍّ، وبما أن recalc_all_customer_balances سبق توحيدها).
--   3) إعادة حساب أرصدة كل العملاء بالمنطق الصحيح لتصحيح أي انحراف مخزَّن.
-- ============================================================

-- 1) أوقف التريغرين القديمين عن الكتابة فوق القيم الصحيحة.
DROP TRIGGER IF EXISTS trg_sync_customer_balance ON public.invoices;
DROP TRIGGER IF EXISTS trg_sync_customer_balance_credit ON public.transactions;

-- 2) وحّد الدالة المفردة القديمة لتفوّض للنسخة الصحيحة (في حال بقي مستدعٍ لها).
CREATE OR REPLACE FUNCTION public.recalc_customer_balance(_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_customer_balance(_customer_id);
END;
$$;

-- 3) تصحيح فوري لكل الأرصدة المخزّنة بالمنطق الموحّد.
SELECT public.recompute_customer_balance(id) FROM public.customers;

NOTIFY pgrst, 'reload schema';
