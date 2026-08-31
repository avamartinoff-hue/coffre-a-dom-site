/* =========================================================
   Netlify Function — back office CODES PROMO (protégé)
   Auth : x-admin-password === ADMIN_PASSWORD
   GET  : liste des codes
   POST : { action:'create'|'update'|'delete'|'toggle', ... }
   ========================================================= */
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (c, b) => ({ statusCode: c, headers: H, body: JSON.stringify(b) });

function sb() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return {
    async get(p) { const r = await fetch(`${url}/rest/v1/${p}`, { headers }); if (!r.ok) throw new Error(`GET ${p} ${r.status}`); return r.json(); },
    async post(p, b) { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(b) }); if (!r.ok) throw new Error(`POST ${p} ${r.status} ${await r.text()}`); return r.json(); },
    async patch(p, b) { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(b) }); if (!r.ok) throw new Error(`PATCH ${p} ${r.status}`); },
    async del(p) { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'DELETE', headers }); if (!r.ok) throw new Error(`DEL ${p} ${r.status}`); },
  };
}

// Nettoie/normalise les champs d'un code promo
function clean(f) {
  const out = {};
  if (f.code != null) out.code = String(f.code).trim().toUpperCase().replace(/\s+/g, '');
  if (f.kind === 'fixed' || f.kind === 'percent') out.kind = f.kind;
  if (f.value != null && f.value !== '') out.value = Math.max(0, Number(f.value) || 0);
  if ('active' in f) out.active = !!f.active;
  if ('min_amount' in f) out.min_amount = Math.max(0, Number(f.min_amount) || 0);
  if ('expires_at' in f) out.expires_at = f.expires_at ? String(f.expires_at).slice(0, 10) : null;
  if ('max_uses' in f) out.max_uses = (f.max_uses === '' || f.max_uses == null) ? null : Math.max(1, parseInt(f.max_uses, 10) || 1);
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
      const codes = await db.get('promo_codes?select=*&order=created_at.desc&limit=500');
      return json(200, { ok: true, codes });
    }
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { action, id } = body;
      if (action === 'create') {
        const f = clean(body.fields || {});
        if (!f.code) return json(400, { ok: false, error: 'Code requis.' });
        if (!f.kind) f.kind = 'percent';
        if (f.value == null) f.value = 0;
        if (f.active == null) f.active = true;
        try {
          const [row] = await db.post('promo_codes', f);
          return json(200, { ok: true, code: row });
        } catch (e) {
          if (/23505|duplicate/i.test(String(e.message))) return json(400, { ok: false, error: 'Ce code existe déjà.' });
          throw e;
        }
      }
      if (action === 'update') {
        if (!id) return json(400, { ok: false, error: 'id requis.' });
        const f = clean(body.fields || {});
        if (!Object.keys(f).length) return json(400, { ok: false, error: 'Rien à modifier.' });
        await db.patch(`promo_codes?id=eq.${encodeURIComponent(id)}`, f);
        return json(200, { ok: true });
      }
      if (action === 'toggle') {
        if (!id) return json(400, { ok: false, error: 'id requis.' });
        await db.patch(`promo_codes?id=eq.${encodeURIComponent(id)}`, { active: !!body.active });
        return json(200, { ok: true });
      }
      if (action === 'delete') {
        if (!id) return json(400, { ok: false, error: 'id requis.' });
        await db.del(`promo_codes?id=eq.${encodeURIComponent(id)}`);
        return json(200, { ok: true });
      }
      return json(400, { ok: false, error: 'Action inconnue.' });
    }
    return json(405, { ok: false, error: 'Méthode non autorisée.' });
  } catch (e) {
    return json(502, { ok: false, error: 'Erreur back office.', detail: String(e.message || e) });
  }
};
