# Coffre à Dom — Mise en place Shopify (headless)

Objectif : garder le **front sur-mesure** (Netlify) et brancher **Shopify** comme moteur
e-commerce via la **Storefront API**. Shopify gère catalogue, panier, paiement (TWINT),
stock, comptes clients et **back office**. Le paiement se fait sur le checkout hébergé
Shopify → aucune conformité PCI à porter de notre côté.

```
Visiteur ─▶ Front Netlify (design custom, rapide, CDN)
                 │  Storefront API (lecture produits + création panier)
                 ▼
            Shopify  ─▶ Checkout hébergé (paiement TWINT/carte) ─▶ Back office (commandes, stock)
```

---

## Étapes CÔTÉ CLIENT (Coffre à Dom)

### 1. Créer le compte Shopify
- Essai gratuit sur shopify.com, puis plan **Basic** (~36 CHF/mois en annuel) — suffisant
  pour démarrer, la capacité pour les pics (500+ simultanés) est incluse à tous les plans.

### 2. Migrer la boutique WooCommerce → Shopify (en bloc)
- Exporter depuis WooCommerce (produits, catégories, clients, commandes) — ou me donner
  un accès admin WordPress en lecture pour préparer l'export.
- Installer l'app **Matrixify** (ou « Store Importer » officiel) sur Shopify et importer :
  - Produits (143) avec variantes, prix, photos, stock
  - **Catégories WooCommerce → Collections Shopify** (garde l'arborescence Pokémon, etc.)
  - Clients et historique de commandes
- Vérifier après import : nombre de produits, prix, images, niveaux de stock.

### 3. Paiements
- Activer **Shopify Payments** (ou un prestataire suisse compatible) puis activer **TWINT**
  et les cartes. Configurer la **TVA** suisse.
- Conserver aussi, si souhaité, la mention « paiement échelonné sur demande » (hors ligne).

### 4. Livraison / retrait
- Créer 2 méthodes : **retrait en boutique** (Le Bouveret) et **envoi postal** Suisse
  (depuis St-Gingolph), avec tarifs.

### 5. Générer le jeton Storefront API (pour brancher le front)
Dans l'admin Shopify :
1. **Settings → Apps and sales channels → Develop apps** → *Allow custom app development*.
2. **Create an app** (ex. « Front Netlify »).
3. Onglet **Configuration → Storefront API** → cocher au minimum :
   `unauthenticated_read_product_listings`, `unauthenticated_read_product_inventory`,
   `unauthenticated_read_product_tags`, `unauthenticated_write_checkouts`,
   `unauthenticated_read_checkouts`.
4. **Install app**, puis onglet **API credentials** → copier le **Storefront API access token**.
5. Noter aussi le domaine technique : `xxxxxx.myshopify.com`.

### 6. Me transmettre (pour le branchement)
- Le **domaine** `xxxxxx.myshopify.com`
- Le **Storefront API access token**

> 🔒 **Important** : le jeton Storefront est un jeton **public, en lecture seule** (produits/panier),
> conçu pour être intégré dans un site — c'est sans risque. **Ne me transmets PAS** le mot de
> passe admin ni l'**Admin API** (secret). Je n'en ai pas besoin.

---

## Étapes CÔTÉ MOI (une fois le jeton reçu)

1. **Brancher le catalogue** : `build.mjs` récupère produits & collections depuis la
   Storefront API au moment du build → pages statiques pré-rendues (SEO + vitesse conservés).
   Fallback sur `data/catalog.json` tant que Shopify n'est pas configuré (aperçu local).
2. **Panier → checkout** : le panier crée un panier Shopify (Storefront `cartCreate`) et
   redirige vers le **checkoutUrl** hébergé (paiement TWINT/carte géré par Shopify).
3. **Comptes clients** : liens vers l'espace compte Shopify (ou New Customer Accounts).
4. **Redirections 301** des anciennes URL WordPress → nouvelles (SEO), en partie déjà dans
   `netlify.toml`.
5. **Domaine** : `coffreadom.ch` sur Netlify (front) ; le checkout reste sur le domaine
   Shopify sécurisé (ou sous-domaine `checkout.` / `shop.`).
6. **Recette** : test bout-en-bout d'une commande réelle (retrait + envoi), TWINT compris.

---

## Ce qui reste géré par Shopify (donc plus à maintenir par nous)
Back office complet, sécurité des comptes/mots de passe, conformité PCI des paiements,
prévention de la survente sur stock limité, tenue de charge lors des lancements.

## Salle d'attente (optionnelle, gros lancements)
En façade : **Cloudflare Waiting Room**, **Queue-it**, ou **CrowdHandler** (déjà connu).
Non nécessaire pour « tenir » — utile seulement pour l'équité/anti-bot sur les drops hypés.
