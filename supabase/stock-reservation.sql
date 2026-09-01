-- =========================================================
-- Anti-survente : réservation ATOMIQUE du stock
-- Garantit qu'on ne vend jamais plus que le stock, même si 50
-- clients paient au même instant (verrou de ligne Postgres).
-- À jouer une fois dans Supabase (SQL Editor) AVANT de publier.
-- Idempotent : réexécutable sans risque.
-- =========================================================

-- Marque une commande dont le stock a été réservé (pour pouvoir le rendre si non payée).
alter table if exists public.orders
  add column if not exists stock_reserved boolean not null default false;

-- Réserve p_qty unités du produit p_slug de façon atomique.
-- Retour :  >= 0  → stock restant après réservation (OK)
--           999999 → produit à stock illimité (non suivi) : rien à réserver, OK
--           -1     → stock insuffisant OU produit introuvable (REFUS)
create or replace function public.reserve_stock(p_slug text, p_qty int)
returns int
language plpgsql
as $$
declare
  cur     int;
  new_qty int;
begin
  select stock_qty into cur from public.products where slug = p_slug;
  if not found then
    return -1;               -- produit inexistant
  end if;
  if cur is null then
    return 999999;           -- stock non suivi (illimité) → pas de réservation
  end if;
  -- Décrément gardé : la clause WHERE + le verrou de ligne rendent l'opération atomique.
  update public.products
     set stock_qty = stock_qty - p_qty,
         in_stock  = (stock_qty - p_qty) > 0
   where slug = p_slug
     and stock_qty >= p_qty
   returning stock_qty into new_qty;
  if new_qty is null then
    return -1;               -- stock insuffisant
  end if;
  return new_qty;
end;
$$;

-- Rend p_qty unités au stock (commande non payée / annulée / expirée).
create or replace function public.release_stock(p_slug text, p_qty int)
returns void
language plpgsql
as $$
begin
  update public.products
     set stock_qty = stock_qty + p_qty,
         in_stock  = true
   where slug = p_slug
     and stock_qty is not null;
end;
$$;
