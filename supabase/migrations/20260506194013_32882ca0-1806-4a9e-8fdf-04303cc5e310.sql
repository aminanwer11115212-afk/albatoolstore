
-- Flip hierarchy: state -> city -> locality (instead of state -> locality -> city)
-- IDs are preserved by swapping table contents

-- 1) Add new parent columns
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS state_id uuid;
ALTER TABLE public.localities ADD COLUMN IF NOT EXISTS city_id uuid;

-- 2) Make old required columns nullable so we can clear them
ALTER TABLE public.cities ALTER COLUMN locality_id DROP NOT NULL;
ALTER TABLE public.localities ALTER COLUMN state_id DROP NOT NULL;

-- 3) Snapshot then swap contents
CREATE TEMP TABLE _old_cities ON COMMIT DROP AS TABLE public.cities;
CREATE TEMP TABLE _old_localities ON COMMIT DROP AS TABLE public.localities;

DELETE FROM public.cities;
DELETE FROM public.localities;

-- Old localities (big units) become NEW cities, keeping same id
INSERT INTO public.cities (id, name, state_id, created_at, updated_at, locality_id)
SELECT id, name, state_id, created_at, updated_at, NULL
FROM _old_localities;

-- Old cities (small units) become NEW localities, keeping same id
INSERT INTO public.localities (id, name, city_id, state_id, created_at, updated_at)
SELECT id, name, locality_id, NULL, created_at, updated_at
FROM _old_cities;

-- 4) Swap customer references: locality_id <-> city_id
UPDATE public.customers
SET city_id = locality_id,
    locality_id = city_id;

-- 5) Drop legacy columns
ALTER TABLE public.cities DROP COLUMN locality_id;
ALTER TABLE public.localities DROP COLUMN state_id;

-- 6) Enforce parents
ALTER TABLE public.cities ALTER COLUMN state_id SET NOT NULL;
ALTER TABLE public.localities ALTER COLUMN city_id SET NOT NULL;

-- 7) Add FKs and indexes
ALTER TABLE public.cities
  ADD CONSTRAINT cities_state_id_fkey FOREIGN KEY (state_id)
  REFERENCES public.states(id) ON DELETE CASCADE;

ALTER TABLE public.localities
  ADD CONSTRAINT localities_city_id_fkey FOREIGN KEY (city_id)
  REFERENCES public.cities(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cities_state_id ON public.cities(state_id);
CREATE INDEX IF NOT EXISTS idx_localities_city_id ON public.localities(city_id);
