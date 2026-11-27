/* =========================================================
   Netlify Function — back office : offres de rachat (protégé)
   Gère les paramètres de calcul + l'enregistrement/relecture des offres.
   Le calcul (offre payée, revente, totaux) est REFAIT côté serveur à
   l'enregistrement pour garantir l'intégrité (le navigateur ne fait
   qu'un aperçu). Numérotation séquentielle jamais en collision.

   Auth : en-tête x-admin-password === ADMIN_PASSWORD
   POST { action } :
     'params'           → { ok, params }
     'save-params'      → { params } → { ok, params }
     'list'             → { ok, offers }           (derniers 200, résumé)
     'get'    { id }    → { ok, offer }
     'create' { client_name?, client_note?, status?, lines:[...] } → { ok, offer }
     'set-status' { id, status } → { ok }
   Env : SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_PASSWORD
   ========================================================= */
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });

function sb() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return {
    async get(p) { const r = await fetch(`${url}/rest/v1/${p}`, { headers }); if (!r.ok) throw new Error(`GET ${p} ${r.status}`); return r.json(); },
    async post(p, b, prefer = 'return=representation') { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'POST', headers: { ...headers, Prefer: prefer }, body: JSON.stringify(b) }); if (!r.ok) throw new Error(`POST ${p} ${r.status} ${await r.text()}`); return prefer.includes('representation') ? r.json() : null; },
    async patch(p, b) { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(b) }); if (!r.ok) throw new Error(`PATCH ${p} ${r.status}`); },
    async del(p) { const r = await fetch(`${url}/rest/v1/${p}`, { method: 'DELETE', headers }); if (!r.ok) throw new Error(`DELETE ${p} ${r.status}`); },
  };
}

const DEFAULTS = {
  marge: 1.55, tva: 0.081, cm_plus: 0.05, eur_chf_buy: 0.91, eur_chf_sell: 0.93, next_number: 118,
  paliers: [{ max: 20, reprise: 60 }, { max: 100, reprise: 65 }, { max: null, reprise: 80 }],
  merchant: { name: 'Coffre à Dom Sàrl', ide: 'CHE-142.573.696', addr: '', email: '', phone: '' },
};

async function loadParams(db) {
  const rows = await db.get('buyback_config?id=eq.1&select=data');
  const data = (rows[0] && rows[0].data) || {};
  const p = { ...DEFAULTS, ...data, merchant: { ...DEFAULTS.merchant, ...(data.merchant || {}) } };
  // Les nouveaux taux séparés (eur_chf_buy / eur_chf_sell) priment ; l'ancien `eur_chf`
  // ne sert QUE si AUCUN des deux n'a jamais été défini dans la config (vraie config legacy).
  if (data.eur_chf != null && data.eur_chf_buy == null && data.eur_chf_sell == null) {
    p.eur_chf_buy = DEFAULTS.eur_chf_buy;   // garde les défauts calibrés (0.91 / 0.93)
    p.eur_chf_sell = DEFAULTS.eur_chf_sell; // plutôt que l'ancien taux unique
  }
  return p;
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Recalcule une ligne à partir de la valeur (€) et du % de reprise.
function computeLine(line, p) {
  const value = round2(line.value_eur);
  const qty = Math.max(1, parseInt(line.qty, 10) || 1);
  const reprise = Number(line.reprise_pct);
  const pct = isFinite(reprise) ? reprise : 60;
  const offreUnit = round2(value * pct / 100);               // € payé au vendeur / unité
  const ttcEurUnit = offreUnit * (Number(p.marge) || 1) * (1 + (Number(p.tva) || 0));
  const sellRate = Number(p.eur_chf_sell != null ? p.eur_chf_sell : p.eur_chf) || 1;
  const ttcChfUnit = round2(ttcEurUnit * sellRate);                       // revente CHF TTC / unité
  const cmChfUnit = round2(ttcChfUnit * (1 + (Number(p.cm_plus) || 0)));  // revente CHF +5% CM
  return {
    name: String(line.name || '').slice(0, 160),
    set: String(line.set || '').slice(0, 120),
    number: String(line.number || '').slice(0, 40),
    etat: String(line.etat || '').slice(0, 24),
    langue: String(line.langue || '').slice(0, 8),
    img: String(line.img || '').slice(0, 400),
    qty,
    value_eur: value,
    reprise_pct: pct,
    offre_eur: round2(offreUnit * qty),      // offre pour la ligne (toutes unités)
    ttc_chf: round2(ttcChfUnit * qty),       // revente TTC CHF pour la ligne
    cm_chf: round2(cmChfUnit * qty),         // revente +5% CM pour la ligne
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  const pwd = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  if (!process.env.ADMIN_PASSWORD || pwd !== process.env.ADMIN_PASSWORD) return json(401, { ok: false, error: 'Non autorisé.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return json(500, { ok: false, error: 'Service indisponible.' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'JSON invalide.' }); }
  const db = sb();
  const action = body.action || 'params';

  try {
    if (action === 'params') {
      return json(200, { ok: true, params: await loadParams(db) });
    }

    if (action === 'save-params') {
      const cur = await loadParams(db);
      const next = { ...cur, ...(body.params || {}), merchant: { ...cur.merchant, ...((body.params || {}).merchant || {}) } };
      // Garde-fous numériques
      ['marge', 'tva', 'cm_plus', 'eur_chf_buy', 'eur_chf_sell'].forEach((k) => { next[k] = Number(next[k]) || cur[k]; });
      next.next_number = Math.max(1, parseInt(next.next_number, 10) || cur.next_number);
      if (!Array.isArray(next.paliers) || !next.paliers.length) next.paliers = cur.paliers;
      await db.post('buyback_config', { id: 1, data: next, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
      return json(200, { ok: true, params: next });
    }

    if (action === 'list') {
      // Tolérant : si la colonne listed_at n'existe pas encore (buyback.sql pas rejoué), on retombe sans elle.
      let offers;
      try { offers = await db.get('buyback_offers?select=id,offer_number,created_at,client_name,status,total_offre_eur,valeur_rachat_chf,listed_at&order=offer_number.desc&limit=200'); }
      catch (e) { offers = await db.get('buyback_offers?select=id,offer_number,created_at,client_name,status,total_offre_eur,valeur_rachat_chf&order=offer_number.desc&limit=200'); }
      return json(200, { ok: true, offers });
    }

    if (action === 'get') {
      if (!body.id) return json(400, { ok: false, error: 'id manquant.' });
      const rows = await db.get(`buyback_offers?id=eq.${encodeURIComponent(body.id)}&select=*`);
      if (!rows[0]) return json(404, { ok: false, error: 'Offre introuvable.' });
      return json(200, { ok: true, offer: rows[0] });
    }

    if (action === 'set-status') {
      if (!body.id || !body.status) return json(400, { ok: false, error: 'id/status manquant.' });
      const allowed = ['draft', 'sent', 'accepted', 'paid', 'cancelled'];
      if (!allowed.includes(body.status)) return json(400, { ok: false, error: 'statut invalide.' });
      await db.patch(`buyback_offers?id=eq.${encodeURIComponent(body.id)}`, { status: body.status });
      return json(200, { ok: true });
    }

    if (action === 'mark-listed') {
      if (!body.id) return json(400, { ok: false, error: 'id manquant.' });
      // Best-effort : si la colonne listed_at manque (SQL pas rejoué), on ne bloque pas.
      try { await db.patch(`buyback_offers?id=eq.${encodeURIComponent(body.id)}`, { listed_at: new Date().toISOString() }); return json(200, { ok: true, persisted: true }); }
      catch (e) { return json(200, { ok: true, persisted: false }); }
    }

    if (action === 'delete') {
      if (!body.id) return json(400, { ok: false, error: 'id manquant.' });
      await db.del(`buyback_offers?id=eq.${encodeURIComponent(body.id)}`);
      return json(200, { ok: true });
    }

    if (action === 'tag-products') {
      // Enregistre les cartes mises en vente (slug + coût de rachat) pour la marge réalisée.
      const items = Array.isArray(body.items) ? body.items : [];
      const rows = items.filter((x) => x && x.slug).map((x) => ({
        slug: String(x.slug).slice(0, 160),
        offer_id: body.offer_id || null,
        offer_number: body.offer_number != null ? parseInt(body.offer_number, 10) : null,
        cost_chf: round2(x.cost_chf),
        card_name: (x.card_name || '').slice(0, 160) || null,
      }));
      if (!rows.length) return json(200, { ok: true, tagged: 0 });
      try { await db.post('buyback_products', rows, 'resolution=merge-duplicates,return=minimal'); return json(200, { ok: true, tagged: rows.length }); }
      catch (e) { return json(200, { ok: true, tagged: 0, persisted: false }); }
    }

    if (action === 'create') {
      const p = await loadParams(db);
      const rawLines = Array.isArray(body.lines) ? body.lines : [];
      const lines = rawLines.filter((l) => l && (l.name || l.value_eur != null)).map((l) => computeLine(l, p));
      if (!lines.length) return json(400, { ok: false, error: 'Aucune ligne valide.' });
      const totalOffreEur = round2(lines.reduce((s, l) => s + l.offre_eur, 0));
      const buyRate = Number(p.eur_chf_buy != null ? p.eur_chf_buy : p.eur_chf) || 1;
      const valeurRachatChf = round2(totalOffreEur * buyRate);

      // Numéro séquentiel : max(existant, next_number-1) + 1 → jamais de collision.
      const last = await db.get('buyback_offers?select=offer_number&order=offer_number.desc&limit=1');
      const base = Math.max((last[0] && last[0].offer_number) || 0, (p.next_number || 1) - 1);
      const offerNumber = base + 1;

      const payModes = ['especes', 'virement', 'twint'];
      const row = {
        offer_number: offerNumber,
        client_name: (body.client_name || '').slice(0, 160) || null,
        client_note: (body.client_note || '').slice(0, 2000) || null,
        currency: 'CHF',
        eur_chf_rate: buyRate || null,
        params: { marge: p.marge, tva: p.tva, cm_plus: p.cm_plus, eur_chf_buy: p.eur_chf_buy, eur_chf_sell: p.eur_chf_sell },
        lines,
        total_offre_eur: totalOffreEur,
        valeur_rachat_chf: valeurRachatChf,
        status: ['draft', 'sent', 'accepted', 'paid', 'cancelled'].includes(body.status) ? body.status : 'draft',
        payment_mode: payModes.includes(body.payment_mode) ? body.payment_mode : null,
      };
      // Tolérant : si la colonne payment_mode n'existe pas encore (SQL pas rejoué), on réinsère sans.
      let offer;
      try { [offer] = await db.post('buyback_offers', row); }
      catch (e) { const r2 = { ...row }; delete r2.payment_mode; [offer] = await db.post('buyback_offers', r2); }

      // Avance next_number pour la prochaine offre.
      await db.post('buyback_config', { id: 1, data: { ...p, next_number: offerNumber + 1 }, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal').catch(() => {});

      return json(200, { ok: true, offer });
    }

    return json(400, { ok: false, error: 'Action inconnue.' });
  } catch (e) {
    return json(500, { ok: false, error: String((e && e.message) || e) });
  }
};
