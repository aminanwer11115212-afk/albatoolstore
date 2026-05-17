
-- invoice_revisions: admin-only SELECT
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT polname FROM pg_policy
    WHERE polrelid = 'public.invoice_revisions'::regclass AND polcmd = 'r'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.invoice_revisions', r.polname);
  END LOOP;
END $$;
CREATE POLICY "invoice_revisions_select_admin" ON public.invoice_revisions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- data_anomaly_runs: admin-only SELECT
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT polname FROM pg_policy
    WHERE polrelid = 'public.data_anomaly_runs'::regclass AND polcmd = 'r'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.data_anomaly_runs', r.polname);
  END LOOP;
END $$;
CREATE POLICY "data_anomaly_runs_select_admin" ON public.data_anomaly_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
