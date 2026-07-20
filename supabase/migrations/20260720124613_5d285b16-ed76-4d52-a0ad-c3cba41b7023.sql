
-- 1) أعِد المِنَح على جداول الجغرافيا واللوجستيات (idempotent)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['regions','states','cities','localities','customer_groups','destinations','transporters',
                           'customer_destinations','customer_preferred_transporter','customer_transporters',
                           'destination_transporters','locality_transporters']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
  -- قراءة عامة للجداول الجغرافية فقط
  FOREACH t IN ARRAY ARRAY['regions','states','cities','localities'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
  END LOOP;
END $$;

-- 2) دوال إضافة آمنة (SECURITY DEFINER) — تعمل حتى لو نقصت GRANTs
CREATE OR REPLACE FUNCTION public.add_region(p_name text)
RETURNS public.regions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.regions; v_sort int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.regions;
  INSERT INTO public.regions(name, sort_order) VALUES (btrim(p_name), v_sort)
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.add_state(p_name text, p_region_id uuid)
RETURNS public.states
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.states;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_region_id IS NULL THEN RAISE EXCEPTION 'region_required'; END IF;
  INSERT INTO public.states(name, region_id) VALUES (btrim(p_name), p_region_id)
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.add_city(p_name text, p_state_id uuid)
RETURNS public.cities
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.cities;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_state_id IS NULL THEN RAISE EXCEPTION 'state_required'; END IF;
  INSERT INTO public.cities(name, state_id) VALUES (btrim(p_name), p_state_id)
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.add_locality(p_name text, p_city_id uuid)
RETURNS public.localities
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.localities;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_city_id IS NULL THEN RAISE EXCEPTION 'city_required'; END IF;
  INSERT INTO public.localities(name, city_id) VALUES (btrim(p_name), p_city_id)
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.add_region(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_state(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_city(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_locality(text, uuid) TO authenticated;

-- 3) دالة تحقّق من صلاحيات الجداول الجغرافية للاستخدام من الواجهة
CREATE OR REPLACE FUNCTION public.check_geo_grants()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH req AS (
    SELECT unnest(ARRAY['regions','states','cities','localities']) AS t
  ), have AS (
    SELECT table_name AS t
      FROM information_schema.role_table_grants
     WHERE table_schema='public' AND grantee='authenticated'
       AND privilege_type IN ('INSERT','UPDATE','DELETE','SELECT')
     GROUP BY table_name HAVING COUNT(DISTINCT privilege_type) >= 4
  ), missing AS (
    SELECT t FROM req WHERE t NOT IN (SELECT t FROM have)
  )
  SELECT jsonb_build_object(
    'ok', NOT EXISTS (SELECT 1 FROM missing),
    'missing', COALESCE((SELECT jsonb_agg(t) FROM missing), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_geo_grants() TO authenticated, anon;
