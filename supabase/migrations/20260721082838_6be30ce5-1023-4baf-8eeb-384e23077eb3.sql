
-- 1) جدول سجل تدقيق البوت
CREATE TABLE IF NOT EXISTS public.bot_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  invoice_id uuid,
  actor_uid uuid,
  actor_role text,
  dry_run boolean NOT NULL DEFAULT false,
  filters jsonb,
  before_state jsonb,
  after_state jsonb,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bot_audit_log TO authenticated;
GRANT ALL ON public.bot_audit_log TO service_role;
ALTER TABLE public.bot_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read bot audit" ON public.bot_audit_log;
CREATE POLICY "Admins read bot audit" ON public.bot_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2) جدول لقطات الفحص
CREATE TABLE IF NOT EXISTS public.bot_scan_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  anomalies_count int NOT NULL DEFAULT 0,
  by_kind jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'auto'
);
GRANT SELECT ON public.bot_scan_snapshots TO authenticated;
GRANT ALL ON public.bot_scan_snapshots TO service_role;
ALTER TABLE public.bot_scan_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read snapshots" ON public.bot_scan_snapshots;
CREATE POLICY "Authenticated read snapshots" ON public.bot_scan_snapshots
  FOR SELECT TO authenticated USING (true);

-- 3) فحص v2 مع فلترة
CREATE OR REPLACE FUNCTION public.bot_scan_invoice_anomalies_v2(
  _from date DEFAULT NULL, _to date DEFAULT NULL, _kinds text[] DEFAULT NULL
) RETURNS TABLE (
  invoice_id uuid, invoice_number text, customer_id uuid,
  invoice_date date, total numeric, paid_amount numeric,
  sum_payments numeric, delta numeric, kind text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH agg AS (
    SELECT i.id, i.invoice_number, i.customer_id, i.date AS invoice_date,
           i.total, i.paid_amount,
           COALESCE((SELECT SUM(amount) FROM public.transactions t
                       WHERE t.reference_id = i.id::text
                         AND t.category = 'customer_payment'), 0) AS sum_payments
      FROM public.invoices i
     WHERE i.status <> 'cancelled'
       AND (_from IS NULL OR i.date >= _from)
       AND (_to   IS NULL OR i.date <= _to)
  ), classified AS (
    SELECT a.*, (a.paid_amount - a.sum_payments) AS delta,
           CASE
             WHEN ABS(a.paid_amount - a.sum_payments) > 0.01
                  AND a.paid_amount > a.sum_payments THEN 'missing_payment_trace'
             WHEN ABS(a.paid_amount - a.sum_payments) > 0.01
                  AND a.paid_amount < a.sum_payments THEN 'duplicate_payment'
             WHEN a.paid_amount - a.total > 0.01 THEN 'overpaid'
             ELSE 'ok'
           END AS kind
      FROM agg a
  )
  SELECT id AS invoice_id, invoice_number, customer_id, invoice_date,
         total, paid_amount, sum_payments, delta, kind
    FROM classified
   WHERE kind <> 'ok'
     AND (_kinds IS NULL OR kind = ANY(_kinds));
$$;

-- 4) معاينة إصلاح فاتورة
CREATE OR REPLACE FUNCTION public.bot_repair_invoice_preview(_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_sum numeric; v_delta numeric;
  v_dupes int := 0; v_backfill numeric := 0;
  v_new_customer_balance numeric;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'invoice_not_found'); END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum FROM public.transactions
   WHERE reference_id = _invoice_id::text AND category = 'customer_payment';
  v_delta := v_inv.paid_amount - v_sum;

  IF v_delta < -0.01 THEN
    SELECT COUNT(*) INTO v_dupes FROM (
      SELECT ROW_NUMBER() OVER (PARTITION BY reference_id, amount, method, category ORDER BY created_at) AS rn
        FROM public.transactions
       WHERE reference_id = _invoice_id::text
         AND category = 'customer_payment' AND method = 'credit_balance'
    ) x WHERE rn > 1;
  ELSIF v_delta > 0.01 THEN
    v_backfill := v_delta;
  END IF;

  IF v_inv.customer_id IS NOT NULL THEN
    SELECT COALESCE(SUM(GREATEST(COALESCE(total,0) - COALESCE(paid_amount,0), 0)), 0)
      INTO v_new_customer_balance
      FROM public.invoices
     WHERE customer_id = v_inv.customer_id
       AND COALESCE(status,'') <> 'cancelled'
       AND COALESCE(source,'') <> 'pos';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'dry_run', true,
    'invoice_id', _invoice_id, 'invoice_number', v_inv.invoice_number,
    'customer_id', v_inv.customer_id,
    'current', jsonb_build_object('paid_amount', v_inv.paid_amount, 'sum_payments', v_sum, 'delta', v_delta),
    'will_delete_duplicate_pairs', v_dupes,
    'will_backfill_amount', v_backfill,
    'expected_customer_balance', v_new_customer_balance,
    'action', CASE
      WHEN v_delta < -0.01 THEN 'delete_duplicates'
      WHEN v_delta > 0.01  THEN 'backfill_missing_payment'
      ELSE 'noop' END
  );
END; $$;

-- 5) إصلاح فاتورة v2
CREATE OR REPLACE FUNCTION public.bot_repair_invoice_v2(_invoice_id uuid, _dry_run boolean DEFAULT false, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_before jsonb; v_after jsonb; v_result jsonb;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  v_before := public.bot_repair_invoice_preview(_invoice_id);
  IF _dry_run THEN
    INSERT INTO public.bot_audit_log(action, invoice_id, actor_uid, actor_role, dry_run, before_state, details)
      VALUES ('preview', _invoice_id, v_uid,
              CASE WHEN public.has_role(v_uid,'admin') THEN 'admin' ELSE 'user' END,
              true, v_before, jsonb_build_object('note', _note));
    RETURN v_before;
  END IF;
  v_result := public.bot_repair_invoice(_invoice_id);
  v_after  := public.bot_repair_invoice_preview(_invoice_id);
  INSERT INTO public.bot_audit_log(action, invoice_id, actor_uid, actor_role, dry_run, before_state, after_state, details)
    VALUES ('repair_invoice', _invoice_id, v_uid,
            CASE WHEN public.has_role(v_uid,'admin') THEN 'admin' ELSE 'user' END,
            false, v_before, v_after, v_result || jsonb_build_object('note', _note));
  RETURN v_result || jsonb_build_object('audit_logged', true);
END; $$;

-- 6) إصلاح شامل v2 (admin فقط)
CREATE OR REPLACE FUNCTION public.bot_repair_all_v2(
  _from date DEFAULT NULL, _to date DEFAULT NULL,
  _kinds text[] DEFAULT NULL, _dry_run boolean DEFAULT false, _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_targets uuid[];
  v_count int := 0;
  v_previews jsonb := '[]'::jsonb;
  v_id uuid;
  v_prev jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'unauthorized_admin_only';
  END IF;
  SELECT COALESCE(array_agg(invoice_id), '{}') INTO v_targets
    FROM public.bot_scan_invoice_anomalies_v2(_from, _to, _kinds);
  IF _dry_run THEN
    FOREACH v_id IN ARRAY v_targets LOOP
      v_prev := public.bot_repair_invoice_preview(v_id);
      v_previews := v_previews || jsonb_build_array(v_prev);
    END LOOP;
    INSERT INTO public.bot_audit_log(action, actor_uid, actor_role, dry_run, filters, details)
      VALUES ('repair_all', v_uid, 'admin', true,
              jsonb_build_object('from', _from, 'to', _to, 'kinds', _kinds),
              jsonb_build_object('candidates', COALESCE(array_length(v_targets,1),0), 'previews', v_previews, 'note', _note));
    RETURN jsonb_build_object('ok', true, 'dry_run', true,
      'candidates', COALESCE(array_length(v_targets,1),0), 'previews', v_previews);
  END IF;
  FOREACH v_id IN ARRAY v_targets LOOP
    PERFORM public.bot_repair_invoice(v_id);
    v_count := v_count + 1;
  END LOOP;
  PERFORM public.recalc_all_customer_balances();
  PERFORM public.recalc_all_account_balances();
  INSERT INTO public.bot_audit_log(action, actor_uid, actor_role, dry_run, filters, details)
    VALUES ('repair_all', v_uid, 'admin', false,
            jsonb_build_object('from', _from, 'to', _to, 'kinds', _kinds),
            jsonb_build_object('invoices_repaired', v_count, 'note', _note));
  RETURN jsonb_build_object('ok', true, 'invoices_repaired', v_count, 'audit_logged', true, 'ran_at', now());
END; $$;

-- 7) لقطة فحص
CREATE OR REPLACE FUNCTION public.bot_run_snapshot(_source text DEFAULT 'auto')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_results jsonb; v_by_kind jsonb; v_count int; v_id uuid;
BEGIN
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_results
    FROM (SELECT * FROM public.bot_scan_invoice_anomalies_v2(NULL, NULL, NULL)) t;
  SELECT COALESCE(jsonb_object_agg(kind, cnt), '{}'::jsonb) INTO v_by_kind
    FROM (SELECT kind, COUNT(*) AS cnt FROM public.bot_scan_invoice_anomalies_v2(NULL,NULL,NULL) GROUP BY kind) x;
  v_count := jsonb_array_length(v_results);
  INSERT INTO public.bot_scan_snapshots(anomalies_count, by_kind, results, source)
    VALUES (v_count, v_by_kind, v_results, _source) RETURNING id INTO v_id;
  DELETE FROM public.bot_scan_snapshots
   WHERE id NOT IN (SELECT id FROM public.bot_scan_snapshots ORDER BY run_at DESC LIMIT 100);
  RETURN jsonb_build_object('ok', true, 'snapshot_id', v_id, 'anomalies_count', v_count, 'by_kind', v_by_kind);
END; $$;

-- 8) GRANTs على الدوال
REVOKE ALL ON FUNCTION public.bot_scan_invoice_anomalies_v2(date,date,text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bot_repair_invoice_preview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bot_repair_invoice_v2(uuid,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bot_repair_all_v2(date,date,text[],boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bot_run_snapshot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bot_scan_invoice_anomalies_v2(date,date,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bot_repair_invoice_preview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bot_repair_invoice_v2(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bot_repair_all_v2(date,date,text[],boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bot_run_snapshot(text) TO authenticated;

-- 9) جدولة تلقائية كل 6 ساعات
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bot_auto_scan_every_6h') THEN
    PERFORM cron.unschedule('bot_auto_scan_every_6h');
  END IF;
  PERFORM cron.schedule(
    'bot_auto_scan_every_6h',
    '0 */6 * * *',
    $sql$ SELECT public.bot_run_snapshot('auto'); $sql$
  );
END $do$;
