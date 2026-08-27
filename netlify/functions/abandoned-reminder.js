/* =========================================================
   Netlify Scheduled Function — relance des paniers abandonnés
   Envoie UNE relance aux paniers non finalisés depuis > 1 h (et < 7 j),
   jamais à ceux déjà relancés ou déjà convertis en commande.
   Planifiée via netlify.toml : [functions."abandoned-reminder"].
   ========================================================= */
const brevo = require('./_brevo.js');
const E = require('./_emails.js');

function sb() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return {
    async get(p) { const r = await fetch(`${url}/rest/v1/${p}`, { headers }); if (!r.ok) throw new Error(`GET ${p} ${r.status}`); return r.json(); },
    async patch(p, body) { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`PATCH ${p} ${r.status}`); },
  };
}

exports.handler = async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY || !brevo.hasKey()) {
    return { statusCode: 200, body: 'skip' };
  }
  const db = sb();
  const now = Date.now();
  const olderThan = new Date(now - 60 * 60 * 1000).toISOString();       // > 1 h
  const newerThan = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(); // < 7 j
  let sent = 0;
  try {
    const carts = await db.get(
      `abandoned_carts?select=*&recovered_at=is.null&reminded_at=is.null&updated_at=lt.${olderThan}&updated_at=gt.${newerThan}&order=updated_at.desc&limit=50`
    );
    for (const cart of carts) {
      // marque d'abord pour éviter tout double envoi si le run se répète
      await db.patch(`abandoned_carts?id=eq.${cart.id}`, { reminded_at: new Date().toISOString() });
      const m = E.abandonedCart(cart);
      await brevo.sendEmail({ to: cart.email, subject: m.subject, html: m.html, tag: 'abandoned-cart' });
      sent++;
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, sent }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e.message || e), sent }) };
  }
};
