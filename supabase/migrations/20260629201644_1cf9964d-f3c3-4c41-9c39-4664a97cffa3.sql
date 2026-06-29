ALTER TABLE public._e2e_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "_e2e_results_all" ON public._e2e_results FOR ALL TO authenticated USING (true) WITH CHECK (true);