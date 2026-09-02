-- =========================================================
-- Catégories : colonnes complètes (corrige « Erreur produits »
-- au renommage quand la colonne visible/icon/description manque).
-- À jouer une fois dans Supabase (SQL Editor). Idempotent.
-- =========================================================
alter table if exists public.categories add column if not exists icon        text;
alter table if exists public.categories add column if not exists description text default '';
alter table if exists public.categories add column if not exists visible     boolean default true;

-- Idem côté produits (visibilité) par sécurité.
alter table if exists public.products   add column if not exists visible     boolean default true;
