
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'employee',
  status TEXT DEFAULT 'active',
  phone TEXT,
  email TEXT,
  salary NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon full access employees" ON public.employees FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access employees" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
