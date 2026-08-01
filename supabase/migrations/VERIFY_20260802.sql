-- فحص بعد تطبيق `20260802000000` — قراءة محضة، لا يغيّر شيئاً.
-- يُنتظر من الأعمدة الأربعة: 0 · 1 · 0 · 0

SELECT
  -- ١) لا فاتورة ينحرف فيها due_amount عن total − paid_amount
  (SELECT count(*) FROM public.invoices
    WHERE ABS(COALESCE(due_amount, 0)
              - GREATEST(ROUND((COALESCE(total,0) - COALESCE(paid_amount,0))::numeric, 2), 0)) > 0.01
  ) AS invoices_still_broken,

  -- ٢) التريغر قائم على invoices
  (SELECT count(*) FROM pg_trigger
    WHERE tgname = 'trg_sync_invoice_due_amount' AND NOT tgisinternal
  ) AS due_trigger_installed,

  -- ٣) دالّة التوزيع التلقائي اختفت بكل أحمالها
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'auto_settle_customer_credit'
  ) AS auto_settle_still_alive,

  -- ٤) لا مفتاح توزيع مُشغَّل (يُرجع 0 أيضاً إن كان العمود غير موجود أصلاً)
  (SELECT COALESCE((
     SELECT count(*) FROM public.company_settings
      WHERE auto_settle_credit_enabled IS TRUE), 0)
   FROM (SELECT 1) _
   WHERE EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='company_settings'
                    AND column_name='auto_settle_credit_enabled')
  ) AS auto_settle_flag_on;
