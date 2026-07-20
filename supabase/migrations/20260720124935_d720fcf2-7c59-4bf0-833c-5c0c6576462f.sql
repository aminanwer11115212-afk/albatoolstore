
-- إعادة تأكيد الصلاحيات (idempotent) على الجداول الجغرافية واللوجستية
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.states TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.localities TO authenticated;
GRANT SELECT ON public.regions, public.states, public.cities, public.localities TO anon;
GRANT ALL ON public.regions, public.states, public.cities, public.localities TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_groups, public.destinations, public.transporters TO authenticated;
GRANT ALL ON public.customer_groups, public.destinations, public.transporters TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_destinations, public.customer_preferred_transporter, public.customer_transporters TO authenticated;
GRANT ALL ON public.customer_destinations, public.customer_preferred_transporter, public.customer_transporters TO service_role;

-- add_region: يُرتّب sort_order تلقائياً
CREATE OR REPLACE FUNCTION public.add_region(p_name text)
RETURNS public.regions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text := btrim(p_name); v_next int; v_row public.regions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_name IS NULL OR v_name = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next FROM public.regions;
  INSERT INTO public.regions (name, sort_order) VALUES (v_name, v_next) RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.add_state(p_name text, p_region_id uuid)
RETURNS public.states
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text := btrim(p_name); v_row public.states;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_name IS NULL OR v_name = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_region_id IS NULL THEN RAISE EXCEPTION 'region_required'; END IF;
  INSERT INTO public.states (name, region_id) VALUES (v_name, p_region_id) RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.add_city(p_name text, p_state_id uuid)
RETURNS public.cities
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text := btrim(p_name); v_row public.cities;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_name IS NULL OR v_name = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_state_id IS NULL THEN RAISE EXCEPTION 'state_required'; END IF;
  INSERT INTO public.cities (name, state_id) VALUES (v_name, p_state_id) RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.add_locality(p_name text, p_city_id uuid)
RETURNS public.localities
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text := btrim(p_name); v_row public.localities;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_name IS NULL OR v_name = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_city_id IS NULL THEN RAISE EXCEPTION 'city_required'; END IF;
  INSERT INTO public.localities (name, city_id) VALUES (v_name, p_city_id) RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

REVOKE ALL ON FUNCTION public.add_region(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_state(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_city(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_locality(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_region(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_state(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_city(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_locality(text, uuid) TO authenticated;

-- تقرير صلاحيات للاستدعاء من الواجهة
CREATE OR REPLACE FUNCTION public.check_geo_grants()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tables text[] := ARRAY['regions','states','cities','localities',
                           'customer_groups','destinations','transporters',
                           'customer_destinations','customer_preferred_transporter','customer_transporters'];
  v_needed text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE'];
  v_missing text[] := ARRAY[]::text[];
  t text; p text; v_has boolean;
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    FOREACH p IN ARRAY v_needed LOOP
      SELECT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
        WHERE grantee = 'authenticated' AND table_schema = 'public'
          AND table_name = t AND privilege_type = p
      ) INTO v_has;
      IF NOT v_has THEN
        v_missing := array_append(v_missing, t || '.' || p);
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object(
    'ok', COALESCE(array_length(v_missing, 1), 0) = 0,
    'missing', to_jsonb(v_missing),
    'checked_at', now()
  );
END; $$;

REVOKE ALL ON FUNCTION public.check_geo_grants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_geo_grants() TO authenticated, anon;
