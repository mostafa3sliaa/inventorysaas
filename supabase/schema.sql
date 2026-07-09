-- Create custom types
CREATE TYPE user_role AS ENUM ('admin', 'sales');
CREATE TYPE order_status AS ENUM ('pending', 'shipped', 'delivered', 'returned', 'cancelled');
CREATE TYPE purchase_status AS ENUM ('pending', 'completed', 'cancelled');

-- Tenants table
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (extends auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role user_role DEFAULT 'sales',
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Suppliers
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  balance NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product Variants
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT UNIQUE,
  barcode TEXT UNIQUE,
  size TEXT,
  color TEXT,
  normal_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  special_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_quantity INT NOT NULL DEFAULT 0,
  low_stock_threshold INT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchases (Supplier Ledger)
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status purchase_status DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase Items
CREATE TABLE purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INT NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL
);

-- Customers
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  status order_status DEFAULT 'pending',
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order Items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL
);

-- Shipments
CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  courier TEXT NOT NULL,
  tracking_number TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

-- Create helper function to get current user's tenant_id
CREATE OR REPLACE FUNCTION get_current_tenant_id() RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.users WHERE id = auth.uid();
  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies

-- Tenants: users can view their own tenant
CREATE POLICY "Users can view their own tenant" ON tenants
  FOR SELECT USING (id = get_current_tenant_id());

-- Users: users can view other users in the same tenant
CREATE POLICY "Users can view co-workers" ON users
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- Suppliers
CREATE POLICY "Tenant isolation for suppliers" ON suppliers
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- Products
CREATE POLICY "Tenant isolation for products" ON products
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- Product Variants
CREATE POLICY "Tenant isolation for product_variants" ON product_variants
  FOR ALL USING (product_id IN (SELECT id FROM products WHERE tenant_id = get_current_tenant_id()));

-- Purchases
CREATE POLICY "Tenant isolation for purchases" ON purchases
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- Purchase Items
CREATE POLICY "Tenant isolation for purchase_items" ON purchase_items
  FOR ALL USING (purchase_id IN (SELECT id FROM purchases WHERE tenant_id = get_current_tenant_id()));

-- Customers
CREATE POLICY "Tenant isolation for customers" ON customers
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- Orders
CREATE POLICY "Tenant isolation for orders" ON orders
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- Order Items
CREATE POLICY "Tenant isolation for order_items" ON order_items
  FOR ALL USING (order_id IN (SELECT id FROM orders WHERE tenant_id = get_current_tenant_id()));

-- Shipments
CREATE POLICY "Tenant isolation for shipments" ON shipments
  FOR ALL USING (order_id IN (SELECT id FROM orders WHERE tenant_id = get_current_tenant_id()));

-- Trigger to update inventory on new order item
CREATE OR REPLACE FUNCTION update_inventory_on_order() RETURNS TRIGGER AS $$
BEGIN
  UPDATE product_variants
  SET stock_quantity = stock_quantity - NEW.quantity
  WHERE id = NEW.product_variant_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inventory_on_order
AFTER INSERT ON order_items
FOR EACH ROW EXECUTE FUNCTION update_inventory_on_order();

-- Trigger to update supplier balance and inventory on purchase
CREATE OR REPLACE FUNCTION process_purchase() RETURNS TRIGGER AS $$
BEGIN
  -- We'll handle purchase items separately, this just updates the supplier balance
  UPDATE suppliers
  SET balance = balance + (NEW.total_amount - NEW.paid_amount)
  WHERE id = NEW.supplier_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_process_purchase
AFTER INSERT ON purchases
FOR EACH ROW EXECUTE FUNCTION process_purchase();

CREATE OR REPLACE FUNCTION update_inventory_on_purchase() RETURNS TRIGGER AS $$
BEGIN
  UPDATE product_variants
  SET stock_quantity = stock_quantity + NEW.quantity
  WHERE id = NEW.product_variant_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inventory_on_purchase
AFTER INSERT ON purchase_items
FOR EACH ROW EXECUTE FUNCTION update_inventory_on_purchase();

-- Trigger to automatically create a tenant and user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_tenant_id uuid;
BEGIN
  -- Create a new tenant for the user
  INSERT INTO public.tenants (name)
  VALUES (COALESCE(new.raw_user_meta_data->>'full_name', 'مؤسسة جديدة'))
  RETURNING id INTO new_tenant_id;

  -- Create the user profile
  INSERT INTO public.users (id, tenant_id, role, email, full_name)
  VALUES (
    new.id,
    new_tenant_id,
    'admin',
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', 'المدير')
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
-- ==========================================
-- ROW LEVEL SECURITY (RLS) SETUP
-- ==========================================

-- 1. Create a secure function to get the current user's tenant_id
CREATE OR REPLACE FUNCTION current_tenant_id() 
RETURNS UUID AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- 3. Create Policies for Base Tables (Tables with tenant_id)
-- Tenants
CREATE POLICY "Users can access their own tenant" ON tenants FOR ALL USING (id = current_tenant_id());

-- Users
CREATE POLICY "Users can access co-workers" ON users FOR ALL USING (tenant_id = current_tenant_id());

-- Other Base Tables
CREATE POLICY "Tenant Isolation" ON suppliers FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "Tenant Isolation" ON products FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "Tenant Isolation" ON purchases FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "Tenant Isolation" ON customers FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "Tenant Isolation" ON orders FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "Tenant Isolation" ON transactions FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "Tenant Isolation" ON activity_logs FOR ALL USING (tenant_id = current_tenant_id());

-- 4. Create Policies for Child Tables (Tables linked to a parent table with tenant_id)
-- Product Variants
CREATE POLICY "Tenant Isolation" ON product_variants FOR ALL USING (
  product_id IN (SELECT id FROM products WHERE tenant_id = current_tenant_id())
);

-- Purchase Items
CREATE POLICY "Tenant Isolation" ON purchase_items FOR ALL USING (
  purchase_id IN (SELECT id FROM purchases WHERE tenant_id = current_tenant_id())
);

-- Order Items
CREATE POLICY "Tenant Isolation" ON order_items FOR ALL USING (
  order_id IN (SELECT id FROM orders WHERE tenant_id = current_tenant_id())
);

-- Shipments
CREATE POLICY "Tenant Isolation" ON shipments FOR ALL USING (
  order_id IN (SELECT id FROM orders WHERE tenant_id = current_tenant_id())
);
