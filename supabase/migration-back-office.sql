-- =========================================================
-- COFFRE À DOM — Migration back office (à jouer 1 fois)
-- Supabase → SQL Editor → coller → Run
-- Active : champs SEO, marque produit, suivi d'expédition, compteur de visites.
-- Sans risque : "if not exists" partout, rejouable sans danger.
-- =========================================================

-- 1) SEO + marque + traductions par produit
alter table public.products add column if not exists seo_title       text;
alter table public.products add column if not exists seo_description text;
alter table public.products add column if not exists brand           text;
-- traductions : { "en": {"name":"…","desc":"…"}, "it": {…}, "de": {…} }  (repli FR si absent)
alter table public.products add column if not exists translations    jsonb;

-- 1b) Visibilité des catégories (mettre en ligne / hors ligne)
alter table public.categories add column if not exists visible boolean default true;

-- 2) Suivi d'expédition / remise des commandes
--    (null = pas encore expédiée ; date = expédiée/remise)
alter table public.orders add column if not exists fulfilled_at timestamptz;

-- 3) Compteur de visites (tableau de bord)
create table if not exists public.page_views (
  id         bigint generated always as identity primary key,
  path       text,
  ref        text,
  day        date default ((now() at time zone 'utc')::date),
  created_at timestamptz default now()
);
create index if not exists idx_page_views_day on public.page_views(day);
alter table public.page_views enable row level security;
-- Aucune policy publique : l'écriture passe par la fonction serveur (clé secrète).
