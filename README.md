# Coffre à Dom — refonte web (statique, générée, Netlify-ready)

Refonte moderne de [coffreadom.ch](https://www.coffreadom.ch/) : boutique ludique &
vintage au Bouveret (cartes Pokémon, gaming, coffres mystères, VIP, privatisations).

Le site est **100 % statique** mais **généré à partir de données** par un petit moteur
maison (`build.mjs`, un mini-SSG sans dépendance). On décrit le catalogue et les pages
dans des fichiers de données, et le build produit toute l'arborescence dans `/dist` —
scalable de 24 à 143+ produits **sans toucher au HTML**.

## Pourquoi cette architecture
- **Vitesse & tenue en charge** : fichiers statiques servis par le CDN Netlify →
  encaisse sans effort les pics d'affluence (500+ visiteurs simultanés), là où
  l'ancien WordPress saturait sur 2 cœurs.
- **Maintenable** : catégories, produits, articles, événements = du JSON. Le design
  vit dans un seul `styles.css` et deux partials (`header`/`footer`).
- **Commerce-ready** : panier fonctionnel (localStorage) aujourd'hui, prêt à brancher
  **Shopify** (headless) ou **Snipcart** pour le paiement en ligne à grande échelle.

## Structure du projet
```
site-coffre-a-dom/
├── build.mjs            → le générateur (node build.mjs → /dist)
├── serve.mjs           → aperçu local (node serve.mjs → http://localhost:8080)
├── netlify.toml        → build + en-têtes + redirections 301 des anciennes URL
├── styles.css          → design system complet
├── site.js             → nav, méga-menu, menu mobile, animations
├── cart.js             → panier localStorage (compteur, page panier, récap commande)
├── partials/           → header.html (avec méga-menu) + footer.html
├── templates/          → article-body.html
├── pages/              → contenu des 18 pages (fragments HTML)
└── data/
    ├── catalog.json    → 34 catégories + produits (source unique de la boutique)
    ├── pages.json      → manifeste des pages éditoriales (titre, URL, meta)
    ├── blog.json       → 6 articles, 3 catégories, 2 auteurs
    └── events.json     → 2 événements
```

## Ce qui est généré (88 pages)
- Accueil, boutique, panier, commander, mon-compte, à propos, contact, CGV
- 7 pages « espace gaming »
- **34 pages catégories** (`/boutique/<slug>/`) + **24 fiches produits** (`/produit/<slug>/`)
  avec données structurées Schema.org
- Blog : index, 3 catégories, 6 articles, 2 pages auteur
- 2 pages événement
- `sitemap.xml` (toutes les URL) + `robots.txt`

> Le catalogue reproduit fidèlement l'arborescence de la prod (cartes Pokémon et ses
> sous-séries, Magic, One Piece, Dragon Ball, Naruto, hors-cartes…). Les **prix et
> produits sont des exemples** à remplacer dans `data/catalog.json` — ou à alimenter
> automatiquement une fois Shopify branché.

## Développer / prévisualiser
```bash
node build.mjs        # génère /dist
node serve.mjs        # sert /dist sur http://localhost:8080
```
(ou `npm run build`)

## Déploiement Netlify
### Option A — Git (recommandé)
1. Pousser ce dossier sur GitHub/GitLab.
2. Netlify → **Add new site → Import an existing project**.
3. Build command : `node build.mjs` · Publish directory : `dist` (déjà dans `netlify.toml`).

### Option B — CLI
```bash
npm install -g netlify-cli
node build.mjs
netlify deploy --prod --dir=dist
```

### Option C — Glisser-déposer
`node build.mjs`, puis glisser le dossier **`dist`** sur https://app.netlify.com/drop.

## Formulaires (contact + commande)
Utilisent **Netlify Forms** (`data-netlify="true"` + honeypot anti-spam). Après le 1ᵉʳ
déploiement, les soumissions arrivent dans **Netlify → Forms** (activer les notifications
email). La page « commander » envoie le contenu du panier dans un champ caché.

## Newsletter Brevo

Le bloc newsletter (pied de page) poste vers une **Netlify Function**
(`netlify/functions/brevo-subscribe.js`) qui appelle l'API Brevo. La clé reste
**côté serveur** (jamais dans le front). À définir dans **Netlify → Site settings →
Environment variables** :

| Variable | Rôle |
|---|---|
| `BREVO_API_KEY` | Clé API v3 Brevo (obligatoire, secrète) |
| `BREVO_LIST_ID` | Id numérique de la liste Brevo (optionnel) |

En local (`serve.mjs`) la fonction n'existe pas : le formulaire affiche un message de
démo. Une fois déployé sur Netlify avec les variables, l'inscription est réelle.
Voir aussi l'app native **Brevo ↔ Shopify** (clients, commandes, paniers abandonnés)
dans [SHOPIFY-SETUP.md](SHOPIFY-SETUP.md).

## Pages légales

`/mentions-legales/`, `/politique-de-confidentialite/`, `/politique-cookies/` et
`/conditions-generales-de-vente/` sont des **modèles** (contexte suisse, LPD/RGPD) à
compléter (champs `[entre crochets]`) et à faire valider — idéalement par un·e juriste.
Une **bannière cookies** (accepter/refuser, mémorisée) s'affiche à la première visite ;
le choix est modifiable depuis la page cookies.

## Crédit

Le pied de page affiche « Site créé par **Make Your Com** » → https://makeyourcom.ch.

## Passer au paiement en ligne (plus tard)
- **Shopify (headless)** : catalogue/paiement/stock gérés par Shopify (taillé pour les
  pics), front Netlify conservé via la Storefront API. Migration WooCommerce → Shopify
  en bloc via **Matrixify** + redirections 301.
- **Snipcart** : ajouter un panier/paiement au site statique sans abonnement fixe (2 %/transaction).

## À personnaliser
- **Couleurs / typos** : variables en haut de `styles.css`.
- **Coordonnées** : `partials/footer.html`, `pages/contact.html`. ⚠️ L'ancien site
  n'affiche ni téléphone ni email public — à ajouter si souhaité.
- **CGV** : `pages/cgv.html` est un modèle générique à faire valider (idéalement par un·e juriste).
