-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Customer Groups
CREATE TABLE public.customer_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read customer_groups" ON public.customer_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert customer_groups" ON public.customer_groups FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update customer_groups" ON public.customer_groups FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete customer_groups" ON public.customer_groups FOR DELETE TO authenticated USING (true);

-- Customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  group_id UUID REFERENCES public.customer_groups(id) ON DELETE SET NULL,
  balance NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update customers" ON public.customers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete customers" ON public.customers FOR DELETE TO authenticated USING (true);

-- Suppliers
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  company TEXT,
  balance NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete suppliers" ON public.suppliers FOR DELETE TO authenticated USING (true);

-- Product Categories
CREATE TABLE public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read product_categories" ON public.product_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert product_categories" ON public.product_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update product_categories" ON public.product_categories FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete product_categories" ON public.product_categories FOR DELETE TO authenticated USING (true);

-- Warehouses
CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read warehouses" ON public.warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert warehouses" ON public.warehouses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update warehouses" ON public.warehouses FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete warehouses" ON public.warehouses FOR DELETE TO authenticated USING (true);

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  purchase_price NUMERIC(15,2) DEFAULT 0,
  sale_price NUMERIC(15,2) DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  unit TEXT DEFAULT 'قطعة',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update products" ON public.products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete products" ON public.products FOR DELETE TO authenticated USING (true);

-- Accounts
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  account_number TEXT,
  account_type TEXT DEFAULT 'bank',
  balance NUMERIC(15,2) DEFAULT 0,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read accounts" ON public.accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert accounts" ON public.accounts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update accounts" ON public.accounts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete accounts" ON public.accounts FOR DELETE TO authenticated USING (true);

-- Transactions
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount NUMERIC(15,2) NOT NULL,
  description TEXT,
  category TEXT,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  to_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read transactions" ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update transactions" ON public.transactions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete transactions" ON public.transactions FOR DELETE TO authenticated USING (true);

-- Invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  type TEXT DEFAULT 'sale' CHECK (type IN ('sale', 'cash', 'quote')),
  subtotal NUMERIC(15,2) DEFAULT 0,
  tax_amount NUMERIC(15,2) DEFAULT 0,
  discount NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  paid_amount NUMERIC(15,2) DEFAULT 0,
  due_amount NUMERIC(15,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'partial', 'pending', 'overdue', 'cancelled')),
  notes TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update invoices" ON public.invoices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete invoices" ON public.invoices FOR DELETE TO authenticated USING (true);

-- Invoice Items
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,2) NOT NULL,
  discount NUMERIC(15,2) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  total NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read invoice_items" ON public.invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert invoice_items" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update invoice_items" ON public.invoice_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete invoice_items" ON public.invoice_items FOR DELETE TO authenticated USING (true);

-- Purchase Orders
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  subtotal NUMERIC(15,2) DEFAULT 0,
  tax_amount NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'cancelled')),
  notes TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read purchase_orders" ON public.purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert purchase_orders" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update purchase_orders" ON public.purchase_orders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete purchase_orders" ON public.purchase_orders FOR DELETE TO authenticated USING (true);

-- Purchase Order Items
CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,2) NOT NULL,
  total NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read purchase_order_items" ON public.purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert purchase_order_items" ON public.purchase_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update purchase_order_items" ON public.purchase_order_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete purchase_order_items" ON public.purchase_order_items FOR DELETE TO authenticated USING (true);

-- Stock Returns
CREATE TABLE public.stock_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  total NUMERIC(15,2) DEFAULT 0,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read stock_returns" ON public.stock_returns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert stock_returns" ON public.stock_returns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update stock_returns" ON public.stock_returns FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete stock_returns" ON public.stock_returns FOR DELETE TO authenticated USING (true);

-- Stock Return Items
CREATE TABLE public.stock_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_return_id UUID NOT NULL REFERENCES public.stock_returns(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,2) NOT NULL,
  total NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read stock_return_items" ON public.stock_return_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert stock_return_items" ON public.stock_return_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update stock_return_items" ON public.stock_return_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete stock_return_items" ON public.stock_return_items FOR DELETE TO authenticated USING (true);

-- Transporters
CREATE TABLE public.transporters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  vehicle_type TEXT,
  vehicle_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transporters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read transporters" ON public.transporters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert transporters" ON public.transporters FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update transporters" ON public.transporters FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete transporters" ON public.transporters FOR DELETE TO authenticated USING (true);

-- Packaging Types
CREATE TABLE public.packaging_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.packaging_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read packaging_types" ON public.packaging_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert packaging_types" ON public.packaging_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update packaging_types" ON public.packaging_types FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete packaging_types" ON public.packaging_types FOR DELETE TO authenticated USING (true);

-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  description TEXT,
  budget NUMERIC(15,2) DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled')),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read projects" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update projects" ON public.projects FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete projects" ON public.projects FOR DELETE TO authenticated USING (true);

-- Stock Transfers
CREATE TABLE public.stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  from_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  to_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL,
  notes TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read stock_transfers" ON public.stock_transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert stock_transfers" ON public.stock_transfers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update stock_transfers" ON public.stock_transfers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete stock_transfers" ON public.stock_transfers FOR DELETE TO authenticated USING (true);

-- Company Settings
CREATE TABLE public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'AMINCO',
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_number TEXT,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  currency TEXT DEFAULT 'ج.س',
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read company_settings" ON public.company_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert company_settings" ON public.company_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update company_settings" ON public.company_settings FOR UPDATE TO authenticated USING (true);

-- Quotes
CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  subtotal NUMERIC(15,2) DEFAULT 0,
  tax_amount NUMERIC(15,2) DEFAULT 0,
  discount NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  notes TEXT,
  valid_until DATE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read quotes" ON public.quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert quotes" ON public.quotes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update quotes" ON public.quotes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete quotes" ON public.quotes FOR DELETE TO authenticated USING (true);

-- Quote Items
CREATE TABLE public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,2) NOT NULL,
  discount NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read quote_items" ON public.quote_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert quote_items" ON public.quote_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update quote_items" ON public.quote_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete quote_items" ON public.quote_items FOR DELETE TO authenticated USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transporters_updated_at BEFORE UPDATE ON public.transporters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_company_settings_updated_at BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customer_groups_updated_at BEFORE UPDATE ON public.customer_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_customers_group ON public.customers(group_id);
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_warehouse ON public.products(warehouse_id);
CREATE INDEX idx_transactions_account ON public.transactions(account_id);
CREATE INDEX idx_transactions_date ON public.transactions(date);
CREATE INDEX idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX idx_invoices_date ON public.invoices(date);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_purchase_orders_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX idx_quotes_customer ON public.quotes(customer_id);

-- Insert default data
INSERT INTO public.company_settings (company_name, currency) VALUES ('AMINCO SYSTEM', 'ج.س');
INSERT INTO public.accounts (name, account_type, is_default) VALUES ('الحساب الرئيسي', 'cash', true);
INSERT INTO public.accounts (name, account_type) VALUES ('الحساب البنكي', 'bank');
INSERT INTO public.warehouses (name, location) VALUES ('المستودع الرئيسي', 'الموقع الرئيسي');