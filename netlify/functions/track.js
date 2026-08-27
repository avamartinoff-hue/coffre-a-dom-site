/* =========================================================
   Netlify Function — compteur de visites (beacon)
   POST { path } → insère une ligne dans page_views (clé secrète).
   Public (pas de mot de passe), léger. Ignore silencieusement si
   la table n'existe pas encore.
   ========================================================= */
const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: H, body: '' };
  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SECRET_KEY;
  if (!URL || !KEY) return { statusCode: 204, headers: H, body: '' };

  let path = '/';
  try { path = String((JSON.parse(event.body || '{}').path || '/')).slice(0, 300); } catch (e) {}
  const ref = (event.headers['referer'] || event.headers['referrer'] || '').slice(0, 300);

  try {
    await fetch(`${URL}/rest/v1/page_views`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ path, ref }),
    });
  } catch (e) { /* silencieux */ }
  return { statusCode: 204, headers: H, body: '' };
};
