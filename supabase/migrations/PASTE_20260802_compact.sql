-- نسخة مختصرة للصق المباشر في SQL Editor بلوحة Supabase.
-- مطابقة وظيفياً لـ 20260802000000، بلا شروح ليسهل نسخها من الهاتف.
-- شغّلها مرّة واحدة، ثم شغّل استعلام الفحص في آخر الملف.

CREATE OR REPLACE FUNCTION public.sync_invoice_due_amount() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.due_amount := GREATEST(ROUND((COALESCE(NEW.total,0)-COALESCE(NEW.paid_amount,0))::numeric,2),0);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_invoice_due_amount ON public.invoices;
CREATE TRIGGER trg_sync_invoice_due_amount
  BEFORE INSERT OR UPDATE OF total, paid_amount, due_amount ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_due_amount();

UPDATE public.invoices
   SET due_amount = GREATEST(ROUND((COALESCE(total,0)-COALESCE(paid_amount,0))::numeric,2),0)
 WHERE ABS(COALESCE(due_amount,0)
           - GREATEST(ROUND((COALESCE(total,0)-COALESCE(paid_amount,0))::numeric,2),0)) > 0.01;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='auto_settle_customer_credit'
  LOOP EXECUTE format('DROP FUNCTION %s', r.sig); END LOOP;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='company_settings'
                AND column_name='auto_settle_credit_enabled') THEN
    EXECUTE 'UPDATE public.company_settings SET auto_settle_credit_enabled=false
              WHERE auto_settle_credit_enabled IS TRUE';
  END IF;
END $$;

-- ===== الفحص: المنتظر 0 · 1 · 0 =====
SELECT
  (SELECT count(*) FROM public.invoices
    WHERE ABS(COALESCE(due_amount,0)
              - GREATEST(ROUND((COALESCE(total,0)-COALESCE(paid_amount,0))::numeric,2),0)) > 0.01
  ) AS invoices_still_broken,
  (SELECT count(*) FROM pg_trigger
    WHERE tgname='trg_sync_invoice_due_amount' AND NOT tgisinternal) AS trigger_ok,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='auto_settle_customer_credit') AS auto_settle_alive;
