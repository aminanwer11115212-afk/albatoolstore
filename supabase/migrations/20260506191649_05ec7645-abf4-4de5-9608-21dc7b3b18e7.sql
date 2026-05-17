
-- Cities table
CREATE TABLE IF NOT EXISTS public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locality_id uuid NOT NULL REFERENCES public.localities(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY cities_select ON public.cities FOR SELECT TO authenticated USING (true);
CREATE POLICY cities_insert ON public.cities FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY cities_update ON public.cities FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY cities_delete ON public.cities FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_cities_updated_at
BEFORE UPDATE ON public.cities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_cities_locality ON public.cities(locality_id);

-- Add city_id to customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL;

-- Wipe old geographic data (clears customer FK refs first)
UPDATE public.customers SET region_id = NULL, state_id = NULL, locality_id = NULL;
DELETE FROM public.locality_transporters;
DELETE FROM public.localities;
DELETE FROM public.states;
DELETE FROM public.regions;
