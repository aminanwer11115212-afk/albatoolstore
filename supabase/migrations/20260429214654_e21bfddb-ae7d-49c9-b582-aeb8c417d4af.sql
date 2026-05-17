-- Regions
CREATE TABLE public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth full access regions" ON public.regions FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.regions (name, code, sort_order) VALUES
  ('الشمال', 'north', 1),
  ('الجنوب', 'south', 2),
  ('الشرق',  'east',  3),
  ('الغرب',  'west',  4);

-- States
CREATE TABLE public.states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region_id, name)
);
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth full access states" ON public.states FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_states_region ON public.states(region_id);

-- Localities
CREATE TABLE public.localities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id uuid NOT NULL REFERENCES public.states(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (state_id, name)
);
ALTER TABLE public.localities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth full access localities" ON public.localities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_localities_state ON public.localities(state_id);

-- Locality default transporters (الناقلون الافتراضيون لكل محلية)
CREATE TABLE public.locality_transporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locality_id uuid NOT NULL REFERENCES public.localities(id) ON DELETE CASCADE,
  transporter_id uuid NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (locality_id, transporter_id)
);
ALTER TABLE public.locality_transporters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth full access lt" ON public.locality_transporters FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_lt_locality ON public.locality_transporters(locality_id);

-- Add geo columns to customers
ALTER TABLE public.customers
  ADD COLUMN region_id   uuid REFERENCES public.regions(id)   ON DELETE SET NULL,
  ADD COLUMN state_id    uuid REFERENCES public.states(id)    ON DELETE SET NULL,
  ADD COLUMN locality_id uuid REFERENCES public.localities(id) ON DELETE SET NULL;

CREATE INDEX idx_customers_region   ON public.customers(region_id);
CREATE INDEX idx_customers_state    ON public.customers(state_id);
CREATE INDEX idx_customers_locality ON public.customers(locality_id);

-- updated_at triggers
CREATE TRIGGER trg_states_updated_at BEFORE UPDATE ON public.states
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_localities_updated_at BEFORE UPDATE ON public.localities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();