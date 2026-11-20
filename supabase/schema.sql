-- =============================================================================
-- Maicitos ERP 2.0 — Esquema Supabase PostgreSQL (Idempotente)
-- Ejecutar completo en Supabase SQL Editor.
-- =============================================================================

-- 1. Productos / Sabores
create table if not exists public.products (
  id text primary key,
  sku text,
  name text not null,
  short_name text,
  emoji text,
  color text,
  cost_price numeric not null default 12,
  sale_price numeric not null default 20,
  units_per_box int not null default 25,
  min_stock int not null default 100,
  aliases jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 2. Ubicaciones (Bodega y Autos)
create table if not exists public.locations (
  id text primary key,
  name text not null,
  type text not null,
  driver_name text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 3. Libro de movimientos de inventario (Inmutable, Append-Only)
create table if not exists public.stock_movements (
  id uuid primary key,
  created_at timestamptz not null default now(),
  product_id text not null,
  location_id text not null,
  delta int not null,
  movement_type text not null,
  reference_id uuid,
  note text,
  device_id text,
  actor_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 4. Clientes
create table if not exists public.clients (
  id uuid primary key,
  name text not null,
  phone text,
  address text,
  maps_url text,
  price_tier text not null default 'base',
  unit_price numeric not null default 20,
  cycle_days int not null default 7,
  notes text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 5. Pedidos (WhatsApp y Ruta)
create table if not exists public.orders (
  id uuid primary key,
  folio text not null,
  created_at timestamptz not null default now(),
  client_id uuid,
  client_name text not null,
  client_phone text,
  priority text not null default 'media',
  status text not null default 'nuevo',
  assigned_location_id text,
  items jsonb not null default '[]'::jsonb,
  total_bags int not null default 0,
  total_amount numeric not null default 0,
  raw_whatsapp_text text,
  team_notes jsonb not null default '[]'::jsonb,
  created_by_device text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 6. Ventas (Inmutable)
create table if not exists public.sales (
  id uuid primary key,
  folio text not null,
  created_at timestamptz not null default now(),
  order_id uuid,
  client_id uuid,
  client_name text not null,
  location_id text not null,
  seller_name text,
  items jsonb not null default '[]'::jsonb,
  total_bags int not null default 0,
  total_amount numeric not null default 0,
  total_cost numeric not null default 0,
  gross_profit numeric not null default 0,
  cash_paid numeric not null default 0,
  transfer_paid numeric not null default 0,
  credit_amount numeric not null default 0,
  payment_method text not null default 'efectivo',
  note text,
  device_id text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 7. Abonos de Fiado (Inmutable)
create table if not exists public.payments (
  id uuid primary key,
  created_at timestamptz not null default now(),
  client_id uuid not null,
  client_name text not null,
  amount numeric not null,
  method text not null default 'efectivo',
  note text,
  received_by text,
  device_id text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 8. Gastos Operativos (Inmutable)
create table if not exists public.expenses (
  id uuid primary key,
  created_at timestamptz not null default now(),
  category text not null default 'gasolina',
  concept text not null,
  amount numeric not null,
  payment_method text not null default 'efectivo',
  recorded_by text,
  device_id text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 9. Configuración del Negocio
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- 10. Salud de Dispositivos
create table if not exists public.device_heartbeats (
  device_id text primary key,
  device_name text not null,
  role text not null,
  last_seen_at timestamptz not null default now(),
  pending_count int not null default 0,
  app_version text,
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- Índices de sincronización incremental (updated_at)
-- =============================================================================
create index if not exists idx_products_updated_at on public.products (updated_at);
create index if not exists idx_locations_updated_at on public.locations (updated_at);
create index if not exists idx_stock_movements_updated_at on public.stock_movements (updated_at);
create index if not exists idx_clients_updated_at on public.clients (updated_at);
create index if not exists idx_orders_updated_at on public.orders (updated_at);
create index if not exists idx_sales_updated_at on public.sales (updated_at);
create index if not exists idx_payments_updated_at on public.payments (updated_at);
create index if not exists idx_expenses_updated_at on public.expenses (updated_at);
create index if not exists idx_app_settings_updated_at on public.app_settings (updated_at);
create index if not exists idx_device_heartbeats_updated_at on public.device_heartbeats (updated_at);

-- =============================================================================
-- Row Level Security (solo usuario autenticado del negocio)
-- =============================================================================
alter table public.products enable row level security;
alter table public.locations enable row level security;
alter table public.stock_movements enable row level security;
alter table public.clients enable row level security;
alter table public.orders enable row level security;
alter table public.sales enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.app_settings enable row level security;
alter table public.device_heartbeats enable row level security;

drop policy if exists "authenticated_all_products" on public.products;
create policy "authenticated_all_products" on public.products for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all_locations" on public.locations;
create policy "authenticated_all_locations" on public.locations for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all_stock_movements" on public.stock_movements;
create policy "authenticated_all_stock_movements" on public.stock_movements for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all_clients" on public.clients;
create policy "authenticated_all_clients" on public.clients for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all_orders" on public.orders;
create policy "authenticated_all_orders" on public.orders for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all_sales" on public.sales;
create policy "authenticated_all_sales" on public.sales for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all_payments" on public.payments;
create policy "authenticated_all_payments" on public.payments for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all_expenses" on public.expenses;
create policy "authenticated_all_expenses" on public.expenses for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all_app_settings" on public.app_settings;
create policy "authenticated_all_app_settings" on public.app_settings for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all_device_heartbeats" on public.device_heartbeats;
create policy "authenticated_all_device_heartbeats" on public.device_heartbeats for all to authenticated using (true) with check (true);

-- =============================================================================
-- Realtime Publication
-- =============================================================================
do $$
declare
  tbl text;
  tables text[] := array[
    'products',
    'locations',
    'stock_movements',
    'clients',
    'orders',
    'sales',
    'payments',
    'expenses',
    'app_settings',
    'device_heartbeats'
  ];
begin
  foreach tbl in array tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;

-- =============================================================================
-- Datos iniciales (Seed idempotente)
-- =============================================================================
insert into public.products (id, sku, name, short_name, emoji, color, cost_price, sale_price, units_per_box, min_stock, aliases, active, sort_order)
values
  ('fuego', 'MAI-FUE-01', 'Fuego', 'Fuego', '🔥', 'rose', 12, 20, 25, 100, '["fuego","fue","rojo","rojos","flamin","takis","picante"]'::jsonb, true, 1),
  ('salsas-negras', 'MAI-SAL-02', 'Salsas Negras', 'Salsas Negras', '🥢', 'stone', 12, 20, 25, 100, '["salsas negras","salsa negra","salsas","salsa","negras","negra","sal","sn","maggi"]'::jsonb, true, 2),
  ('limon-sal', 'MAI-LIM-03', 'Limón y Sal', 'Limón', '🍋', 'emerald', 12, 20, 25, 100, '["limon y sal","limon sal","limon","limones","lim","verde","natural","clasico"]'::jsonb, true, 3),
  ('ranchero', 'MAI-RAN-04', 'Ranchero', 'Ranchero', '🤠', 'orange', 12, 20, 25, 100, '["ranchero","rancheros","rancho","ran","tomate"]'::jsonb, true, 4),
  ('jalapeno', 'MAI-JAL-05', 'Jalapeño', 'Jalapeño', '🌶️', 'green', 12, 20, 25, 80, '["jalapeno","jalapenos","jal","toreado","chile"]'::jsonb, true, 5),
  ('queso', 'MAI-QUE-06', 'Queso', 'Queso', '🧀', 'amber', 12, 20, 25, 80, '["queso","quesos","que","cheddar","amarillo","amarillos"]'::jsonb, true, 6)
on conflict (id) do nothing;

insert into public.locations (id, name, type, driver_name, active)
values
  ('bodega', 'Bodega Principal', 'warehouse', 'Bodega', true),
  ('auto-papa', 'Auto Papá', 'vehicle', 'Papá', true),
  ('auto-alexis', 'Auto Alexis', 'vehicle', 'Alexis', true)
on conflict (id) do nothing;

insert into public.app_settings (key, value)
values
  (
    'business_config',
    '{
      "business_name": "Maicitos en Frío",
      "admin_pin": "1234",
      "price_tiers": {
        "base": 20,
        "vip": 18,
        "medio": 22
      },
      "default_cost": 12,
      "default_units_per_box": 25
    }'::jsonb
  )
on conflict (key) do nothing;
