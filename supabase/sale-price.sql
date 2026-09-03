-- =========================================================
-- Coffre à Dom — Prix promotionnel (prix barré + nouveau prix)
-- À jouer AVANT de pousser la fonctionnalité promo.
--
-- Modèle : on stocke le PRIX PROMO EFFECTIF en CHF dans `sale_price`.
--   • Dans l'éditeur produit, on saisit soit un % soit un prix fixe :
--     le back-office calcule et enregistre le prix promo en CHF ici.
--   • Un produit est « en promo » si on_sale = true ET 0 < sale_price < price.
--   • Le prix promo est re-calculé côté serveur à la commande (anti-triche).
-- =========================================================

alter table products add column if not exists sale_price numeric;

-- (facultatif) index léger pour retrouver les promos actives
create index if not exists idx_products_sale
  on products (on_sale)
  where on_sale is true;
