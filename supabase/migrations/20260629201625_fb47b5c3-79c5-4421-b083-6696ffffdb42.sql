
CREATE TABLE IF NOT EXISTS public._e2e_results (
  check_name text PRIMARY KEY,
  details text,
  verdict text,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public._e2e_results TO authenticated, service_role;
