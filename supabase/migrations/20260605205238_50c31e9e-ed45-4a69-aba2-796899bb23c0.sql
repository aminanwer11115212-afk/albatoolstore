
CREATE TABLE public.destinations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.destinations TO authenticated, anon;
GRANT ALL ON public.destinations TO service_role;
ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_destinations" ON public.destinations FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE TABLE public.transaction_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.transaction_categories TO authenticated, anon;
GRANT ALL ON public.transaction_categories TO service_role;
ALTER TABLE public.transaction_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_transaction_categories" ON public.transaction_categories FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE TABLE public.billing_terms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'general',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.billing_terms TO authenticated, anon;
GRANT ALL ON public.billing_terms TO service_role;
ALTER TABLE public.billing_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_billing_terms" ON public.billing_terms FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE TABLE public.notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.notes TO authenticated, anon;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_notes" ON public.notes FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  file_url TEXT,
  file_type TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.documents TO authenticated, anon;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_documents" ON public.documents FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE TABLE public.todos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.todos TO authenticated, anon;
GRANT ALL ON public.todos TO service_role;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_todos" ON public.todos FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE TABLE public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period TEXT NOT NULL DEFAULT 'monthly',
  target_revenue NUMERIC DEFAULT 0,
  target_expenses NUMERIC DEFAULT 0,
  target_sales NUMERIC DEFAULT 0,
  target_net_income NUMERIC DEFAULT 0,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.goals TO authenticated, anon;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_goals" ON public.goals FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'employee',
  status TEXT DEFAULT 'active',
  phone TEXT,
  email TEXT,
  salary NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_employees" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'السودان',
  ADD COLUMN IF NOT EXISTS postbox text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS invoice_prefix text DEFAULT 'INV-',
  ADD COLUMN IF NOT EXISTS quote_prefix text DEFAULT 'QT-',
  ADD COLUMN IF NOT EXISTS purchase_prefix text DEFAULT 'PO-',
  ADD COLUMN IF NOT EXISTS recurring_prefix text DEFAULT 'REC-',
  ADD COLUMN IF NOT EXISTS return_prefix text DEFAULT 'RET-',
  ADD COLUMN IF NOT EXISTS transaction_prefix text DEFAULT 'TRX-',
  ADD COLUMN IF NOT EXISTS invoice_notes text DEFAULT 'شكراً لتعاملكم معنا',
  ADD COLUMN IF NOT EXISTS invoice_footer text,
  ADD COLUMN IF NOT EXISTS payment_terms_days integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS show_tax boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_discount boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_shipping boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS iban text;
