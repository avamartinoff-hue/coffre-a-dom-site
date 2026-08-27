/* =========================================================
   Netlify Function — « Republier » (protégé)
   Déclenche un build Netlify via un Build Hook (env BUILD_HOOK_URL).
   ========================================================= */
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (c, b) => ({ statusCode: c, headers: H, body: JSON.stringify(b) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  const pwd = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  if (!process.env.ADMIN_PASSWORD || pwd !== process.env.ADMIN_PASSWORD) return json(401, { ok: false, error: 'Non autorisé.' });
  const hook = process.env.BUILD_HOOK_URL;
  if (!hook) return json(400, { ok: false, error: 'Build hook non configuré. Créez-le dans Netlify (Build & deploy → Build hooks) et ajoutez BUILD_HOOK_URL en variable d\'environnement.' });
  try {
    const r = await fetch(hook, { method: 'POST' });
    if (!r.ok) return json(502, { ok: false, error: 'Déclenchement impossible.' });
    return json(200, { ok: true, message: 'Republication lancée — le site se met à jour dans 1 à 2 minutes.' });
  } catch (e) {
    return json(502, { ok: false, error: 'Erreur réseau.' });
  }
};
