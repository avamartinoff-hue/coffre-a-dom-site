/* =========================================================
   Netlify Function — statut des tâches planifiées (lecture seule).
   Renvoie la date de dernier passage de chaque cron (écrite par _heartbeat).
   Aucune donnée sensible : uniquement des horodatages → public.
   Env : SUPABASE_URL + SUPABASE_SECRET_KEY
   ========================================================= */
const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };

exports.handler = async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return { statusCode: 200, headers: H, body: JSON.stringify({ ok: false, error: 'config manquante' }) };
  try {
    const r = await fetch(`${url}/rest/v1/app_config?select=key,value&key=like.cron_*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const rows = r.ok ? await r.json() : [];
    const now = Date.now();
    const crons = {};
    rows.forEach((row) => {
      const t = Date.parse(row.value);
      const entry = { last: row.value, minutesAgo: isNaN(t) ? null : Math.round((now - t) / 60000) };
      const prev = crons[row.key];
      // en cas de doublons éventuels, garder le plus récent
      if (!prev || (entry.minutesAgo != null && (prev.minutesAgo == null || entry.minutesAgo < prev.minutesAgo))) crons[row.key] = entry;
    });
    return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, now: new Date().toISOString(), crons }) };
  } catch (e) {
    return { statusCode: 200, headers: H, body: JSON.stringify({ ok: false, error: String(e.message || e) }) };
  }
};
