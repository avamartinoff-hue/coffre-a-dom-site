-- =========================================================
-- COFFRE À DOM — Schéma Supabase (Postgres)
-- À exécuter dans : Supabase → SQL Editor → New query → Run
-- Idempotent : peut être relancé sans casser l'existant.
-- =========================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ---------- Fonction utilitaire : updated_at ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- =========================================================
-- CATÉGORIES
-- =========================================================
create table if not exists public.categories (
  slug        text primary key,
  name        text not null,
  parent      text references public.categories(slug) on delete set null,
  icon        text,
  description text default '',
  position    int  default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

-- =========================================================
-- PRODUITS
-- =========================================================
create table if not exists public.products (
  slug         text primary key,
  name         text not null,
  description  text default '',
  price        numeric(10,2) not null default 0,
  category     text references public.categories(slug) on delete set null,
  image        text,
  on_sale      boolean default false,
  in_stock     boolean default true,
  stock_qty    int,                        -- null = non suivi
  sku          text,
  visible      boolean default true,       -- masquer sans supprimer
  position     int default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists idx_products_category on public.products(category);
create index if not exists idx_products_visible  on public.products(visible);
drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- =========================================================
-- PROFILS (extension de auth.users) — espace membre / VIP
-- =========================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  is_vip      boolean default false,
  vip_since   timestamptz,
  tickets     int default 0,              -- coffres mystères
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crée automatiquement un profil à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- COMMANDES
-- =========================================================
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text unique not null,
  user_id          uuid references auth.users(id) on delete set null, -- null = invité
  email            text not null,
  phone            text,
  full_name        text,
  shipping_mode    text not null default 'retrait',   -- 'retrait' | 'poste'
  shipping_address jsonb,
  payment_method   text not null,                     -- 'sumup' | 'twint'
  payment_status   text not null default 'pending',   -- 'pending' | 'paid' | 'failed' | 'cancelled'
  sumup_checkout_id text,
  subtotal         numeric(10,2) not null default 0,
  shipping_fee     numeric(10,2) not null default 0,
  total            numeric(10,2) not null default 0,
  note             text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  paid_at          timestamptz
);
create index if not exists idx_orders_user   on public.orders(user_id);
create index if not exists idx_orders_status on public.orders(payment_status);
create index if not exists idx_orders_created on public.orders(created_at desc);
drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

create table if not exists public.order_items (
  id            bigint generated always as identity primary key,
  order_id      uuid not null references public.orders(id) on delete cascade,
  product_slug  text,
  name          text not null,
  unit_price    numeric(10,2) not null,
  qty           int not null check (qty > 0),
  line_total    numeric(10,2) not null
);
create index if not exists idx_order_items_order on public.order_items(order_id);

-- =========================================================
-- ROW LEVEL SECURITY (RLS)
-- Principe : lecture catalogue publique ; écritures commandes
-- uniquement via le backend (clé service_role, qui contourne RLS).
-- =========================================================
alter table public.categories  enable row level security;
alter table public.products    enable row level security;
alter table public.profiles    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- Catalogue : lecture publique
drop policy if exists "cat public read" on public.categories;
create policy "cat public read" on public.categories for select using (true);

drop policy if exists "prod public read" on public.products;
create policy "prod public read" on public.products for select using (visible = true);

-- Profils : chacun voit/modifie le sien
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- Commandes : un membre connecté voit les siennes (les invités passent par le backend)
drop policy if exists "own orders read" on public.orders;
create policy "own orders read" on public.orders for select using (auth.uid() = user_id);
drop policy if exists "own order items read" on public.order_items;
create policy "own order items read" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- (Aucune policy d'INSERT/UPDATE pour anon : création de commande = backend service_role.)
