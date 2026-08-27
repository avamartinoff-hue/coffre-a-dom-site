-- =========================================================
-- COFFRE À DOM — Champs SEO + Marque par produit
-- À exécuter dans Supabase → SQL Editor → Run
-- =========================================================
alter table public.products add column if not exists seo_title text;
alter table public.products add column if not exists seo_description text;
alter table public.products add column if not exists brand text;
alter table public.products add column if not exists translations jsonb;
alter table public.categories add column if not exists visible boolean default true;
