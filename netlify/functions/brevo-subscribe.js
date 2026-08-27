/* =========================================================
   Netlify Function — inscription newsletter Brevo
   Variables d'environnement à définir dans Netlify :
     BREVO_API_KEY   (obligatoire)  → clé API v3 Brevo (secrète)
     BREVO_LIST_ID   (optionnel)    → id numérique de la liste
   La clé reste côté serveur : jamais exposée dans le front.
   ========================================================= */
exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Méthode non autorisée.' }) };
  }

  const API_KEY = process.env.BREVO_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Service indisponible (clé manquante).' }) };
  }

  let email = '';
  try { email = (JSON.parse(event.body || '{}').email || '').trim().toLowerCase(); }
  catch (e) { /* ignore */ }

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!valid) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Adresse e-mail invalide.' }) };
  }

  const payload = { email, updateEnabled: true };
  if (process.env.BREVO_LIST_ID) payload.listIds = [Number(process.env.BREVO_LIST_ID)];

  try {
    const resp = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'content-type': 'application/json', 'api-key': API_KEY },
      body: JSON.stringify(payload),
    });

    if (resp.ok || resp.status === 204) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: 'Inscription confirmée.' }) };
    }

    const data = await resp.json().catch(() => ({}));
    // Contact déjà présent : on considère l'inscription réussie.
    if (data && data.code === 'duplicate_parameter') {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: 'Vous êtes déjà inscrit·e.' }) };
    }
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Inscription impossible pour le moment.' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Erreur réseau. Réessayez plus tard.' }) };
  }
};
