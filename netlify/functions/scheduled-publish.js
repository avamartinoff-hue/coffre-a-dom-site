/* =========================================================
   Netlify Scheduled Function — publication automatique du site
   À 12h et minuit (heure suisse). Déclenche un build Netlify (BUILD_HOOK_URL)
   UNIQUEMENT s'il y a eu une modification produit/catégorie depuis le passage
   précédent → 0 déploiement (= 0 crédit) les jours sans changement.
   Le client peut donc modifier ses produits librement sans cliquer « Publier ».
   Planifiée via netlify.toml : [functions."scheduled-publish"].
   Env : SUPABASE_URL, SUPABASE_SECRET_KEY, BUILD_HOOK_URL
   ========================================================= */
exports.handler = async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const hook = process.env.BUILD_HOOK_URL;
  if (!url || !key || !hook) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, built: false, reason: 'config manquante (SUPABASE/BUILD_HOOK)' }) };
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  // Fenêtre = intervalle entre 2 passages (12 h) + 1 h de marge, pour ne rater aucune modif.
  const since = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
  const changedSince = async (table) => {
    try {
      const r = await fetch(`${url}/rest/v1/${table}?select=slug&updated_at=gt.${encodeURIComponent(since)}&limit=1`, { headers });
      if (!r.ok) return false;
      const rows = await r.json();
      return Array.isArray(rows) && rows.length > 0;
    } catch (e) { return false; }
  };

  const changed = (await changedSince('products')) || (await changedSince('categories'));
  if (!changed) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, built: false, reason: 'aucune modification depuis le dernier passage' }) };
  }
  try {
    const r = await fetch(hook, { method: 'POST' });
    return { statusCode: r.ok ? 200 : 502, body: JSON.stringify({ ok: r.ok, built: r.ok }) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ ok: false, built: false, error: String(e.message || e) }) };
  }
};
