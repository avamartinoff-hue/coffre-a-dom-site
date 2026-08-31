-- =========================================================
-- Coffre à Dom — Codes promo
-- À jouer dans Supabase (SQL Editor) AVANT de publier la fonctionnalité.
-- Idempotent.
-- =========================================================

create table if not exists public.promo_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,               -- toujours en MAJUSCULES
  kind        text not null default 'percent',    -- 'percent' (%) | 'fixed' (CHF)
  value       numeric not null default 0,
  active      boolean not null default true,
  min_amount  numeric not null default 0,         -- sous-total minimum du panier
  expires_at  date,                               -- optionnel (AAAA-MM-JJ)
  max_uses    int,                                -- optionnel (limite d'utilisations)
  used_count  int not null default 0,
  created_at  timestamptz not null default now()
);

-- RLS activée, aucune policy publique : lisible/écrit seulement par la clé secrète (service_role)
alter table public.promo_codes enable row level security;

-- Colonnes sur les commandes : code appliqué + remise en CHF
alter table public.orders add column if not exists promo_code text;
alter table public.orders add column if not exists discount numeric not null default 0;
