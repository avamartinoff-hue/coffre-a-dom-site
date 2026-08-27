-- =========================================================
-- Coffre à Dom — colonnes e-mails/langue + paniers abandonnés
-- À jouer dans Supabase (SQL Editor) AVANT le déploiement du système d'e-mails.
-- Idempotent (IF NOT EXISTS).
-- =========================================================

-- 1) Langue de la commande (pour les e-mails multilingues) + garde anti-doublon
alter table public.orders add column if not exists lang text not null default 'fr';
alter table public.orders add column if not exists confirmation_sent_at timestamptz;

-- 2) Paniers abandonnés (relance)
create table if not exists public.abandoned_carts (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  lang         text not null default 'fr',
  items        jsonb not null default '[]'::jsonb,
  total        numeric not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  reminded_at  timestamptz,   -- date d'envoi de la relance (une seule)
  recovered_at timestamptz    -- rempli quand la personne finit par commander
);

-- RLS activée, aucune policy publique : lisible/écrit seulement par la clé secrète (service_role)
alter table public.abandoned_carts enable row level security;

create index if not exists abandoned_carts_pending_idx
  on public.abandoned_carts (created_at)
  where recovered_at is null and reminded_at is null;
