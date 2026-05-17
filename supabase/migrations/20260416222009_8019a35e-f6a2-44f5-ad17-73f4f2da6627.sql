
-- ============ Batch C: Activity Log + Deleted Items History ============

-- 1) Activity log table (universal audit trail)
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL, -- 'INSERT' | 'UPDATE' | 'DELETE'
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[],
  changed_by TEXT,
  user_id UUID,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_table ON public.activity_log(table_name);
CREATE INDEX IF NOT EXISTS idx_activity_log_record ON public.activity_log(record_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON public.activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON public.activity_log(created_at DESC);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can read activity_log"
ON public.activity_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth can insert activity_log"
ON public.activity_log FOR INSERT TO authenticated WITH CHECK (true);

-- No update/delete policies — log is immutable

-- 2) Deleted invoice items archive
CREATE TABLE IF NOT EXISTS public.deleted_invoice_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_id UUID,
  invoice_id UUID,
  product_id UUID,
  product_name TEXT,
  quantity INTEGER,
  unit_price NUMERIC,
  discount NUMERIC,
  discount_value NUMERIC,
  format_discount TEXT,
  foreign_price NUMERIC,
  unit TEXT,
  tax_rate NUMERIC,
  tax_status TEXT,
  total NUMERIC,
  full_data JSONB,
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deleted_invoice_items_invoice ON public.deleted_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_deleted_invoice_items_deleted_at ON public.deleted_invoice_items(deleted_at DESC);

ALTER TABLE public.deleted_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can read deleted_invoice_items"
ON public.deleted_invoice_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth can insert deleted_invoice_items"
ON public.deleted_invoice_items FOR INSERT TO authenticated WITH CHECK (true);

-- 3) Deleted quote items archive
CREATE TABLE IF NOT EXISTS public.deleted_quote_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_id UUID,
  quote_id UUID,
  product_id UUID,
  product_name TEXT,
  quantity INTEGER,
  unit_price NUMERIC,
  discount NUMERIC,
  discount_value NUMERIC,
  format_discount TEXT,
  foreign_price NUMERIC,
  unit TEXT,
  tax_status TEXT,
  total NUMERIC,
  full_data JSONB,
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deleted_quote_items_quote ON public.deleted_quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_deleted_quote_items_deleted_at ON public.deleted_quote_items(deleted_at DESC);

ALTER TABLE public.deleted_quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can read deleted_quote_items"
ON public.deleted_quote_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth can insert deleted_quote_items"
ON public.deleted_quote_items FOR INSERT TO authenticated WITH CHECK (true);

-- 4) Generic activity log function
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_changed TEXT[];
  v_record_id UUID;
  v_key TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record_id := (v_old->>'id')::UUID;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_record_id := (v_new->>'id')::UUID;
  ELSE -- UPDATE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := (v_new->>'id')::UUID;
    -- compute changed field names
    v_changed := ARRAY[]::TEXT[];
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_key NOT IN ('updated_at') AND (v_old->v_key) IS DISTINCT FROM (v_new->v_key) THEN
        v_changed := array_append(v_changed, v_key);
      END IF;
    END LOOP;
    -- skip pure timestamp-only updates
    IF array_length(v_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.activity_log (table_name, record_id, action, old_data, new_data, changed_fields, user_id)
  VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_old, v_new, v_changed, auth.uid());

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5) Archive deleted invoice_items
CREATE OR REPLACE FUNCTION public.archive_deleted_invoice_item()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.deleted_invoice_items (
    original_id, invoice_id, product_id, product_name, quantity, unit_price,
    discount, discount_value, format_discount, foreign_price, unit, tax_rate, tax_status, total,
    full_data, deleted_by
  ) VALUES (
    OLD.id, OLD.invoice_id, OLD.product_id, OLD.product_name, OLD.quantity, OLD.unit_price,
    OLD.discount, OLD.discount_value, OLD.format_discount, OLD.foreign_price, OLD.unit, OLD.tax_rate, OLD.tax_status, OLD.total,
    to_jsonb(OLD), COALESCE(auth.uid()::text, 'system')
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6) Archive deleted quote_items
CREATE OR REPLACE FUNCTION public.archive_deleted_quote_item()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.deleted_quote_items (
    original_id, quote_id, product_id, product_name, quantity, unit_price,
    discount, discount_value, format_discount, foreign_price, unit, tax_status, total,
    full_data, deleted_by
  ) VALUES (
    OLD.id, OLD.quote_id, OLD.product_id, OLD.product_name, OLD.quantity, OLD.unit_price,
    OLD.discount, OLD.discount_value, OLD.format_discount, OLD.foreign_price, OLD.unit, OLD.tax_status, OLD.total,
    to_jsonb(OLD), COALESCE(auth.uid()::text, 'system')
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7) Attach activity_log triggers to main tables
DROP TRIGGER IF EXISTS trg_activity_invoices ON public.invoices;
CREATE TRIGGER trg_activity_invoices AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS trg_activity_invoice_items ON public.invoice_items;
CREATE TRIGGER trg_activity_invoice_items AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS trg_activity_quotes ON public.quotes;
CREATE TRIGGER trg_activity_quotes AFTER INSERT OR UPDATE OR DELETE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS trg_activity_quote_items ON public.quote_items;
CREATE TRIGGER trg_activity_quote_items AFTER INSERT OR UPDATE OR DELETE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS trg_activity_customers ON public.customers;
CREATE TRIGGER trg_activity_customers AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS trg_activity_products ON public.products;
CREATE TRIGGER trg_activity_products AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS trg_activity_transactions ON public.transactions;
CREATE TRIGGER trg_activity_transactions AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS trg_activity_stock_returns ON public.stock_returns;
CREATE TRIGGER trg_activity_stock_returns AFTER INSERT OR UPDATE OR DELETE ON public.stock_returns
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS trg_activity_suppliers ON public.suppliers;
CREATE TRIGGER trg_activity_suppliers AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- 8) Attach archive triggers (BEFORE DELETE so we capture the row)
DROP TRIGGER IF EXISTS trg_archive_invoice_item ON public.invoice_items;
CREATE TRIGGER trg_archive_invoice_item BEFORE DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_invoice_item();

DROP TRIGGER IF EXISTS trg_archive_quote_item ON public.quote_items;
CREATE TRIGGER trg_archive_quote_item BEFORE DELETE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_quote_item();
