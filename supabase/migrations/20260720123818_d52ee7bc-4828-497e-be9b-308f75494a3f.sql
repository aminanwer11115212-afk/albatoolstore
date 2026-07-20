
GRANT SELECT ON public.regions TO anon;
GRANT SELECT ON public.states TO anon;
GRANT SELECT ON public.cities TO anon;
GRANT SELECT ON public.localities TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.regions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.states TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.localities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.destinations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transporters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_destinations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_preferred_transporter TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_transporters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.destination_transporters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locality_transporters TO authenticated;

GRANT ALL ON public.regions TO service_role;
GRANT ALL ON public.states TO service_role;
GRANT ALL ON public.cities TO service_role;
GRANT ALL ON public.localities TO service_role;
GRANT ALL ON public.customer_groups TO service_role;
GRANT ALL ON public.destinations TO service_role;
GRANT ALL ON public.transporters TO service_role;
GRANT ALL ON public.customer_destinations TO service_role;
GRANT ALL ON public.customer_preferred_transporter TO service_role;
GRANT ALL ON public.customer_transporters TO service_role;
GRANT ALL ON public.destination_transporters TO service_role;
GRANT ALL ON public.locality_transporters TO service_role;
