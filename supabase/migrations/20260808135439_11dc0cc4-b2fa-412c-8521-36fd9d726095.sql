-- ============================================================================
-- ١) due_amount يتجمّد عند السداد من الرصيد
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_invoice_due_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.due_amount := GREATEST(
    ROUND((COALESCE(NEW.total, 0) - COALESCE(NEW.paid_amount, 0))::numeric, 2),
    0
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_invoice_due_amount() IS
  'due_amount = total − paid_amount دائماً. عمودٌ محسوب لا يُكتب يدوياً.';

DROP TRIGGER IF EXISTS trg_sync_invoice_due_amount ON public.invoices;
CREATE TRIGGER trg_sync_invoice_due_amount
  BEFORE INSERT OR UPDATE OF total, paid_amount, due_amount ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_due_amount();

UPDATE public.invoices
   SET due_amount = GREATEST(ROUND((COALESCE(total, 0) - COALESCE(paid_amount, 0))::numeric, 2), 0)
 WHERE ABS(
         COALESCE(due_amount, 0)
         - GREATEST(ROUND((COALESCE(total, 0) - COALESCE(paid_amount, 0))::numeric, 2), 0)
       ) > 0.01;

-- ============================================================================
-- ٢) نزع سلاح التوزيع التلقائي
-- ============================================================================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'auto_settle_customer_credit'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('DROP FUNCTION %s', r.sig);
    RAISE NOTICE 'dropped %', r.sig;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'company_settings'
       AND column_name = 'auto_settle_credit_enabled'
  ) THEN
    EXECUTE $q$
      UPDATE public.company_settings
         SET auto_settle_credit_enabled = false
       WHERE COALESCE(auto_settle_credit_enabled, false) IS DISTINCT FROM false
    $q$;
  ELSE
    RAISE NOTICE 'company_settings.auto_settle_credit_enabled غير موجود — تُخطّى';
  END IF;
END $$;