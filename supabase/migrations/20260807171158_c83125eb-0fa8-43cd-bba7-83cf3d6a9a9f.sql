ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS manager_name text;

COMMENT ON COLUMN public.company_settings.manager_name IS
  'اسم المسؤول — يظهر في شريط بيانات الشركة أعلى ورقة الفاتورة/العرض/المرتجع';