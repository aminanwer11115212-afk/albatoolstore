-- Helper to require authenticated user
-- Using auth.uid() IS NOT NULL instead of true

-- ============ accounts ============
DROP POLICY IF EXISTS "Anyone can delete accounts" ON public.accounts;
DROP POLICY IF EXISTS "Anyone can insert accounts" ON public.accounts;
DROP POLICY IF EXISTS "Anyone can update accounts" ON public.accounts;
CREATE POLICY "accounts_delete_admin" ON public.accounts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "accounts_insert_auth" ON public.accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "accounts_update_auth" ON public.accounts FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ customer_groups ============
DROP POLICY IF EXISTS "Anyone can delete customer_groups" ON public.customer_groups;
DROP POLICY IF EXISTS "Anyone can insert customer_groups" ON public.customer_groups;
DROP POLICY IF EXISTS "Anyone can update customer_groups" ON public.customer_groups;
CREATE POLICY "customer_groups_delete_admin" ON public.customer_groups FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "customer_groups_insert_auth" ON public.customer_groups FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "customer_groups_update_auth" ON public.customer_groups FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ packaging_types ============
DROP POLICY IF EXISTS "Anyone can delete packaging_types" ON public.packaging_types;
DROP POLICY IF EXISTS "Anyone can insert packaging_types" ON public.packaging_types;
DROP POLICY IF EXISTS "Anyone can update packaging_types" ON public.packaging_types;
CREATE POLICY "packaging_types_delete_admin" ON public.packaging_types FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "packaging_types_insert_auth" ON public.packaging_types FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "packaging_types_update_auth" ON public.packaging_types FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ product_categories ============
DROP POLICY IF EXISTS "Anyone can delete product_categories" ON public.product_categories;
DROP POLICY IF EXISTS "Anyone can insert product_categories" ON public.product_categories;
DROP POLICY IF EXISTS "Anyone can update product_categories" ON public.product_categories;
CREATE POLICY "product_categories_delete_admin" ON public.product_categories FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "product_categories_insert_auth" ON public.product_categories FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "product_categories_update_auth" ON public.product_categories FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ product_companies ============
DROP POLICY IF EXISTS "Anyone can delete product_companies" ON public.product_companies;
DROP POLICY IF EXISTS "Anyone can insert product_companies" ON public.product_companies;
DROP POLICY IF EXISTS "Anyone can update product_companies" ON public.product_companies;
CREATE POLICY "product_companies_delete_admin" ON public.product_companies FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "product_companies_insert_auth" ON public.product_companies FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "product_companies_update_auth" ON public.product_companies FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ products ============
DROP POLICY IF EXISTS "Anyone can delete products" ON public.products;
DROP POLICY IF EXISTS "Anyone can insert products" ON public.products;
DROP POLICY IF EXISTS "Anyone can update products" ON public.products;
CREATE POLICY "products_delete_admin" ON public.products FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "products_insert_auth" ON public.products FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "products_update_auth" ON public.products FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ projects ============
DROP POLICY IF EXISTS "Anyone can delete projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can update projects" ON public.projects;
CREATE POLICY "projects_delete_admin" ON public.projects FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "projects_insert_auth" ON public.projects FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "projects_update_auth" ON public.projects FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ purchase_orders ============
DROP POLICY IF EXISTS "Anyone can delete purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Anyone can insert purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Anyone can update purchase_orders" ON public.purchase_orders;
CREATE POLICY "purchase_orders_delete_admin" ON public.purchase_orders FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "purchase_orders_insert_auth" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "purchase_orders_update_auth" ON public.purchase_orders FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ purchase_order_items ============
DROP POLICY IF EXISTS "Anyone can delete purchase_order_items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Anyone can insert purchase_order_items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Anyone can update purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "purchase_order_items_delete_admin" ON public.purchase_order_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "purchase_order_items_insert_auth" ON public.purchase_order_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "purchase_order_items_update_auth" ON public.purchase_order_items FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ invoice_items ============
DROP POLICY IF EXISTS "Anyone can delete invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Anyone can insert invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Anyone can update invoice_items" ON public.invoice_items;
CREATE POLICY "invoice_items_delete_auth" ON public.invoice_items FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "invoice_items_insert_auth" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "invoice_items_update_auth" ON public.invoice_items FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ employees ============
DROP POLICY IF EXISTS "Authenticated can delete employees" ON public.employees;
DROP POLICY IF EXISTS "Authenticated can insert employees" ON public.employees;
DROP POLICY IF EXISTS "Authenticated can update employees" ON public.employees;
CREATE POLICY "employees_delete_admin" ON public.employees FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "employees_insert_admin" ON public.employees FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "employees_update_admin" ON public.employees FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- ============ company_settings ============
DROP POLICY IF EXISTS "Anyone can insert company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Anyone can update company_settings" ON public.company_settings;
CREATE POLICY "company_settings_insert_admin" ON public.company_settings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "company_settings_update_admin" ON public.company_settings FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- ============ customers (only update inserts/updates, delete already admin) ============
DROP POLICY IF EXISTS "Anyone can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can update customers" ON public.customers;
CREATE POLICY "customers_insert_auth" ON public.customers FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "customers_update_auth" ON public.customers FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);