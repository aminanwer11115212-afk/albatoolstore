
-- Destinations
CREATE TABLE public.destinations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon full access destinations" ON public.destinations FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access destinations" ON public.destinations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Transaction Categories
CREATE TABLE public.transaction_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.transaction_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon full access transaction_categories" ON public.transaction_categories FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access transaction_categories" ON public.transaction_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Billing Terms
CREATE TABLE public.billing_terms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'general',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon full access billing_terms" ON public.billing_terms FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access billing_terms" ON public.billing_terms FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Notes
CREATE TABLE public.notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon full access notes" ON public.notes FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access notes" ON public.notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Documents
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  file_url TEXT,
  file_type TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon full access documents" ON public.documents FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access documents" ON public.documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Todos
CREATE TABLE public.todos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon full access todos" ON public.todos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access todos" ON public.todos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Goals
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon full access goals" ON public.goals FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access goals" ON public.goals FOR ALL TO authenticated USING (true) WITH CHECK (true);
