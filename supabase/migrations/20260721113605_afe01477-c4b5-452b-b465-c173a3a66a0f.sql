
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS bot_auto_repair_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.bot_scan_customer_balance_drift()
RETURNS TABLE(customer_id uuid, customer_name text, stored_balance numeric, expected_balance numeric, delta numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH exp AS (
    SELECT c.id, COALESCE(c.balance,0) AS stored,
      COALESCE((
        SELECT SUM(GREATEST(COALESCE(i.total,0) - COALESCE(i.paid_amount,0), 0))
        FROM public.invoices i
        WHERE i.customer_id = c.id
          AND COALESCE(i.status,'') <> 'cancelled'
          AND COALESCE(i.source,'') <> 'pos'
      ),0) AS expected,
      c.name
    FROM public.customers c
  )
  SELECT id, name, stored, expected, stored-expected FROM exp
  WHERE ABS(stored-expected) > 0.01;
$$;

CREATE OR REPLACE FUNCTION public.bot_scan_supplier_balance_drift()
RETURNS TABLE(supplier_id uuid, supplier_name text, stored_balance numeric, expected_balance numeric, delta numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH exp AS (
    SELECT s.id, s.name, COALESCE(s.balance,0) AS stored,
      COALESCE((
        SELECT SUM(GREATEST(COALESCE(po.total,0) - COALESCE(po.paid_amount,0), 0))
        FROM public.purchase_orders po
        WHERE po.supplier_id = s.id AND COALESCE(po.status,'') <> 'cancelled'
      ),0) AS expected
    FROM public.suppliers s
  )
  SELECT id, name, stored, expected, stored-expected FROM exp
  WHERE ABS(stored-expected) > 0.01;
$$;

CREATE OR REPLACE FUNCTION public.bot_scan_account_balance_drift()
RETURNS TABLE(account_id uuid, account_name text, stored_balance numeric, expected_balance numeric, delta numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH exp AS (
    SELECT a.id, a.name, COALESCE(a.balance,0) AS stored,
      COALESCE((
        SELECT SUM(CASE
          WHEN t.type='income'   AND t.account_id=a.id      THEN t.amount
          WHEN t.type='expense'  AND t.account_id=a.id      THEN -t.amount
          WHEN t.type='transfer' AND t.to_account_id=a.id   THEN t.amount
          WHEN t.type='transfer' AND t.account_id=a.id      THEN -t.amount
          ELSE 0 END)
        FROM public.transactions t
        WHERE t.account_id=a.id OR t.to_account_id=a.id
      ),0) AS expected
    FROM public.accounts a
  )
  SELECT id, name, stored, expected, stored-expected FROM exp
  WHERE ABS(stored-expected) > 0.01;
$$;

CREATE OR REPLACE FUNCTION public.bot_scan_pos_leak()
RETURNS TABLE(customer_id uuid, customer_name text, leaked_invoices int, leaked_transactions int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.name,
    (SELECT COUNT(*) FROM public.invoices i
       WHERE i.customer_id=c.id AND i.source='pos'
         AND GREATEST(COALESCE(i.total,0)-COALESCE(i.paid_amount,0),0) > 0
         AND COALESCE(i.status,'') <> 'cancelled')::int,
    (SELECT COUNT(*) FROM public.transactions t
       WHERE t.customer_id=c.id
         AND t.reference_id IN (
           SELECT id::text FROM public.invoices WHERE customer_id=c.id AND source='pos'
         ))::int
  FROM public.customers c
  WHERE EXISTS (SELECT 1 FROM public.invoices i WHERE i.customer_id=c.id AND i.source='pos');
$$;

CREATE OR REPLACE FUNCTION public.bot_scan_stock_drift()
RETURNS TABLE(product_id uuid, product_name text, stored_qty numeric, expected_qty numeric, delta numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH mv AS (
    SELECT p.id, p.name,
      COALESCE(p.stock_quantity,0)::numeric AS stored,
      (
        COALESCE((SELECT SUM(quantity) FROM public.purchase_order_items poi
                    JOIN public.purchase_orders po ON po.id=poi.purchase_order_id
                    WHERE poi.product_id=p.id AND COALESCE(po.status,'')<>'cancelled'),0)
        - COALESCE((SELECT SUM(quantity) FROM public.invoice_items ii
                      JOIN public.invoices i ON i.id=ii.invoice_id
                      WHERE ii.product_id=p.id AND COALESCE(i.status,'')<>'cancelled'),0)
        + COALESCE((SELECT SUM(quantity) FROM public.stock_return_items sri
                      JOIN public.stock_returns sr ON sr.id=sri.stock_return_id
                      WHERE sri.product_id=p.id AND COALESCE(sr.status,'')<>'cancelled'),0)
        + COALESCE((SELECT SUM(delta) FROM public.stock_adjustments_log
                      WHERE product_id=p.id),0)
      )::numeric AS expected
    FROM public.products p
  )
  SELECT id, name, stored, expected, stored-expected FROM mv
  WHERE ABS(stored-expected) > 0.01;
$$;

CREATE OR REPLACE FUNCTION public.bot_scan_incomplete_returns()
RETURNS TABLE(return_id uuid, return_number text, return_date date, items_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT sr.id, sr.return_number, sr.date,
         (SELECT COUNT(*)::int FROM public.stock_return_items WHERE stock_return_id=sr.id)
  FROM public.stock_returns sr
  WHERE COALESCE(sr.status,'') <> 'cancelled'
    AND NOT EXISTS (SELECT 1 FROM public.stock_adjustments_log l WHERE l.reference_id = sr.id::text)
    AND EXISTS (SELECT 1 FROM public.stock_return_items WHERE stock_return_id=sr.id);
$$;

CREATE OR REPLACE FUNCTION public.bot_scan_health_v3()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inv int; v_cust int; v_sup int; v_acc int; v_pos int; v_stk int; v_ret int;
BEGIN
  SELECT COUNT(*) INTO v_inv  FROM public.bot_scan_invoice_anomalies_v2(NULL,NULL,NULL);
  SELECT COUNT(*) INTO v_cust FROM public.bot_scan_customer_balance_drift();
  SELECT COUNT(*) INTO v_sup  FROM public.bot_scan_supplier_balance_drift();
  SELECT COUNT(*) INTO v_acc  FROM public.bot_scan_account_balance_drift();
  SELECT COUNT(*) INTO v_pos  FROM public.bot_scan_pos_leak() WHERE leaked_invoices>0 OR leaked_transactions>0;
  SELECT COUNT(*) INTO v_stk  FROM public.bot_scan_stock_drift();
  SELECT COUNT(*) INTO v_ret  FROM public.bot_scan_incomplete_returns();
  RETURN jsonb_build_object(
    'ok', (v_inv+v_cust+v_sup+v_acc+v_stk+v_ret) = 0,
    'run_at', now(),
    'sections', jsonb_build_object(
      'invoice_anomalies', v_inv,
      'customer_balance_drift', v_cust,
      'supplier_balance_drift', v_sup,
      'account_balance_drift', v_acc,
      'pos_leak', v_pos,
      'stock_drift', v_stk,
      'incomplete_returns', v_ret
    ),
    'total', v_inv+v_cust+v_sup+v_acc+v_stk+v_ret
  );
END; $$;

CREATE OR REPLACE FUNCTION public.bot_repair_health_v3(
  _dry_run boolean DEFAULT false,
  _sections text[] DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_before jsonb; v_after jsonb;
  v_details jsonb := '{}'::jsonb;
  v_id uuid;
  v_count int;
  v_want_all boolean := (_sections IS NULL OR array_length(_sections,1) IS NULL);
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'admin') THEN
    RAISE EXCEPTION 'unauthorized_admin_only';
  END IF;
  v_before := public.bot_scan_health_v3();

  IF _dry_run THEN
    INSERT INTO public.bot_audit_log(action, actor_uid, actor_role, dry_run, filters, before_state, details)
      VALUES ('health_repair_v3', v_uid, 'admin', true,
              jsonb_build_object('sections', _sections), v_before, jsonb_build_object('note', _note));
    RETURN jsonb_build_object('ok', true, 'dry_run', true, 'before', v_before);
  END IF;

  IF v_want_all OR 'invoice_anomalies' = ANY(_sections) THEN
    v_count := 0;
    FOR v_id IN SELECT invoice_id FROM public.bot_scan_invoice_anomalies_v2(NULL,NULL,NULL) LOOP
      PERFORM public.bot_repair_invoice(v_id);
      v_count := v_count + 1;
    END LOOP;
    v_details := v_details || jsonb_build_object('invoices_repaired', v_count);
  END IF;

  IF v_want_all OR 'customer_balance_drift' = ANY(_sections) THEN
    PERFORM public.recalc_all_customer_balances();
    v_details := v_details || jsonb_build_object('customers_recomputed', true);
  END IF;

  IF v_want_all OR 'supplier_balance_drift' = ANY(_sections) THEN
    PERFORM public.recalc_all_supplier_balances();
    v_details := v_details || jsonb_build_object('suppliers_recomputed', true);
  END IF;

  IF v_want_all OR 'account_balance_drift' = ANY(_sections) THEN
    PERFORM public.recalc_all_account_balances();
    v_details := v_details || jsonb_build_object('accounts_recomputed', true);
  END IF;

  IF v_want_all OR 'stock_drift' = ANY(_sections) THEN
    v_count := 0;
    DECLARE r record;
    BEGIN
      FOR r IN SELECT * FROM public.bot_scan_stock_drift() LOOP
        UPDATE public.products SET stock_quantity = r.expected_qty::int WHERE id = r.product_id;
        INSERT INTO public.stock_adjustments_log(product_id, delta, before_qty, after_qty, reason, source, reference_id, actor_uid)
          VALUES (r.product_id, r.expected_qty - r.stored_qty, r.stored_qty, r.expected_qty,
                  'إصلاح بوت الحسابات v3', 'bot_repair_v3', r.product_id::text, v_uid);
        v_count := v_count + 1;
      END LOOP;
    END;
    v_details := v_details || jsonb_build_object('stock_adjusted', v_count);
  END IF;

  v_after := public.bot_scan_health_v3();
  INSERT INTO public.bot_audit_log(action, actor_uid, actor_role, dry_run, filters, before_state, after_state, details)
    VALUES ('health_repair_v3', v_uid, 'admin', false,
            jsonb_build_object('sections', _sections), v_before, v_after, v_details || jsonb_build_object('note', _note));

  RETURN jsonb_build_object('ok', true, 'before', v_before, 'after', v_after, 'details', v_details);
END; $$;

CREATE OR REPLACE FUNCTION public.bot_auto_maintenance()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_enabled boolean; v_before jsonb; v_after jsonb; v_id uuid; v_details jsonb := '{}'::jsonb; v_count int;
BEGIN
  SELECT COALESCE(bot_auto_repair_enabled,false) INTO v_enabled FROM public.company_settings LIMIT 1;
  v_before := public.bot_scan_health_v3();

  IF NOT v_enabled THEN
    PERFORM public.bot_run_snapshot('auto');
    RETURN jsonb_build_object('ok', true, 'mode','snapshot_only','report', v_before);
  END IF;

  v_count := 0;
  FOR v_id IN SELECT invoice_id FROM public.bot_scan_invoice_anomalies_v2(NULL,NULL,NULL) LOOP
    PERFORM public.bot_repair_invoice(v_id);
    v_count := v_count + 1;
  END LOOP;
  v_details := v_details || jsonb_build_object('invoices_repaired', v_count);

  PERFORM public.recalc_all_customer_balances();
  PERFORM public.recalc_all_supplier_balances();
  PERFORM public.recalc_all_account_balances();
  v_details := v_details || jsonb_build_object('balances_recomputed', true);

  v_after := public.bot_scan_health_v3();
  INSERT INTO public.bot_audit_log(action, actor_uid, actor_role, dry_run, filters, before_state, after_state, details)
    VALUES ('auto_maintenance', NULL, 'system', false, '{}'::jsonb, v_before, v_after, v_details);
  PERFORM public.bot_run_snapshot('auto');
  RETURN jsonb_build_object('ok', true, 'mode','auto_repair','before', v_before,'after', v_after);
END; $$;

REVOKE ALL ON FUNCTION public.bot_scan_customer_balance_drift() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bot_scan_supplier_balance_drift() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bot_scan_account_balance_drift() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bot_scan_pos_leak() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bot_scan_stock_drift() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bot_scan_incomplete_returns() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bot_scan_health_v3() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bot_repair_health_v3(boolean,text[],text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bot_auto_maintenance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bot_scan_customer_balance_drift() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bot_scan_supplier_balance_drift() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bot_scan_account_balance_drift()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.bot_scan_pos_leak()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.bot_scan_stock_drift()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.bot_scan_incomplete_returns()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.bot_scan_health_v3()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.bot_repair_health_v3(boolean,text[],text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bot_auto_maintenance()             TO service_role;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bot_auto_maintenance_every_6h') THEN
    PERFORM cron.unschedule('bot_auto_maintenance_every_6h');
  END IF;
  PERFORM cron.schedule(
    'bot_auto_maintenance_every_6h',
    '15 */6 * * *',
    $sql$ SELECT public.bot_auto_maintenance(); $sql$
  );
END $do$;
