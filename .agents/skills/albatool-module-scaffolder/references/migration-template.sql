-- Albatool migration template.
-- Replace <name> with your table name (snake_case, plural).
-- Replace <domain_columns> with the real fields.
-- Order matters: CREATE → GRANT → ALTER ENABLE RLS → POLICY → TRIGGER.

CREATE TABLE public.<name> (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- <domain_columns>
  -- name        text NOT NULL,
  -- amount      numeric NOT NULL DEFAULT 0,
  -- notes       text,
  -- customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- REQUIRED — Data API needs explicit grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<name> TO authenticated;
GRANT ALL ON public.<name> TO service_role;
-- DO NOT grant to anon unless this table is intentionally public.

ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;

-- Default: authenticated users can do everything. Tighten if multi-tenant.
CREATE POLICY "<name>_authenticated_all"
  ON public.<name>
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- updated_at trigger (function already exists in this project)
CREATE TRIGGER update_<name>_updated_at
  BEFORE UPDATE ON public.<name>
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Optional helpful indexes:
-- CREATE INDEX idx_<name>_created_at ON public.<name>(created_at DESC);
-- CREATE INDEX idx_<name>_customer_id ON public.<name>(customer_id);
