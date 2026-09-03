/* =========================================================
   Netlify Function — back office PRODUITS (protégé)
   Auth : en-tête x-admin-password === ADMIN_PASSWORD
   GET  : liste produits + catégories
   POST : { action }
     - 'update'   { slug, fields:{...} }        → modifie un produit
     - 'create'   { product:{...} }             → crée un produit
     - 'delete'   { slugs:[...] }               → supprime (lot)
     - 'bulk-set' { slugs:[...], fields:{...} }  → applique à plusieurs (activer/désactiver…)
   Env : SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_PASSWORD
   ========================================================= */
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (c, b) => ({ statusCode: c, headers: H, body: JSON.stringify(b) });

function sb() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const inList = (arr) => '(' + arr.map((s) => `"${String(s).replace(/"/g, '')}"`).join(',') + ')';
  return {
    inList,
    async get(p) { const r = await fetch(`${url}/rest/v1/${p}`, { headers }); if (!r.ok) throw new Error(`GET ${p} ${r.status}`); return r.json(); },
    async patch(p, body) { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`PATCH ${p} ${r.status} ${await r.text()}`); },
    async post(p, body) { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`POST ${p} ${r.status} ${await r.text()}`); return r.json(); },
    async del(p) { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'DELETE', headers }); if (!r.ok) throw new Error(`DEL ${p} ${r.status}`); },
  };
}

const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const ALLOWED = ['name', 'description', 'price', 'category', 'image', 'on_sale', 'in_stock', 'stock_qty', 'max_per_order', 'visible', 'sku', 'position', 'seo_title', 'seo_description', 'brand', 'translations'];
function clean(fields) {
  const out = {};
  for (const k of ALLOWED) if (k in fields) out[k] = fields[k];
  if ('price' in out) out.price = Math.max(0, Number(out.price) || 0);
  if ('stock_qty' in out) out.stock_qty = out.stock_qty === '' || out.stock_qty == null ? null : parseInt(out.stock_qty, 10);
  if ('max_per_order' in out) { const m = parseInt(out.max_per_order, 10); out.max_per_order = (out.max_per_order === '' || out.max_per_order == null || isNaN(m) || m <= 0) ? null : m; }
  ['on_sale', 'in_stock', 'visible'].forEach((b) => { if (b in out) out[b] = !!out[b]; });
  // Règle : « pas de stock → pas en stock ». Dès qu'on enregistre le champ quantité,
  // l'état « En stock » est déduit : quantité > 0 → disponible ; vide/0 → épuisé (non vendable).
  if ('stock_qty' in out) {
    out.in_stock = (out.stock_qty != null && !Number.isNaN(out.stock_qty) && out.stock_qty > 0);
  }
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  const pwd = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  if (!process.env.ADMIN_PASSWORD || pwd !== process.env.ADMIN_PASSWORD) return json(401, { ok: false, error: 'Non autorisé.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return json(500, { ok: false, error: 'Service indisponible.' });

  const db = sb();
  try {
    if (event.httpMethod === 'GET') {
      const products = await db.get('products?select=slug,name,description,price,category,image,on_sale,in_stock,stock_qty,max_per_order,visible,position,seo_title,seo_description,brand,translations&order=position');
      let categories;
      try { categories = await db.get('categories?select=slug,name,parent,icon,description,visible&order=name'); }
      catch (e) { categories = await db.get('categories?select=slug,name,parent&order=name'); }
      return json(200, { ok: true, products, categories });
    }
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const action = body.action;

      if (action === 'update') {
        if (!body.slug) return json(400, { ok: false, error: 'slug requis' });
        await db.patch(`products?slug=eq.${encodeURIComponent(body.slug)}`, clean(body.fields || {}));
        return json(200, { ok: true });
      }
      if (action === 'create') {
        const p = body.product || {};
        if (!p.name) return json(400, { ok: false, error: 'Nom requis' });
        let slug = p.slug ? slugify(p.slug) : slugify(p.name);
        const existing = await db.get(`products?select=slug&slug=eq.${encodeURIComponent(slug)}`);
        if (existing.length) slug = slug + '-' + Math.floor(Math.random() * 9000 + 1000);
        const row = clean(p); row.slug = slug;
        if (!('visible' in row)) row.visible = true;
        if (!('in_stock' in row)) row.in_stock = true;
        const [created] = await db.post('products', row);
        return json(200, { ok: true, product: created });
      }
      if (action === 'delete') {
        const slugs = (body.slugs || []).filter(Boolean);
        if (!slugs.length) return json(400, { ok: false, error: 'Aucun produit sélectionné' });
        await db.del(`products?slug=in.${db.inList(slugs)}`);
        return json(200, { ok: true, deleted: slugs.length });
      }
      if (action === 'create-category') {
        const name = (body.name || '').trim();
        if (!name) return json(400, { ok: false, error: 'Nom de catégorie requis' });
        let slug = slugify(name);
        if (!slug) return json(400, { ok: false, error: 'Nom invalide' });
        const ex = await db.get(`categories?select=slug,name,parent&slug=eq.${encodeURIComponent(slug)}`);
        if (ex.length) return json(200, { ok: true, category: ex[0], existed: true });
        const [c] = await db.post('categories', { slug, name, parent: body.parent || null });
        return json(200, { ok: true, category: c });
      }
      if (action === 'update-category') {
        if (!body.slug) return json(400, { ok: false, error: 'slug requis' });
        const fields = body.fields || {};
        const patch = {};
        ['name', 'parent', 'icon', 'description'].forEach((k) => { if (k in fields) patch[k] = fields[k] === '' && k === 'parent' ? null : fields[k]; });
        if ('visible' in fields) patch.visible = !!fields.visible;
        if (!Object.keys(patch).length) return json(400, { ok: false, error: 'Rien à modifier' });
        const target = `categories?slug=eq.${encodeURIComponent(body.slug)}`;
        // Réessais dégressifs : selon les migrations jouées, certaines colonnes
        // (visible / icon / description) peuvent manquer. On garantit au moins name + parent.
        const variants = [patch];
        if ('visible' in patch) { const v = { ...patch }; delete v.visible; variants.push(v); }
        const core = {}; ['name', 'parent'].forEach((k) => { if (k in patch) core[k] = patch[k]; });
        variants.push(core);
        let lastErr;
        for (const v of variants) {
          if (!Object.keys(v).length) continue;
          try { await db.patch(target, v); return json(200, { ok: true }); }
          catch (e) { lastErr = e; }
        }
        return json(502, { ok: false, error: 'Erreur mise à jour catégorie', detail: String((lastErr && lastErr.message) || lastErr) });
      }
      if (action === 'delete-category') {
        if (!body.slug) return json(400, { ok: false, error: 'slug requis' });
        const [cat] = await db.get(`categories?select=slug,parent&slug=eq.${encodeURIComponent(body.slug)}`);
        if (!cat) return json(404, { ok: false, error: 'Catégorie introuvable' });
        const newParent = cat.parent || null;
        // Réassigne les produits vers la catégorie parente (ou vide), et rattache les sous-catégories au parent
        await db.patch(`products?category=eq.${encodeURIComponent(body.slug)}`, { category: newParent || '' });
        await db.patch(`categories?parent=eq.${encodeURIComponent(body.slug)}`, { parent: newParent });
        await db.del(`categories?slug=eq.${encodeURIComponent(body.slug)}`);
        return json(200, { ok: true, movedTo: newParent });
      }
      if (action === 'bulk-set') {
        const slugs = (body.slugs || []).filter(Boolean);
        if (!slugs.length) return json(400, { ok: false, error: 'Aucun produit sélectionné' });
        await db.patch(`products?slug=in.${db.inList(slugs)}`, clean(body.fields || {}));
        return json(200, { ok: true, updated: slugs.length });
      }
      return json(400, { ok: false, error: 'Action inconnue' });
    }
    return json(405, { ok: false, error: 'Méthode non autorisée' });
  } catch (e) {
    return json(502, { ok: false, error: 'Erreur produits', detail: String(e.message || e) });
  }
};
