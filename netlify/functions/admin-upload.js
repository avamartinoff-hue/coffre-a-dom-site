/* =========================================================
   Netlify Function — upload photo produit (protégé)
   POST { filename, contentType, dataBase64 } → upload vers
   Supabase Storage (bucket public product-images) ; renvoie l'URL.
   ========================================================= */
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (c, b) => ({ statusCode: c, headers: H, body: JSON.stringify(b) });
const slugify = (s) => String(s || 'img').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  const pwd = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  if (!process.env.ADMIN_PASSWORD || pwd !== process.env.ADMIN_PASSWORD) return json(401, { ok: false, error: 'Non autorisé.' });
  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SECRET_KEY;
  if (!URL || !KEY) return json(500, { ok: false, error: 'Service indisponible.' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Requête invalide.' }); }
  const { filename, contentType, dataBase64 } = payload;
  if (!dataBase64) return json(400, { ok: false, error: 'Aucune image.' });
  const type = /^image\/(png|jpe?g|webp|gif)$/.test(contentType || '') ? contentType : 'image/jpeg';

  const buf = Buffer.from(dataBase64.replace(/^data:[^,]+,/, ''), 'base64');
  if (buf.length > 6 * 1024 * 1024) return json(413, { ok: false, error: 'Image trop lourde (max 6 Mo).' });

  const ext = (type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const base = slugify((filename || 'produit').replace(/\.[^.]+$/, ''));
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  const path = `products/${base}-${rand}.${ext}`;

  try {
    const r = await fetch(`${URL}/storage/v1/object/product-images/${path}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': type, 'x-upsert': 'true' },
      body: buf,
    });
    if (!r.ok) return json(502, { ok: false, error: 'Upload impossible.', detail: await r.text() });
    const publicUrl = `${URL}/storage/v1/object/public/product-images/${path}`;
    return json(200, { ok: true, url: publicUrl });
  } catch (e) {
    return json(502, { ok: false, error: 'Erreur upload.', detail: String(e.message || e) });
  }
};
