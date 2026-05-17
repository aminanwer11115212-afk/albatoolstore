CREATE TABLE public.quote_ownership_transfers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id uuid NOT NULL,
  from_user_id uuid,
  to_user_id uuid NOT NULL,
  from_user_name text,
  to_user_name text,
  transferred_by uuid NOT NULL,
  transferred_by_name text,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.quote_ownership_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qot_select_admin" ON public.quote_ownership_transfers
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "qot_insert_admin" ON public.quote_ownership_transfers
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND transferred_by = auth.uid());

CREATE INDEX idx_qot_quote_id ON public.quote_ownership_transfers(quote_id);
CREATE INDEX idx_qot_created_at ON public.quote_ownership_transfers(created_at DESC);