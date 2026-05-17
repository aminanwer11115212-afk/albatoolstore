ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS is_side boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_quotes_is_side ON public.quotes(is_side) WHERE is_side = true;

-- Allow any authenticated user to create side quotes
DROP POLICY IF EXISTS quotes_insert ON public.quotes;