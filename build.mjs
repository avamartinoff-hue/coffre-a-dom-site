/* =========================================================
   COFFRE À DOM, Générateur de site statique (mini-SSG)
   Node >= 18. Aucune dépendance externe.
   Usage : node build.mjs   → génère le dossier /dist
   ========================================================= */
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = 'https://coffreadom.ch';
const OUT = join(__dirname, 'dist');

// Versions de cache-busting : l'URL des assets change dès que leur contenu change.
const ver = (f) => createHash('md5').update(readFileSync(join(__dirname, f))).digest('hex').slice(0, 8);
const V = { css: ver('styles.css'), site: ver('site.js'), cart: ver('cart.js'), checkout: ver('checkout.js'), admin: ver('admin.js'), shop: ver('shop.js') };

/* ---------- utils ---------- */
const read = (p) => readFileSync(join(__dirname, p), 'utf8');
const readJSON = (p) => JSON.parse(read(p));
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Convertit un emoji connu en icône SVG médiévale (sinon garde l'emoji échappé).
const EMOJI_IC = { '🎴': 'cards', '🃏': 'cards', '🎮': 'controller', '🎯': 'target', '🍄': 'mushroom', '🕹️': 'joystick', '🕹': 'joystick', '🏎️': 'car', '🏎': 'car', '🏢': 'building', '🎉': 'party', '⚔️': 'swords', '⚔': 'swords', '🪙': 'coin', '🗝️': 'key', '🗝': 'key', '🏰': 'castle', '💛': 'heart', '📦': 'parcel', '🎟️': 'ticket', '🎟': 'ticket', '🏷️': 'tag', '🏷': 'tag', '📰': 'news', '📱': 'mobile', '💳': 'cardpay', '📞': 'phone', '📍': 'pin', '🕑': 'clock', '✉️': 'mail', '✉': 'mail', '👤': 'user', '👑': 'crown', '🔒': 'lock', '🛒': 'cart', '📅': 'calendar', '🗓️': 'calendar', '🗓': 'calendar', '📝': 'scroll', '🛡️': 'shield', '🛡': 'shield' };
const ico = (s) => { const k = String(s == null ? '' : s).trim(); const id = EMOJI_IC[k]; return id ? `<svg class="ic" aria-hidden="true"><use href="#ic-${id}"/></svg>` : esc(s); };
const chf = (n) => 'CHF ' + Number(n).toFixed(2);
const imgUrl = (img) => (img && /^https?:\/\//.test(img) ? img : '/' + img); // URL absolue (upload) ou chemin local
// Affichage optimisé via Netlify Image CDN (redimensionne + WebP/AVIF auto + cache). Uploads distants laissés tels quels.
const imgDisplay = (img, w) => {
  if (!img) return '';
  if (/^https?:\/\//.test(img)) return img;
  const abs = img.startsWith('/') ? img : '/' + img;
  return `/.netlify/images?url=${encodeURIComponent(abs)}&w=${w}&q=75`;
};

// Marque produit : champ éditable prioritaire, sinon détection auto depuis le nom (ordre = du + spécifique au + général)
const BRAND_RULES = [
  [/banpresto/i, 'Banpresto'],
  [/hasbro/i, 'Hasbro'],
  [/funko|pop!|\bchase\b/i, 'Funko'],
  [/the gathering|\bmagic\b/i, 'Wizards of the Coast'],
  [/one piece/i, 'Bandai'],
  [/dragon ball/i, 'Bandai'],
  [/naruto/i, 'Naruto'],
  [/\bhalo\b/i, 'Halo'],
  [/star wars/i, 'Star Wars'],
  [/pok[eé]mon/i, 'Pokémon'],
];
const detectBrand = (name) => { for (const [re, b] of BRAND_RULES) if (re.test(name || '')) return b; return ''; };
const brandOf = (p) => ((p.brand && p.brand.trim()) ? p.brand.trim() : (detectBrand(p.name) || 'Coffre à Dom'));
// Quantité max qu'un client peut mettre au panier = le plus petit entre le stock dispo et la limite par commande.
const buyLimit = (p) => { const a = []; if (p.stockQty != null && p.stockQty > 0) a.push(p.stockQty); if (p.maxPerOrder) a.push(p.maxPerOrder); return a.length ? Math.min(...a) : ''; };

/* ---------- i18n (FR défaut, EN, IT, DE) ---------- */
const UI = readJSON('i18n/ui.json');
// Titres/descriptions traduits des pages éditoriales (par langue, optionnel)
const PAGES_I18N = {};
for (const lg of ['en', 'it', 'de']) {
  const f = `i18n/pages.${lg}.json`;
  if (existsSync(join(__dirname, f))) { try { PAGES_I18N[lg] = readJSON(f); } catch (e) { /* ignore */ } }
}
// Traductions catégories / blog / événements (optionnelles)
const CAT_I18N = existsSync(join(__dirname, 'i18n/categories.json')) ? readJSON('i18n/categories.json') : {};
const CONTENT_I18N = existsSync(join(__dirname, 'i18n/content.json')) ? readJSON('i18n/content.json') : { posts: {}, blogCategories: {}, authors: {}, events: {} };
const LANGS = ['fr', 'en', 'it', 'de'];
const DEFAULT_LANG = 'fr';
let LANG = DEFAULT_LANG; // langue courante, mutée par la boucle de build
const BASE = () => (LANG === DEFAULT_LANG ? '' : '/' + LANG);
function t(key, vars) {
  let s = (UI[LANG] && UI[LANG][key] != null) ? UI[LANG][key] : (UI[DEFAULT_LANG][key] != null ? UI[DEFAULT_LANG][key] : key);
  if (vars) for (const k in vars) s = String(s).split('{' + k + '}').join(vars[k]);
  return s;
}
// Préfixe les liens internes "/xxx" → "/<lang>/xxx" (sauf assets, ancres seules, admin, externes, mailto/tel)
function localizeLinks(html, lang) {
  if (lang === DEFAULT_LANG) return html;
  const base = '/' + lang;
  return html.replace(/(href=")(\/[^"#\s]*)(#[^"]*)?"/g, (m, a, path, frag) => {
    frag = frag || '';
    const clean = path.replace(/\?.*$/, ''); // ignore la query (?v=hash) pour les tests
    if (/^\/(assets|admin)(\/|$)/.test(clean)) return m;
    if (/\.(css|js|png|jpe?g|webp|svg|gif|ico|xml|json|txt|pdf|woff2?|mp4|webm)$/i.test(clean)) return m;
    if (clean === base || clean.startsWith(base + '/')) return m; // déjà préfixé
    return a + base + path + frag + '"';
  });
}
// Sélecteur de langue (liens construits déjà préfixés → injecté APRÈS localizeLinks)
function langSwitch(url) {
  const items = LANGS.map((L) => {
    const href = (L === DEFAULT_LANG ? '' : '/' + L) + url;
    return `<a href="${href}" hreflang="${UI[L].html_lang}"${L === LANG ? ' class="is-active" aria-current="true"' : ''}>${UI[L].lang_name}</a>`;
  }).join('');
  return `<div class="lang-switch" data-lang-switch>
      <button class="lang-switch__btn" type="button" aria-haspopup="true" aria-expanded="false">🌐 <span>${(UI[LANG].html_lang || LANG).toUpperCase()}</span> <span class="caret">▾</span></button>
      <div class="lang-switch__menu">${items}</div>
    </div>`;
}

// Catégories : nom/desc localisés + visibilité
const cName = (c) => { const x = CAT_I18N[c.slug] && CAT_I18N[c.slug][LANG]; return (LANG !== DEFAULT_LANG && x && x.name) ? x.name : c.name; };
const cDesc = (c) => { const x = CAT_I18N[c.slug] && CAT_I18N[c.slug][LANG]; return (LANG !== DEFAULT_LANG && x && x.desc) ? x.desc : (c.desc || ''); };
const catVisible = (c) => !!c && c.visible !== false;
// Catégories exclues de la NAVIGATION (filtre, méga-menu, Explorer, grille accueil) :
// les promos ne se gèrent plus par une catégorie mais par la case « En promo » (sale_price).
// Les pages restent générées (fils d'Ariane des produits intacts), juste non listées.
const HIDDEN_CAT_SLUGS = new Set(['promo', 'promo-pokemon']);
const catBrowsable = (c) => catVisible(c) && !HIDDEN_CAT_SLUGS.has(c.slug);
// Blog / auteurs / événements localisés
const pTitle = (p) => { const x = CONTENT_I18N.posts && CONTENT_I18N.posts[p.slug] && CONTENT_I18N.posts[p.slug][LANG]; return (LANG !== DEFAULT_LANG && x && x.title) ? x.title : p.title; };
const pExcerpt = (p) => { const x = CONTENT_I18N.posts && CONTENT_I18N.posts[p.slug] && CONTENT_I18N.posts[p.slug][LANG]; return (LANG !== DEFAULT_LANG && x && x.excerpt) ? x.excerpt : p.excerpt; };
const bcatName = (c) => { const x = CONTENT_I18N.blogCategories && CONTENT_I18N.blogCategories[c.slug] && CONTENT_I18N.blogCategories[c.slug][LANG]; return (LANG !== DEFAULT_LANG && x && x.name) ? x.name : c.name; };
const aRole = (a) => { const x = CONTENT_I18N.authors && CONTENT_I18N.authors[a.slug] && CONTENT_I18N.authors[a.slug][LANG]; return (LANG !== DEFAULT_LANG && x && x.role) ? x.role : a.role; };
const aBio = (a) => { const x = CONTENT_I18N.authors && CONTENT_I18N.authors[a.slug] && CONTENT_I18N.authors[a.slug][LANG]; return (LANG !== DEFAULT_LANG && x && x.bio) ? x.bio : a.bio; };
const evL = (ev, f) => { const x = CONTENT_I18N.events && CONTENT_I18N.events[ev.slug] && CONTENT_I18N.events[ev.slug][LANG]; return (LANG !== DEFAULT_LANG && x && x[f]) ? x[f] : ev[f]; };

function writePage(url, html) {
  const clean = (BASE() + url).replace(/^\/+/, '').replace(/\/+$/, '');
  const outDir = clean === '' ? OUT : join(OUT, clean);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), html, 'utf8');
  urls.add(BASE() + url);
}

/* ---------- data ----------
   Catalogue : Supabase = source de vérité si configuré (SUPABASE_URL +
   SUPABASE_PUBLISHABLE_KEY), sinon repli sur data/catalog.json (dev local). */
async function loadCatalog() {
  const U = process.env.SUPABASE_URL;
  const K = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (U && K) {
    try {
      const h = { apikey: K, Authorization: `Bearer ${K}` };
      const get = async (path) => {
        const r = await fetch(`${U}/rest/v1/${path}`, { headers: h });
        if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
        return r.json();
      };
      let cats;
      try { cats = await get('categories?select=slug,name,parent,icon,description,visible&order=position'); }
      catch (e) { cats = await get('categories?select=slug,name,parent,icon,description&order=position'); }
      // Colonnes optionnelles (issues de migrations : seo.sql, sale-price.sql, stock…).
      // On tente la sélection la plus riche, puis on RETIRE progressivement les colonnes
      // manquantes — sans JAMAIS retomber sur le catalogue local tant que Supabase répond.
      // Le mapping plus bas gère l'absence d'une colonne (undefined → null).
      const PROD_SELECTS = [
        'slug,name,description,price,sale_price,category,image,on_sale,in_stock,seo_title,seo_description,brand,translations,created_at,max_per_order,stock_qty',
        'slug,name,description,price,sale_price,category,image,on_sale,in_stock,created_at,max_per_order,stock_qty', // sans SEO/marque/traductions
        'slug,name,description,price,category,image,on_sale,in_stock,created_at,max_per_order,stock_qty',            // sans sale_price (promo)
        'slug,name,description,price,category,image,on_sale,in_stock,created_at',                                    // sans stock_qty/max_per_order
        'slug,name,description,price,category,image,on_sale,in_stock',                                               // minimal garanti
      ];
      let prods = null, lastErr = null;
      for (const sel of PROD_SELECTS) {
        try { prods = await get(`products?select=${sel}&visible=eq.true&in_stock=eq.true&order=position&limit=2000`); lastErr = null; break; }
        catch (e) { lastErr = e; prods = null; }
      }
      if (!prods) throw (lastErr || new Error('products: aucune sélection valide'));
      if (Array.isArray(cats) && Array.isArray(prods) && prods.length) {
        console.log(`↪ Catalogue chargé depuis Supabase : ${cats.length} catégories, ${prods.length} produits`);
        return {
          categories: cats.map((c) => ({ slug: c.slug, name: c.name, parent: c.parent, icon: c.icon || undefined, desc: c.description || '', visible: c.visible !== false })),
          products: prods.map((p) => ({ slug: p.slug, name: p.name, desc: p.description || '', price: Number(p.price), salePrice: (p.sale_price == null ? null : Number(p.sale_price)), category: p.category, image: p.image, onSale: !!p.on_sale, inStock: !!p.in_stock, seoTitle: p.seo_title || '', seoDesc: p.seo_description || '', brand: p.brand || '', translations: p.translations || null, createdAt: p.created_at || '', maxPerOrder: p.max_per_order || null, stockQty: (p.stock_qty == null ? null : Number(p.stock_qty)) })),
        };
      }
      console.warn('⚠️  Supabase configuré mais réponse inattendue, repli sur data/catalog.json');
    } catch (e) {
      console.warn(`⚠️  Supabase indisponible (${e.message}), repli sur data/catalog.json`);
    }
  } else {
    console.log('↪ Catalogue local (data/catalog.json), Supabase non configuré');
  }
  return readJSON('data/catalog.json');
}

/* ---------- data ---------- */
const catalog = await loadCatalog();
const pagesManifest = readJSON('data/pages.json').pages;
const blog = readJSON('data/blog.json');
const events = readJSON('data/events.json').events;

const cats = catalog.categories;
const products = catalog.products;
const catBySlug = Object.fromEntries(cats.map((c) => [c.slug, c]));
const childrenOf = (slug) => cats.filter((c) => c.parent === slug);
const topCats = cats.filter((c) => c.parent === null);
const productsIn = (slug) => products.filter((p) => p.category === slug);
// products in a category OR any of its descendants
function productsDeep(slug) {
  const kids = childrenOf(slug).map((c) => c.slug);
  let list = productsIn(slug);
  kids.forEach((k) => (list = list.concat(productsDeep(k))));
  return list;
}

const urls = new Set();

/* ---------- url helpers ---------- */
const catUrl = (slug) => `/boutique/${slug}/`;
const prodUrl = (slug) => `/produit/${slug}/`;
const postUrl = (slug) => `/blog-geek/${slug}/`;
const authorUrl = (slug) => `/auteur/${slug}/`;
const eventUrl = (slug) => `/evenement/${slug}/`;
const blogCatUrl = (slug) => `/blog-geek/categorie/${slug}/`;

/* ---------- partials ---------- */
const headerTpl = read('partials/header.html');
const footerTpl = read('partials/footer.html');
const iconSprite = read('partials/icons.html'); // sprite SVG d'icônes médiévales

/* mega-menu built from the category tree */
function buildMegaMenu() {
  const MAX = 7; // menu épuré : on ne montre que les principales, « Tout voir » pour le reste
  const li = (k, withIcon) => `<li><a href="${catUrl(k.slug)}">${withIcon && k.icon ? esc(k.icon) + ' ' : ''}${esc(cName(k))}</a></li>`;
  const listCol = (titleHtml, titleUrl, items, moreUrl, withIcon) => {
    const shown = items.slice(0, MAX).map((k) => li(k, withIcon)).join('');
    const more = items.length > MAX ? `<li class="mega__more"><a href="${moreUrl}">${t('mega.see_all')}</a></li>` : '';
    return `<div class="mega__col"><a class="mega__title" href="${titleUrl}">${titleHtml}</a><ul>${shown}${more}</ul></div>`;
  };
  const cardsUmbrella = 'jeu-de-cartes-a-collectionner';
  const pokemon = listCol(esc(cName(catBySlug['pokemon-cartes'])), catUrl('pokemon-cartes'), childrenOf('pokemon-cartes').filter(catBrowsable), catUrl('pokemon-cartes'), false);
  const autres = childrenOf(cardsUmbrella).filter((c) => c.slug !== 'pokemon-cartes' && catBrowsable(c));
  const autresCol = listCol(t('mega.others'), catUrl(cardsUmbrella), autres, catUrl(cardsUmbrella), false);
  const horsCartes = topCats.filter((c) => c.slug !== cardsUmbrella && catBrowsable(c));
  const horsCol = listCol(t('mega.non_cards'), '/boutique/', horsCartes, '/boutique/', true);
  return `<div class="mega">${pokemon}${autresCol}${horsCol}
      <div class="mega__promo">
        <p class="mega__promo-k">${t('mega.mystery_k')}</p>
        <p>${t('mega.mystery_txt')}</p>
        <a href="/votre-coffre/" class="mega__promo-cta">${t('mega.learn_more')}</a>
      </div>
    </div>`;
}

/* ---------- SEO : identité entreprise + données structurées globales ---------- */
const BIZ = {
  name: 'Coffre à Dom', legalName: 'Coffre à Dom Sàrl',
  phone: '+41789418538', email: 'coffreadom@hotmail.com', vat: 'CHE-142.573.696',
  street: 'Route des Îles 84', zip: '1897', city: 'Le Bouveret', region: 'VS', country: 'CH',
  lat: 46.3778, lng: 6.8671, logo: SITE + '/assets/brand/logo.png',
};
const POSTAL = { '@type': 'PostalAddress', streetAddress: BIZ.street, postalCode: BIZ.zip, addressLocality: BIZ.city, addressRegion: BIZ.region, addressCountry: BIZ.country };
const DEFAULT_OG = SITE + '/assets/brand/AA-02.png';
function globalLD() {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': SITE + '/#org', name: BIZ.name, legalName: BIZ.legalName, url: SITE, logo: BIZ.logo, image: BIZ.logo, email: BIZ.email, telephone: BIZ.phone, vatID: BIZ.vat, address: POSTAL },
      { '@type': ['Store', 'LocalBusiness'], '@id': SITE + '/#store', name: BIZ.name, image: BIZ.logo, url: SITE, telephone: BIZ.phone, email: BIZ.email, priceRange: 'CHF', currenciesAccepted: 'CHF', paymentAccepted: 'Cash, TWINT, SumUp', address: POSTAL, geo: { '@type': 'GeoCoordinates', latitude: BIZ.lat, longitude: BIZ.lng }, areaServed: { '@type': 'Country', name: 'Switzerland' }, parentOrganization: { '@id': SITE + '/#org' }, openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Tuesday', 'Wednesday', 'Thursday'], opens: '13:30', closes: '16:30' }, { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '18:00', closes: '22:00' }, { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Sunday', opens: '14:00', closes: '18:00' }] },
      { '@type': 'WebSite', '@id': SITE + '/#website', name: BIZ.name, url: SITE, inLanguage: LANGS, publisher: { '@id': SITE + '/#org' } },
    ],
  });
}
// BreadcrumbList JSON-LD à partir des items du fil d'Ariane
function breadcrumbLD(items) {
  return JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, ...(it.url ? { item: SITE + BASE() + it.url } : {}) })),
  });
}

/* ---------- shell ---------- */
function shell({ title, desc, url, body, nav = '', noindex = false, jsonld = '', ogImage = '', ogType = 'website' }) {
  const L = UI[LANG];
  const canonical = SITE + BASE() + url;
  const applyT = (s) => s.replace(/\{\{t:([^}]+)\}\}/g, (m, k) => esc(t(k.trim())));
  const header = applyT(headerTpl
    .replaceAll('{{MEGAMENU}}', buildMegaMenu())
    .replaceAll('{{NAV}}', nav));
  const footer = applyT(footerTpl.replaceAll('{{YEAR}}', String(new Date().getFullYear())));
  const alternates = noindex ? '' : (LANGS
    .map((lg) => `<link rel="alternate" hreflang="${UI[lg].html_lang}" href="${SITE}${lg === DEFAULT_LANG ? '' : '/' + lg}${url}" />`)
    .join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${SITE}${url}" />\n`);
  let html = `<!DOCTYPE html>
<html lang="${L.html_lang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
${noindex ? '<meta name="robots" content="noindex,follow" />\n' : '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />\n'}<link rel="canonical" href="${canonical}" />
${alternates}<meta name="theme-color" content="#fdf8f0" />
<meta name="author" content="${esc(BIZ.name)}" />
<meta name="geo.region" content="CH-VS" />
<meta name="geo.placename" content="Le Bouveret" />
<meta name="geo.position" content="${BIZ.lat};${BIZ.lng}" />
<meta name="ICBM" content="${BIZ.lat}, ${BIZ.lng}" />
<meta property="og:site_name" content="${esc(BIZ.name)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:type" content="${ogType}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:locale" content="${L.og_locale}" />
<meta property="og:image" content="${esc(ogImage || DEFAULT_OG)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${esc(ogImage || DEFAULT_OG)}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Work+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/styles.css?v=${V.css}" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%97%9D%EF%B8%8F%3C/text%3E%3C/svg%3E" />
<script type="application/ld+json">${globalLD()}</script>
${(Array.isArray(jsonld) ? jsonld : (jsonld ? [jsonld] : [])).map((j) => `<script type="application/ld+json">${j}</script>`).join('\n')}
</head>
<body data-nav="${nav}">
<script>window.__LANG__=${JSON.stringify(LANG)};window.__BASE__=${JSON.stringify(BASE())};window.__I18N__=${JSON.stringify(UI[LANG]._client || {})};</script>
${iconSprite}
${header}
<main id="contenu">
${body}
</main>
${footer}
<script src="/cart.js?v=${V.cart}" defer></script>
<script src="/checkout.js?v=${V.checkout}" defer></script>
<script src="/site.js?v=${V.site}" defer></script>
</body>
</html>`;
  // Optimisation des images de contenu (pages éditoriales) via Netlify Image CDN, hors logo.
  html = html.replace(/(<img\b[^>]*\bsrc=")(\/assets\/[^"]+\.(?:jpe?g|png|webp))("[^>]*>)/gi, (m, a, path, b) => {
    if (/logo\.png$/i.test(path)) return m;
    return a + '/.netlify/images?url=' + encodeURIComponent(path) + '&w=1200&q=75' + b;
  });
  html = localizeLinks(html, LANG);
  html = html.split('{{LANGSWITCH}}').join(langSwitch(url));
  return html;
}

/* ---------- components ---------- */
// Promo : le produit est en promo si on_sale ET un prix promo valide (0 < salePrice < price)
const onPromo = (p) => !!p.onSale && p.salePrice != null && p.salePrice > 0 && p.salePrice < p.price;
const effPrice = (p) => (onPromo(p) ? p.salePrice : p.price); // prix réellement facturé/affiché
const promoPct = (p) => (onPromo(p) ? Math.round(((p.price - p.salePrice) / p.price) * 100) : 0);
const priceLabel = (p) => (p.price > 0 ? chf(effPrice(p)) : t('price.on_request'));
// Prix affiché en HTML : si promo → ancien prix barré + nouveau prix ; sinon prix simple / « sur demande »
function priceHtml(p) {
  if (!(p.price > 0)) return t('price.on_request');
  if (onPromo(p)) return `<span class="price-old">${chf(p.price)}</span> <span class="price-new">${chf(p.salePrice)}</span>`;
  return chf(p.price);
}
// Nom / description localisés (repli FR). translations = { en:{name,desc}, it:{…}, de:{…} }
const pName = (p) => { const tr = p.translations && p.translations[LANG]; return (LANG !== DEFAULT_LANG && tr && tr.name) ? tr.name : p.name; };
const pDesc = (p) => { const tr = p.translations && p.translations[LANG]; return (LANG !== DEFAULT_LANG && tr && tr.desc) ? tr.desc : (p.desc || ''); };
const isPreorder = (p) => /pr[ée]command|disponibilit[ée] pr[ée]vu/i.test(p.desc || '');
const releaseDate = (p) => ((p.desc || '').match(/(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})/) || [])[1] || null;
function productBadges(p) {
  return (onPromo(p) ? `<span class="pcard__badge pcard__badge--sale">-${promoPct(p)}%</span>` : '') +
    (!p.inStock ? `<span class="pcard__badge pcard__badge--out">${t('badge.out')}</span>` : '');
}
function productCard(p) {
  const cat = catBySlug[p.category];
  const icon = ico((cat && cat.icon) || '🎴');
  const nm = pName(p);
  const media = p.image
    ? `<img class="pcard__img" src="${esc(imgDisplay(p.image, 440))}" alt="${esc(nm)}" loading="lazy" decoding="async" />`
    : `<span class="pcard__emoji">${icon}</span>`;
  const canBuy = p.inStock && p.price > 0;
  const action = canBuy
    ? `<button class="pcard__add" type="button" data-add data-slug="${esc(p.slug)}" data-name="${esc(nm)}" data-price="${effPrice(p)}" data-max="${buyLimit(p)}" aria-label="${esc(t('card.add_aria', { name: nm }))}">${t('card.add')}</button>`
    : (p.price > 0
      ? `<span class="pcard__soldout">${t('badge.out')}</span>`
      : `<span class="pcard__soldout">${t('card.on_request')}</span>`);
  const chain = catChain(p.category);
  return `<a class="pcard" href="${prodUrl(p.slug)}" data-name="${esc(nm)}" data-cats="${chain.join(' ')}" data-stock="${p.inStock ? 1 : 0}" data-sale="${onPromo(p) ? 1 : 0}" data-price="${Number(effPrice(p)) || 0}" data-created="${p.createdAt ? (Date.parse(p.createdAt) || 0) : 0}">
    <div class="pcard__media${p.image ? ' has-img' : ''}">${productBadges(p)}${media}</div>
    <div class="pcard__body">
      <h3 class="pcard__name">${esc(nm)}</h3>
      <div class="pcard__row">
        <span class="pcard__price">${priceHtml(p)}</span>
        ${action}
      </div>
    </div>
  </a>`;
}

function catThumb(slug) { const p = productsDeep(slug).find((x) => x.image); return p ? p.image : null; }
function catChain(slug) { const out = []; let cur = slug, g = 0; while (cur && g++ < 20) { out.push(cur); cur = catBySlug[cur] ? catBySlug[cur].parent : null; } return out; }
function categoryCard(c, large) {
  const kids = childrenOf(c.slug);
  const count = productsDeep(c.slug).length;
  const img = catThumb(c.slug);
  const visual = img
    ? `<div class="ccard__thumb"><img src="${esc(imgDisplay(img, 440))}" alt="${esc(cName(c))}" loading="lazy" decoding="async" /></div>`
    : `<div class="ccard__thumb ccard__thumb--empty"><span>${ico(c.icon || '🎴')}</span></div>`;
  const nSub = kids.filter(catVisible).length;
  const sub = large && nSub ? `${nSub} ${nSub > 1 ? t('cat.subcat_many') : t('cat.subcat_one')} · ` : '';
  return `<a class="ccard${large ? ' ccard--lg' : ''}" href="${catUrl(c.slug)}">
    ${visual}
    <div class="ccard__body">
      <span class="ccard__name">${esc(cName(c))}</span>
      <span class="ccard__count">${sub}${count} ${count > 1 ? t('cat.article_many') : t('cat.article_one')}</span>
    </div>
  </a>`;
}
function subcatCard(c) { return categoryCard(c, false); }

function breadcrumb(items) {
  const parts = items.map((it, i) =>
    it.url && i < items.length - 1
      ? `<a href="${it.url}">${esc(it.name)}</a>`
      : `<span>${esc(it.name)}</span>`
  );
  return `<nav class="crumb" aria-label="Fil d'Ariane">${parts.join('<span class="crumb__sep">/</span>')}</nav>`;
}

/* ---------- token replacement for authored pages ---------- */
function fillTokens(body) {
  return body
    .replaceAll('src="/admin.js"', `src="/admin.js?v=${V.admin}"`)
    .replaceAll('src="/shop.js"', `src="/shop.js?v=${V.shop}"`)
    .replaceAll('{{CATEGORY_GRID}}', topCats.filter((c) => catBrowsable(c) && productsDeep(c.slug).length > 0).slice(0, 5).map((c) => categoryCard(c, true)).join(''))
    .replaceAll('{{PRODUCT_COUNT}}', String(products.length))
    .replaceAll('{{ALL_PRODUCTS}}', products.map(productCard).join(''))
    .replaceAll('{{SHOP_CATEGORIES}}', (() => {
      const filters = childrenOf('jeu-de-cartes-a-collectionner')
        .concat(topCats.filter((c) => c.slug !== 'jeu-de-cartes-a-collectionner'))
        .filter((c) => catBrowsable(c) && productsDeep(c.slug).length > 0); // catégorie à 0 article ou promo = masquée du filtre
      const opt = (val, label, n) =>
        `<label class="filter-opt"><input type="radio" name="shopcat" value="${val}"${val === '' ? ' checked' : ''} /><span>${esc(label)}</span><b>${n}</b></label>`;
      return opt('', t('shop.all_pieces'), products.length) +
        filters.map((c) => opt(c.slug, cName(c), productsDeep(c.slug).length)).join('');
    })())
    .replaceAll('{{FEATURED_PRODUCTS}}', (() => {
      const sale = products.filter((p) => p.onSale && p.inStock && p.price > 0);
      const pick = (sale.length >= 8 ? sale : products.filter((p) => p.inStock && p.price > 0)).slice(0, 8);
      return pick.map(productCard).join('');
    })())
    .replaceAll('{{POST_LIST}}', blog.posts.map(postCard).join(''))
    .replaceAll('{{BLOG_CATS}}', blog.categories.map((c) => `<a class="chip" href="${blogCatUrl(c.slug)}">${esc(bcatName(c))}</a>`).join(''))
    .replaceAll('{{EVENT_LIST}}', events.map(eventCard).join(''));
}

function postCard(post) {
  const author = blog.authors.find((a) => a.slug === post.author);
  const cat = blog.categories.find((c) => c.slug === post.category);
  const media = post.cover_img
    ? `<a class="bcard__media bcard__media--img" href="${postUrl(post.slug)}"><img src="${esc(imgDisplay(post.cover_img, 700))}" alt="${esc(pTitle(post))}" loading="lazy" decoding="async" /></a>`
    : `<a class="bcard__media" href="${postUrl(post.slug)}"><span>${ico(post.cover || '📝')}</span></a>`;
  return `<article class="bcard">
    ${media}
    <div class="bcard__body">
      <a class="chip chip--sm" href="${blogCatUrl(post.category)}">${esc(cat ? bcatName(cat) : '')}</a>
      <h3><a href="${postUrl(post.slug)}">${esc(pTitle(post))}</a></h3>
      <p>${esc(pExcerpt(post))}</p>
      <p class="bcard__meta">${esc(author ? author.name : '')} · ${frDate(post.date)}</p>
    </div>
  </article>`;
}

function eventCard(ev) {
  return `<article class="ecard">
    <div class="ecard__date"><span class="ecard__emoji">${ico(ev.cover || '📅')}</span></div>
    <div class="ecard__body">
      <h3><a href="${eventUrl(ev.slug)}">${esc(evL(ev, 'title'))}</a></h3>
      <p class="ecard__meta">${ico('🗓️')} ${frDate(ev.date)} · ${esc(evL(ev, 'time'))} · ${ico('📍')} ${esc(evL(ev, 'place'))}</p>
      <p>${esc(evL(ev, 'excerpt'))}</p>
      <p class="ecard__price">${esc(evL(ev, 'price'))}</p>
      <a class="link-arrow" href="${eventUrl(ev.slug)}">${t('event.details')} <span>→</span></a>
    </div>
  </article>`;
}

function frDate(iso) {
  const [y, m, d] = iso.split('-');
  const months = (UI[LANG] && UI[LANG].months) || UI[DEFAULT_LANG].months;
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

/* ---------- pages éditoriales multilingues (repli FR) ----------
   Corps : pages/<lang>/<file> si présent, sinon pages/<file> (FR).
   Titre/desc : pg.i18n[lang] si présent, sinon champ FR de pages.json. */
function pageBody(file, lang) {
  if (lang !== DEFAULT_LANG) {
    const p = join('pages', lang, file);
    if (existsSync(join(__dirname, p))) return read(p);
  }
  return read(join('pages', file));
}
function pageMeta(pg, field, lang) {
  const tr = PAGES_I18N[lang] && PAGES_I18N[lang][pg.file];
  if (lang !== DEFAULT_LANG && tr && tr[field]) return tr[field];
  return pg[field];
}

/* =========================================================
   BUILD
   ========================================================= */
if (existsSync(OUT)) {
  try { rmSync(OUT, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 }); }
  catch (e) { console.warn('⚠️  Impossible de vider /dist (verrou fichier), on écrase par-dessus.', e.code); }
}
mkdirSync(OUT, { recursive: true });

/* ===== Boucle multilingue : une passe complète par langue ===== */
for (const lang of LANGS) {
  LANG = lang;

/* 1) authored pages */
for (const pg of pagesManifest) {
  if (pg.url === '/admin/' && LANG !== DEFAULT_LANG) continue; // back office : une seule version (FR)
  const localized = pageBody(pg.file, LANG);
  const body = fillTokens(localized);
  writePage(pg.url, shell({ title: pageMeta(pg, 'title', LANG), desc: pageMeta(pg, 'desc', LANG), url: pg.url, body, nav: pg.nav || '', noindex: !!pg.noindex }));
}

/* 2) category pages */
for (const c of cats) {
  const kids = childrenOf(c.slug);
  const list = kids.length ? productsDeep(c.slug) : productsIn(c.slug);
  const crumbItems = [{ name: t('crumb.home'), url: '/' }, { name: t('crumb.shop'), url: '/boutique/' }];
  if (c.parent) {
    // walk up parent chain
    const chain = [];
    let cur = c.parent;
    while (cur) { chain.unshift(catBySlug[cur]); cur = catBySlug[cur].parent; }
    chain.forEach((p) => crumbItems.push({ name: cName(p), url: catUrl(p.slug) }));
  }
  crumbItems.push({ name: cName(c) });

  // On n'affiche dans « Explorer » que les sous-catégories qui ont au moins 1 article
  // (productsDeep compte aussi les sous-sous-catégories) → « rubrique à 0 = pas affichée ».
  const visKids = kids.filter((k) => catBrowsable(k) && productsDeep(k.slug).length > 0);
  const subGrid = visKids.length
    ? `<h2 class="cat__subtitle">${t('cat.explore')}</h2><div class="ccard-grid">${visKids.map(subcatCard).join('')}</div>`
    : '';
  const prodGrid = list.length
    ? `<h2 class="cat__subtitle">${list.length} ${list.length > 1 ? t('cat.article_many') : t('cat.article_one')}</h2><div class="pgrid">${list.map(productCard).join('')}</div>`
    : `<p class="empty">${t('cat.empty')}</p>`;

  const body = `
  <section class="section section--page">
    <div class="container">
      ${breadcrumb(crumbItems)}
      <header class="page-hero">
        <span class="page-hero__icon">${ico(c.icon || '🎴')}</span>
        <h1>${esc(cName(c))}</h1>
        <p>${esc(cDesc(c))}</p>
      </header>
      ${subGrid}
      ${prodGrid}
    </div>
  </section>`;
  writePage(catUrl(c.slug), shell({
    title: `${cName(c)}, Boutique | Coffre à Dom`,
    desc: cDesc(c) || `${cName(c)}, Coffre à Dom.`,
    url: catUrl(c.slug), body, nav: 'boutique', noindex: !catVisible(c), jsonld: breadcrumbLD(crumbItems),
  }));
}

/* 3) product pages */
for (const p of products) {
  const cat = catBySlug[p.category];
  const chain = [];
  let cur = p.category;
  while (cur) { chain.unshift(catBySlug[cur]); cur = catBySlug[cur].parent; }
  const nm = pName(p);
  const dsc = pDesc(p);
  const crumbItems = [{ name: t('crumb.home'), url: '/' }, { name: t('crumb.shop'), url: '/boutique/' },
    ...chain.map((c) => ({ name: cName(c), url: catUrl(c.slug) })), { name: nm }];
  const related = productsIn(p.category).filter((x) => x.slug !== p.slug).slice(0, 4);
  const relatedHtml = related.length
    ? `<section class="section"><div class="container"><h2 class="cat__subtitle">${t('prod.related')}</h2><div class="pgrid">${related.map(productCard).join('')}</div></div></section>`
    : '';
  const canBuy = p.inStock && p.price > 0;
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Product', name: nm,
    description: dsc, category: cat ? cName(cat) : '',
    brand: { '@type': 'Brand', name: brandOf(p) },
    ...(p.image ? { image: /^https?:/.test(p.image) ? p.image : SITE + '/' + p.image } : {}),
    offers: {
      '@type': 'Offer', priceCurrency: 'CHF',
      ...(p.price > 0 ? { price: Number(effPrice(p)).toFixed(2) } : {}),
      availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  });
  const media = p.image
    ? `<img src="${esc(imgDisplay(p.image, 900))}" alt="${esc(nm)}" decoding="async" />`
    : `<span class="product__emoji">${ico((cat && cat.icon) || '🎴')}</span>`;
  const pre = isPreorder(p);
  const release = releaseDate(p);
  const bmax = buyLimit(p); // min(stock, limite par commande)
  const qtyBlock = `<div class="qty" data-qty data-max="${bmax}">
              <button type="button" data-qty-minus aria-label="Moins">−</button>
              <input type="text" value="1" data-qty-input aria-label="Quantité" inputmode="numeric" />
              <button type="button" data-qty-plus aria-label="Plus">+</button>
            </div>`;
  const limitNote = p.maxPerOrder ? `<p class="product__limit">${t('prod.limit', { n: p.maxPerOrder })}</p>` : '';
  const actions = canBuy
    ? `<div class="product__actions">${qtyBlock}
            <button class="btn btn--gold" type="button" data-add data-slug="${esc(p.slug)}" data-name="${esc(nm)}" data-price="${effPrice(p)}" data-max="${bmax}" data-qty-source>${t('prod.add_cart')}</button>
          </div>${limitNote}`
    : `<p class="product__unavailable">${p.price > 0 ? t('badge.out') : t('prod.unavail')}</p>`;
  const body = `
  <section class="section section--page">
    <div class="container">
      ${breadcrumb(crumbItems)}
      <div class="product">
        <div class="product__media${p.image ? ' has-img' : ''}">${productBadges(p)}${media}</div>
        <div class="product__info">
          <a class="chip chip--sm" href="${catUrl(p.category)}">${esc(cat ? cName(cat) : '')}</a>
          <h1>${esc(nm)}</h1>
          <p class="product__price">${priceHtml(p)}</p>
          ${dsc ? `<p class="product__desc">${esc(dsc)}</p>` : ''}
          ${actions}
          <ul class="product__meta">
            <li>${p.inStock ? t('prod.meta_instock') : (pre ? t('prod.meta_pre') : t('prod.meta_oncmd'))}</li>
            <li>${t('prod.meta_ship')}</li>
            <li>${t('prod.meta_pay')}</li>
          </ul>
        </div>
      </div>
    </div>
  </section>
  ${relatedHtml}`;
  writePage(prodUrl(p.slug), shell({
    title: (p.seoTitle && p.seoTitle.trim()) ? p.seoTitle.trim() : `${nm} | Coffre à Dom`,
    desc: ((p.seoDesc && p.seoDesc.trim()) ? p.seoDesc.trim() : (dsc || nm)).slice(0, 160),
    url: prodUrl(p.slug), body, nav: 'boutique', jsonld: [jsonld, breadcrumbLD(crumbItems)], ogType: 'product',
    ogImage: p.image ? (/^https?:/.test(p.image) ? p.image : SITE + '/' + p.image) : '',
  }));
}

/* 4) blog articles + author + blog categories */
for (const post of blog.posts) {
  const articleBody = (LANG !== DEFAULT_LANG && existsSync(join(__dirname, 'templates', LANG, 'article-body.html')))
    ? read(join('templates', LANG, 'article-body.html'))
    : read('templates/article-body.html');
  const author = blog.authors.find((a) => a.slug === post.author);
  const cat = blog.categories.find((c) => c.slug === post.category);
  const crumbItems = [{ name: t('crumb.home'), url: '/' }, { name: t('crumb.blog'), url: '/blog-geek/' }, { name: pTitle(post) }];
  const related = blog.posts.filter((x) => x.slug !== post.slug && x.category === post.category).slice(0, 3);
  const relatedHtml = related.length
    ? `<div class="container"><h2 class="cat__subtitle">${t('blog.read_also')}</h2><div class="bgrid">${related.map(postCard).join('')}</div></div>`
    : '';
  const body = `
  <article class="section section--page">
    <div class="container container--narrow">
      ${breadcrumb(crumbItems)}
      <header class="article-hero">
        <a class="chip chip--sm" href="${blogCatUrl(post.category)}">${esc(cat ? bcatName(cat) : '')}</a>
        <h1>${esc(pTitle(post))}</h1>
        <p class="article-hero__meta">${t('blog.by')} <a href="${authorUrl(post.author)}">${esc(author ? author.name : '')}</a> · ${frDate(post.date)}</p>
        <div class="article-hero__cover${post.cover_img ? ' article-hero__cover--img' : ''}">${post.cover_img ? `<img src="${esc(imgDisplay(post.cover_img, 1000))}" alt="${esc(pTitle(post))}" decoding="async" />` : `<span>${ico(post.cover || '📝')}</span>`}</div>
      </header>
      <div class="prose">
        <p class="prose__lead">${esc(pExcerpt(post))}</p>
        ${articleBody}
      </div>
    </div>
  </article>
  <section class="section section--alt">${relatedHtml}</section>`;
  const articleLD = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: pTitle(post), description: pExcerpt(post), datePublished: post.date, inLanguage: LANG,
    author: { '@type': 'Person', name: author ? author.name : BIZ.name },
    publisher: { '@id': SITE + '/#org' }, mainEntityOfPage: SITE + BASE() + postUrl(post.slug),
    ...(post.cover_img ? { image: SITE + '/' + post.cover_img } : { image: DEFAULT_OG }),
  });
  writePage(postUrl(post.slug), shell({ title: `${pTitle(post)} | Blog Geek, Coffre à Dom`, desc: pExcerpt(post), url: postUrl(post.slug), body, nav: 'blog', ogType: 'article', jsonld: [articleLD, breadcrumbLD(crumbItems)], ogImage: post.cover_img ? SITE + '/' + post.cover_img : '' }));
}

/* blog categories */
for (const c of blog.categories) {
  const list = blog.posts.filter((p) => p.category === c.slug);
  const body = `
  <section class="section section--page">
    <div class="container">
      ${breadcrumb([{ name: t('crumb.home'), url: '/' }, { name: t('crumb.blog'), url: '/blog-geek/' }, { name: bcatName(c) }])}
      <header class="page-hero"><span class="page-hero__icon">${ico('🏷️')}</span><h1>${esc(bcatName(c))}</h1><p>${esc(t('blog.cat_all', { name: bcatName(c) }))}</p></header>
      <div class="bgrid">${list.map(postCard).join('')}</div>
    </div>
  </section>`;
  writePage(blogCatUrl(c.slug), shell({ title: `${bcatName(c)}, Blog Geek | Coffre à Dom`, desc: t('blog.cat_all', { name: bcatName(c) }), url: blogCatUrl(c.slug), body, nav: 'blog' }));
}

/* authors */
for (const a of blog.authors) {
  const list = blog.posts.filter((p) => p.author === a.slug);
  const body = `
  <section class="section section--page">
    <div class="container container--narrow">
      ${breadcrumb([{ name: t('crumb.home'), url: '/' }, { name: t('crumb.blog'), url: '/blog-geek/' }, { name: a.name }])}
      <header class="author-hero">
        <span class="author-hero__avatar">${ico(a.slug === 'dom' ? '🛡️' : '🎮')}</span>
        <div><h1>${esc(a.name)}</h1><p class="author-hero__role">${esc(aRole(a))}</p></div>
      </header>
      <p class="prose__lead">${esc(aBio(a))}</p>
      <h2 class="cat__subtitle">${esc(t('blog.author_articles', { name: a.name }))}</h2>
      <div class="bgrid">${list.map(postCard).join('')}</div>
    </div>
  </section>`;
  writePage(authorUrl(a.slug), shell({ title: `${a.name} | Coffre à Dom`, desc: aBio(a), url: authorUrl(a.slug), body, nav: 'blog', noindex: false }));
}

/* 5) events */
for (const ev of events) {
  const crumbItems = [{ name: t('crumb.home'), url: '/' }, { name: t('crumb.blog'), url: '/blog-geek/' }, { name: evL(ev, 'title') }];
  const eventLD = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Event', name: evL(ev, 'title'),
    startDate: ev.date, eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    description: evL(ev, 'excerpt'), image: DEFAULT_OG, inLanguage: LANG,
    location: { '@type': 'Place', name: evL(ev, 'place') || BIZ.name, address: POSTAL },
    organizer: { '@id': SITE + '/#org' },
  });
  const body = `
  <section class="section section--page">
    <div class="container container--narrow">
      ${breadcrumb(crumbItems)}
      <header class="article-hero">
        <span class="chip chip--sm">${t('event.badge')}</span>
        <h1>${esc(evL(ev, 'title'))}</h1>
        <p class="article-hero__meta">${ico('🗓️')} ${frDate(ev.date)} · ${esc(evL(ev, 'time'))} · ${ico('📍')} ${esc(evL(ev, 'place'))}</p>
        <div class="article-hero__cover"><span>${ico(ev.cover || '📅')}</span></div>
      </header>
      <div class="prose">
        <p class="prose__lead">${esc(evL(ev, 'excerpt'))}</p>
        <p>${esc(t('event.join', { title: evL(ev, 'title').toLowerCase() }))}</p>
        <p><strong>${t('event.price')}</strong> ${esc(evL(ev, 'price'))}</p>
        <p><a class="btn btn--gold" href="/contact/">${t('event.book_cta')}</a></p>
      </div>
    </div>
  </section>`;
  writePage(eventUrl(ev.slug), shell({ title: `${evL(ev, 'title')} | Coffre à Dom`, desc: evL(ev, 'excerpt'), url: eventUrl(ev.slug), body, nav: 'gaming', ogType: 'article', jsonld: [eventLD, breadcrumbLD(crumbItems)] }));
}

} /* ===== fin boucle multilingue ===== */
LANG = DEFAULT_LANG;

/* 6) static assets */
for (const f of ['styles.css', 'site.js', 'cart.js', 'checkout.js', 'admin.js', 'shop.js', 'robots.txt']) {
  if (existsSync(join(__dirname, f))) cpSync(join(__dirname, f), join(OUT, f));
}
cpSync(join(__dirname, 'data/catalog.json'), join(OUT, 'data/catalog.json'));
if (existsSync(join(__dirname, 'assets'))) cpSync(join(__dirname, 'assets'), join(OUT, 'assets'), { recursive: true });

/* 7) sitemap.xml (avec alternates hreflang, hors pages noindex) */
const NOINDEX_RE = /\/(admin|panier|commander|mon-compte|merci)\//;
const langOf = (u) => (u.match(/^\/(en|it|de)(\/|$)/) || [])[1] || 'fr';
const logicalOf = (u) => { const s = u.replace(/^\/(en|it|de)(?=\/|$)/, ''); return s === '' ? '/' : s; };
const indexable = [...urls].filter((u) => !NOINDEX_RE.test(u));
const byRoute = {};
indexable.forEach((u) => { const r = logicalOf(u); (byRoute[r] = byRoute[r] || {})[langOf(u)] = u; });
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${indexable.sort().map((u) => {
  const alts = byRoute[logicalOf(u)];
  const links = Object.keys(alts).sort().map((lg) => `<xhtml:link rel="alternate" hreflang="${lg}" href="${SITE}${alts[lg]}"/>`).join('') +
    (alts.fr ? `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${alts.fr}"/>` : '');
  return `  <url><loc>${SITE}${u}</loc>${links}</url>`;
}).join('\n')}
</urlset>`;
writeFileSync(join(OUT, 'sitemap.xml'), sitemap, 'utf8');

/* 7b) llms.txt, fichier pour les IA / moteurs conversationnels */
const topShop = topCats.filter((c) => c.visible !== false && productsDeep(c.slug).length > 0).slice(0, 10);
LANG = DEFAULT_LANG;
const llms = `# Coffre à Dom

> Boutique ludique & vintage à Le Bouveret (Valais, Suisse). Cartes Pokémon et jeux de cartes à collectionner (Magic, One Piece, Dragon Ball…), coffrets scellés, protections, figurines, espace gaming immersif (PS5, Nintendo, Xbox, simulateur), coffres mystères, programme VIP, privatisations et événements. Site multilingue FR (défaut) / EN / IT / DE. Paiement TWINT & carte, retrait en boutique ou envoi postal.

## Boutique
${topShop.map((c) => `- [${c.name}](${SITE}${catUrl(c.slug)}) : ${productsDeep(c.slug).length} articles`).join('\n')}
- [Toute la boutique](${SITE}/boutique/) : ${products.length} produits
- [Flux produits Google Shopping](${SITE}/google-merchant.xml)

## Pages principales
- [Accueil](${SITE}/)
- [À propos](${SITE}/a-propos-coffre-a-dom/)
- [Espace gaming immersif](${SITE}/espace-gaming-immersif/)
- [Privatisation & événements](${SITE}/privatisation-evenement-particulier/)
- [Blog Geek](${SITE}/blog-geek/)
- [Contact & réservation](${SITE}/contact/)

## Langues
- Français : ${SITE}/
- English : ${SITE}/en/
- Italiano : ${SITE}/it/
- Deutsch : ${SITE}/de/

## Contact
${BIZ.legalName}, ${BIZ.street}, ${BIZ.zip} ${BIZ.city}, Suisse. Tél : +41 78 941 85 38, E-mail : ${BIZ.email}, IDE : ${BIZ.vat}. Ouvert mardi à jeudi 13h30–16h30, samedi 18h–22h et dimanche 14h–18h (lundi et vendredi fermé).
`;
writeFileSync(join(OUT, 'llms.txt'), llms, 'utf8');

/* 8) Flux Google Merchant (Google Shopping), récupération planifiée par Merchant Center */
const catPath = (slug) => {
  const chain = [];
  let cur = catBySlug[slug];
  let guard = 0;
  while (cur && guard++ < 6) { chain.unshift(cur.name); cur = cur.parent ? catBySlug[cur.parent] : null; }
  return chain.join(' > ');
};
// "01.02.2026" | "1/2/26" → "2026-02-01T00:00:00+01:00" (ou null si illisible)
const releaseISO = (p) => {
  const raw = releaseDate(p);
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = '20' + y;
  d = d.padStart(2, '0'); mo = mo.padStart(2, '0');
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return `${y}-${mo}-${d}T00:00:00+01:00`;
};
const feedItems = products
  .filter((p) => p.price > 0 && p.image) // Google exige un prix ET une image
  .map((p) => {
    const link = SITE + prodUrl(p.slug);
    const image = /^https?:/.test(p.image) ? p.image : SITE + '/' + p.image;
    // Pas de précommande : disponibilité = en stock / rupture uniquement
    const availability = p.inStock ? 'in_stock' : 'out_of_stock';
    const availDate = '';
    const desc = (p.seoDesc && p.seoDesc.trim()) ? p.seoDesc.trim() : (p.desc || p.name);
    const type = catPath(p.category);
    return `    <item>
      <g:id>${esc(p.slug)}</g:id>
      <g:title>${esc(p.name.slice(0, 150))}</g:title>
      <g:description>${esc(desc.slice(0, 5000))}</g:description>
      <g:link>${esc(link)}</g:link>
      <g:image_link>${esc(image)}</g:image_link>
      <g:availability>${availability}</g:availability>${availDate}
      <g:price>${Number(p.price).toFixed(2)} CHF</g:price>${onPromo(p) ? `\n      <g:sale_price>${Number(p.salePrice).toFixed(2)} CHF</g:sale_price>` : ''}
      <g:condition>new</g:condition>
      <g:brand>${esc(brandOf(p))}</g:brand>
      <g:identifier_exists>no</g:identifier_exists>${type ? `\n      <g:product_type>${esc(type)}</g:product_type>` : ''}
    </item>`;
  });
const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Coffre à Dom, Boutique ludique &amp; vintage</title>
    <link>${SITE}</link>
    <description>Catalogue produits Coffre à Dom pour Google Shopping.</description>
${feedItems.join('\n')}
  </channel>
</rss>`;
writeFileSync(join(OUT, 'google-merchant.xml'), feed, 'utf8');

console.log(`✅ Build terminé, ${urls.size} pages générées dans /dist`);
console.log(`   • Flux Google Merchant : ${feedItems.length} produits éligibles → /google-merchant.xml`);
console.log(`   • ${pagesManifest.length} pages éditoriales`);
console.log(`   • ${cats.length} catégories · ${products.length} produits`);
console.log(`   • ${blog.posts.length} articles · ${blog.categories.length} catégories blog · ${blog.authors.length} auteurs · ${events.length} événements`);
