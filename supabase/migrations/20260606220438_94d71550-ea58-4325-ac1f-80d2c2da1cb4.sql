
-- ============ 1) ALTER existing tables — missing columns ============
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS region_id uuid,
  ADD COLUMN IF NOT EXISTS state_id uuid,
  ADD COLUMN IF NOT EXISTS city_id uuid,
  ADD COLUMN IF NOT EXISTS locality_id uuid,
  ADD COLUMN IF NOT EXISTS created_by_uid uuid;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS is_frozen boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS barcode text;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS workflow_status text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS currency_code text,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by_uid uuid,
  ADD COLUMN IF NOT EXISTS user_note text,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS foreign_price numeric,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid,
  ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS format_discount text DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS tax_status text;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS workflow_status text DEFAULT 'quote',
  ADD COLUMN IF NOT EXISTS currency_code text,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_side boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_to_invoice_id uuid,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_by uuid,
  ADD COLUMN IF NOT EXISTS user_note text,
  ADD COLUMN IF NOT EXISTS created_by_uid uuid;

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS foreign_price numeric,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS format_discount text DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS tax_status text;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS side_quote_prefix text DEFAULT 'SQ-';

-- Unique index for invoice_number duplicates retry logic
CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_key ON public.invoices(invoice_number);

-- ============ 2) Geo hierarchy tables ============
CREATE TABLE IF NOT EXISTS public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regions TO authenticated, anon;
GRANT ALL ON public.regions TO service_role;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_regions ON public.regions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  region_id uuid REFERENCES public.regions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.states TO authenticated, anon;
GRANT ALL ON public.states TO service_role;
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_states ON public.states FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state_id uuid REFERENCES public.states(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cities TO authenticated, anon;
GRANT ALL ON public.cities TO service_role;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_cities ON public.cities FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.localities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city_id uuid REFERENCES public.cities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.localities TO authenticated, anon;
GRANT ALL ON public.localities TO service_role;
ALTER TABLE public.localities ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_localities ON public.localities FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============ 3) user_roles (secure pattern) ============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','manager','staff','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_roles_self_read ON public.user_roles;
CREATE POLICY user_roles_self_read ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============ 4) RPC functions for invoices ============
CREATE OR REPLACE FUNCTION public.delete_invoice_items_silent(p_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_duplicate_invoice(
  _customer_id uuid, _date date, _items jsonb, _exclude_invoice_id uuid
) RETURNS TABLE(id uuid, invoice_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target_hash text;
BEGIN
  -- Build canonical hash of incoming items: sorted product_id|quantity pairs
  SELECT string_agg(
    coalesce((elem->>'product_id'),'') || '|' || coalesce((elem->>'quantity'),'0'),
    ',' ORDER BY coalesce((elem->>'product_id'),''), coalesce((elem->>'quantity'),'0')
  ) INTO v_target_hash
  FROM jsonb_array_elements(_items) elem;

  RETURN QUERY
  SELECT i.id, i.invoice_number
  FROM public.invoices i
  WHERE i.customer_id = _customer_id
    AND i.date = _date
    AND (_exclude_invoice_id IS NULL OR i.id <> _exclude_invoice_id)
    AND (
      SELECT string_agg(
        coalesce(ii.product_id::text,'') || '|' || coalesce(ii.quantity::text,'0'),
        ',' ORDER BY coalesce(ii.product_id::text,''), coalesce(ii.quantity::text,'0')
      )
      FROM public.invoice_items ii WHERE ii.invoice_id = i.id
    ) = v_target_hash
  LIMIT 1;
END;
$$;

-- ============ 5) Workflow status CHECK + stock deduction trigger ============
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_workflow_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_workflow_status_check
  CHECK (workflow_status IS NULL OR workflow_status IN ('new','preparing','ready_to_ship','in_transit','done'));

CREATE OR REPLACE FUNCTION public.invoices_workflow_stock_deduction_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_already boolean;
BEGIN
  -- Only fire when transitioning OUT of 'new' for the first time
  IF coalesce(OLD.workflow_status,'new') = 'new'
     AND coalesce(NEW.workflow_status,'new') <> 'new' THEN

    -- Idempotency guard: deduct only once per invoice
    SELECT EXISTS (
      SELECT 1 FROM public.activity_log
      WHERE entity_type = 'invoice'
        AND entity_id = NEW.id
        AND action = 'stock_deducted'
    ) INTO v_already;

    IF NOT v_already THEN
      UPDATE public.products p
      SET stock_quantity = coalesce(p.stock_quantity,0) - ii.qty
      FROM (
        SELECT product_id, SUM(quantity)::int AS qty
        FROM public.invoice_items
        WHERE invoice_id = NEW.id AND product_id IS NOT NULL
        GROUP BY product_id
      ) ii
      WHERE p.id = ii.product_id;

      INSERT INTO public.activity_log (entity_type, entity_id, action, details)
      VALUES ('invoice', NEW.id, 'stock_deducted',
              jsonb_build_object('from', OLD.workflow_status, 'to', NEW.workflow_status));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_workflow_stock_deduction ON public.invoices;
CREATE TRIGGER invoices_workflow_stock_deduction
  AFTER UPDATE OF workflow_status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_workflow_stock_deduction_fn();

-- ============ 6) Seed minimal geo data ============
DO $$
DECLARE
  v_region uuid;
  v_state uuid;
  v_city uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.regions) THEN
    INSERT INTO public.regions (name) VALUES ('السودان') RETURNING id INTO v_region;
    INSERT INTO public.states (name, region_id) VALUES ('الخرطوم', v_region) RETURNING id INTO v_state;
    INSERT INTO public.cities (name, state_id) VALUES ('الخرطوم', v_state) RETURNING id INTO v_city;
    INSERT INTO public.localities (name, city_id) VALUES ('وسط الخرطوم', v_city);
  END IF;
END $$;

-- Ensure side_quote_prefix has a value in existing rows
UPDATE public.company_settings SET side_quote_prefix = 'SQ-' WHERE side_quote_prefix IS NULL;
