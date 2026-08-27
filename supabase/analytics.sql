-- =========================================================
-- COFFRE À DOM — Table des visites (tableau de bord)
-- À exécuter dans Supabase → SQL Editor → Run
-- =========================================================
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
