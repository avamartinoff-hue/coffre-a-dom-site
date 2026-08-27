/* =========================================================
   Netlify Function — inscription newsletter Brevo
   Env : BREVO_API_KEY (obligatoire), BREVO_LIST_ID (recommandé).
   La clé reste côté serveur. Voir _brevo.js pour la logique partagée.
   ========================================================= */
const brevo = require('./_brevo.js');
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (c, b) => ({ statusCode: c, headers, body: JSON.stringify(b) });

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Méthode non autorisée.' });
  if (!brevo.hasKey()) return json(500, { ok: false, error: 'Service indisponible (clé manquante).' });

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (e) { /* ignore */ }

  // Diagnostic (ne révèle aucun secret) : valide la clé + l'ID de liste.
  if (payload.diag) return json(200, { ok: true, diag: await brevo.checkKey() });

  const email = (payload.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { ok: false, error: 'Adresse e-mail invalide.' });

  const r = await brevo.addContact({ email, attributes: { OPT_IN: true, SOURCE: 'newsletter' } });
  if (r.ok) return json(200, { ok: true, message: r.existed ? 'Vous êtes déjà inscrit·e.' : 'Inscription confirmée.' });
  return json(502, { ok: false, error: 'Inscription impossible pour le moment.', brevoStatus: r.status, brevoCode: r.code });
};
