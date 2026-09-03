-- =========================================================
-- Coffre à Dom — REMISE À ZÉRO avant lancement officiel
-- Vide les données de TEST : commandes, paniers abandonnés, visites,
-- et remet le compteur d'usage des codes promo à 0.
--
-- NE TOUCHE PAS : produits, catégories, comptes/profils (VIP, tickets),
-- ni les codes promo eux-mêmes (on garde les codes, on remet juste leur usage à 0).
--
-- ⚠️  IRRÉVERSIBLE. À jouer UNE SEULE FOIS, juste avant l'ouverture au public.
-- =========================================================
begin;

-- 1) Commandes + lignes  → CA, nb commandes, liste clients, « à valider / à livrer »
delete from public.order_items;   -- (aussi supprimées en cascade avec orders, mais on est explicite)
delete from public.orders;

-- 2) Paniers abandonnés  → relances
delete from public.abandoned_carts;

-- 3) Visites (analytics)  → compteur « Visites »
delete from public.page_views;

-- 4) Usage des codes promo remis à 0 (les codes restent actifs)
update public.promo_codes set used_count = 0;

commit;

-- Vérification : doit renvoyer 0 partout
select
  (select count(*) from public.orders)         as commandes,
  (select count(*) from public.order_items)     as lignes,
  (select count(*) from public.abandoned_carts) as paniers_abandonnes,
  (select count(*) from public.page_views)      as visites;
