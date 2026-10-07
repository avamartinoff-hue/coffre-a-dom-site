/* =========================================================
   Netlify Function — « health » : la base Supabase répond-elle ?
   Utilisée par le garde-fou auto-maintenance côté site (site.js).
   Répond toujours HTTP 200 avec { ok: true|false } pour que le client
   puisse décider. Mise en cache courte (30 s) pour limiter la charge.
   Env : SUPABASE_URL + SUPABASE_SECRET_KEY (ou SUPABASE_PUBLISHABLE_KEY)
   ========================================================= */
const H = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30', 'Access-Control-Allow-Origin': '*' };

exports.handler = async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, skipped: true }) };
  try {
    const signal = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(6000) : undefined;
    const r = await fetch(`${url}/rest/v1/products?select=slug&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal,
    });
    return { statusCode: 200, headers: H, body: JSON.stringify({ ok: r.ok }) };
  } catch (e) {
    return { statusCode: 200, headers: H, body: JSON.stringify({ ok: false }) };
  }
};
