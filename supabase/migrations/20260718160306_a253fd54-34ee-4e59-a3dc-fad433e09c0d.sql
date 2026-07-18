
-- Enrich deleted-items archive tables with the columns the UI expects.
ALTER TABLE public.deleted_invoice_items
  ADD COLUMN IF NOT EXISTS original_id uuid,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS tax_status text,
  ADD COLUMN IF NOT EXISTS foreign_price numeric,
  ADD COLUMN IF NOT EXISTS discount_value numeric,
  ADD COLUMN IF NOT EXISTS format_discount text,
  ADD COLUMN IF NOT EXISTS full_data jsonb;

ALTER TABLE public.deleted_quote_items
  ADD COLUMN IF NOT EXISTS original_id uuid,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS tax_status text,
  ADD COLUMN IF NOT EXISTS foreign_price numeric,
  ADD COLUMN IF NOT EXISTS discount_value numeric,
  ADD COLUMN IF NOT EXISTS format_discount text,
  ADD COLUMN IF NOT EXISTS full_data jsonb;

-- Allow the quantity column to hold fractional values that some line-items use.
ALTER TABLE public.deleted_invoice_items ALTER COLUMN quantity TYPE numeric;
ALTER TABLE public.deleted_quote_items ALTER COLUMN quantity TYPE numeric;

CREATE INDEX IF NOT EXISTS idx_deleted_invoice_items_invoice ON public.deleted_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_deleted_invoice_items_deleted_at ON public.deleted_invoice_items(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_quote_items_quote ON public.deleted_quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_deleted_quote_items_deleted_at ON public.deleted_quote_items(deleted_at DESC);

-- Session-level bypass flag helper: when app.skip_archive = '1' the trigger
-- skips archiving (used by silent-delete RPCs during full-replace / conversion).
CREATE OR REPLACE FUNCTION public.archive_deleted_invoice_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_skip text;
BEGIN
  BEGIN
    v_skip := current_setting('app.skip_archive', true);
  EXCEPTION WHEN OTHERS THEN v_skip := NULL;
  END;
  IF v_skip = '1' THEN RETURN OLD; END IF;

  INSERT INTO public.deleted_invoice_items (
    original_id, invoice_id, product_id, product_name, quantity, unit_price,
    discount, discount_value, format_discount, foreign_price, unit, tax_status, total,
    full_data, deleted_by
  ) VALUES (
    OLD.id, OLD.invoice_id, OLD.product_id, COALESCE(OLD.product_name,'—'),
    OLD.quantity, OLD.unit_price,
    OLD.discount, OLD.discount_value, OLD.format_discount, OLD.foreign_price,
    OLD.unit, OLD.tax_status, OLD.total,
    to_jsonb(OLD), COALESCE(auth.uid()::text, 'system')
  );
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_deleted_quote_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_skip text;
BEGIN
  BEGIN
    v_skip := current_setting('app.skip_archive', true);
  EXCEPTION WHEN OTHERS THEN v_skip := NULL;
  END;
  IF v_skip = '1' THEN RETURN OLD; END IF;

  INSERT INTO public.deleted_quote_items (
    original_id, quote_id, product_id, product_name, quantity, unit_price,
    discount, discount_value, format_discount, foreign_price, unit, tax_status, total,
    full_data, deleted_by
  ) VALUES (
    OLD.id, OLD.quote_id, OLD.product_id, COALESCE(OLD.product_name,'—'),
    OLD.quantity, OLD.unit_price,
    OLD.discount, OLD.discount_value, OLD.format_discount, OLD.foreign_price,
    OLD.unit, OLD.tax_status, OLD.total,
    to_jsonb(OLD), COALESCE(auth.uid()::text, 'system')
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_invoice_item ON public.invoice_items;
CREATE TRIGGER trg_archive_invoice_item
  BEFORE DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_invoice_item();

DROP TRIGGER IF EXISTS trg_archive_quote_item ON public.quote_items;
CREATE TRIGGER trg_archive_quote_item
  BEFORE DELETE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_quote_item();

-- Silent-delete RPCs: bypass archiving because they are used during
-- full-replace saves (not user-intent item removal).
CREATE OR REPLACE FUNCTION public.delete_invoice_items_silent(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('app.skip_archive', '1', true);
  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_quote_items_silent(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('app.skip_archive', '1', true);
  DELETE FROM public.quote_items WHERE quote_id = p_quote_id;
END;
$$;
