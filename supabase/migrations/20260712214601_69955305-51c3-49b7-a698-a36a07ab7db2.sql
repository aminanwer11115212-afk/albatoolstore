
CREATE TABLE public.discount_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  entity_number text,
  customer_id uuid,
  supplier_id uuid,
  discount_before numeric NOT NULL DEFAULT 0,
  discount_added numeric NOT NULL DEFAULT 0,
  discount_after numeric NOT NULL DEFAULT 0,
  total_before numeric NOT NULL DEFAULT 0,
  total_after numeric NOT NULL DEFAULT 0,
  balance_before numeric,
  balance_after numeric,
  source text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.discount_audit_log TO authenticated;
GRANT ALL ON public.discount_audit_log TO service_role;

ALTER TABLE public.discount_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discount_audit_read"
  ON public.discount_audit_log FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "discount_audit_insert"
  ON public.discount_audit_log FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE INDEX idx_discount_audit_customer ON public.discount_audit_log(customer_id, created_at DESC);
CREATE INDEX idx_discount_audit_supplier ON public.discount_audit_log(supplier_id, created_at DESC);
CREATE INDEX idx_discount_audit_entity ON public.discount_audit_log(entity_type, entity_id, created_at DESC);
