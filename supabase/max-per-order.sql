-- =========================================================
-- Limite d'achat par commande (par produit).
-- max_per_order = nb max de cet article dans UNE commande (null = illimité).
-- À jouer une fois dans Supabase -> SQL Editor. Idempotent.
-- =========================================================
alter table if exists public.products
  add column if not exists max_per_order int;

comment on column public.products.max_per_order is 'Quantité max de ce produit par commande (null = illimité)';
