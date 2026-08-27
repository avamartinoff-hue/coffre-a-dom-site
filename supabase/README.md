# Base de données Supabase — Coffre à Dom

Projet : `bjdmeeqzzfxroicxrsna` · URL API : `https://bjdmeeqzzfxroicxrsna.supabase.co`

## 1. Créer les tables + charger le catalogue (2 min)
Dans **Supabase → SQL Editor → New query** :
1. Colle tout le contenu de **`schema.sql`** → **Run** (crée les tables, la sécurité RLS, les profils membres, les commandes).
2. Nouvelle requête → colle **`seed.sql`** → **Run** (charge les 36 catégories + 142 produits réels).

> L'ordre compte : `schema.sql` **avant** `seed.sql`. Les deux sont ré-exécutables sans casse (idempotents).

## 2. Ce dont Claude a besoin pour brancher le site
Dans **Supabase → Project Settings → API** :
- **Project URL** (déjà connu)
- **`anon` public** — clé publique (lecture catalogue)
- **`service_role` secret** — clé serveur (création de commandes, back office)

> La clé `service_role` est **secrète** : elle ira dans les **variables d'environnement Netlify**, jamais dans le code du site.

## Modèle de données
- `categories`, `products` — catalogue (lecture publique), **source de vérité** ; le build Netlify lira les produits ici.
- `profiles` — espace membre (VIP, tickets coffres), créé auto à l'inscription (auth Supabase).
- `orders`, `order_items` — commandes ; statut de paiement `pending | paid | failed | cancelled`, méthode `sumup | twint`.

## Sécurité (RLS activée)
- Catalogue : lecture publique.
- Profils : chacun ne voit/modifie que le sien.
- Commandes : un membre voit les siennes ; **toute création/validation de commande passe par le backend** (Netlify Functions avec la clé `service_role`), jamais directement depuis le navigateur.
