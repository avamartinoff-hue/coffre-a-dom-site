/* =========================================================
   Netlify Function — back office : recherche de carte (cotation)
   Proxy serveur vers l'API pokemontcg.io (évite CORS / User-Agent bloqué).
   Renvoie les cartes correspondantes avec le prix Cardmarket (€).

   ⚠️ Source : pokemontcg.io est DÉPRÉCIÉE mais reste GRATUITE sans clé
   (~1000 req/jour, 30/min). Les nouvelles inscriptions de clé sont fermées
   (le successeur Scrydex est payant et n'a pas Cardmarket). Si elle s'éteint,
   migrer vers PokéWallet (palier gratuit, Cardmarket EUR) : seul ce fichier
   est à adapter. POKEMONTCG_API_KEY reste supportée si une clé héritée existe.

   Auth : en-tête x-admin-password === ADMIN_PASSWORD
   POST { name, number?, set?, page? } → { ok, cards: [...] }
   Env  : ADMIN_PASSWORD, (optionnel) POKEMONTCG_API_KEY
   ========================================================= */
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });

// Construit la requête Lucene attendue par pokemontcg.io.
// NB : les jokers (name:char*) renvoient des 500 sur cette API — on utilise
// un mot simple (match de token) ou une phrase entre guillemets pour plusieurs mots.
function buildQuery({ name, number, set }) {
  const parts = [];
  if (name) {
    const n = String(name).trim().replace(/"/g, '');
    const words = n.split(/\s+/).filter(Boolean);
    parts.push(words.length <= 1 ? `name:${n.toLowerCase()}` : `name:"${n}"`);
  }
  if (number) parts.push(`number:"${String(number).trim().replace(/"/g, '')}"`);
  if (set) parts.push(`set.id:"${String(set).trim().replace(/"/g, '')}"`);
  return parts.join(' ');
}

// Un appel avec timeout ; l'API publique est parfois instable (500/502).
async function fetchCards(url, headers) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try { return await fetch(url, { headers, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// Réduit une carte de l'API à l'essentiel pour le back office.
function slim(c) {
  const cm = (c.cardmarket && c.cardmarket.prices) || {};
  const tp = (c.tcgplayer && c.tcgplayer.prices) || {};
  // Prix de référence : tendance Cardmarket (€), sinon moyenne, sinon low.
  const trend = cm.trendPrice != null ? cm.trendPrice
    : cm.averageSellPrice != null ? cm.averageSellPrice
      : cm.avg7 != null ? cm.avg7 : null;
  return {
    id: c.id,
    name: c.name,
    number: c.number || '',
    printedTotal: (c.set && (c.set.printedTotal || c.set.total)) || '',
    setName: (c.set && c.set.name) || '',
    setId: (c.set && c.set.id) || '',
    rarity: c.rarity || '',
    releaseDate: (c.set && c.set.releaseDate) || '',
    img: (c.images && c.images.small) || '',
    cmUrl: (c.cardmarket && c.cardmarket.url) || '',
    trendEur: trend,            // € — valeur de référence Cardmarket
    lowEur: cm.lowPrice != null ? cm.lowPrice : null,
    avgEur: cm.averageSellPrice != null ? cm.averageSellPrice : null,
    hasTcg: tp && Object.keys(tp).length > 0,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  const pwd = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  if (!process.env.ADMIN_PASSWORD || pwd !== process.env.ADMIN_PASSWORD) return json(401, { ok: false, error: 'Non autorisé.' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'JSON invalide.' }); }
  const q = buildQuery(body);
  if (!q) return json(400, { ok: false, error: 'Indiquez au moins un nom de carte.' });

  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&page=${page}&pageSize=24&orderBy=-set.releaseDate`;
  const headers = { 'User-Agent': 'Mozilla/5.0 (CoffreADom back office)' };
  if (process.env.POKEMONTCG_API_KEY) headers['X-Api-Key'] = process.env.POKEMONTCG_API_KEY;

  try {
    let r = await fetchCards(url, headers);
    // Nouvelle tentative unique sur 5xx (instabilité fréquente de l'API publique).
    if (!r.ok && r.status >= 500) { await new Promise((res) => setTimeout(res, 900)); r = await fetchCards(url, headers); }
    if (!r.ok) {
      return json(502, { ok: false, error: `Source de prix momentanément indisponible (${r.status}). Patientez quelques secondes et réessayez (limite ~30 recherches/min).` });
    }
    const d = await r.json();
    const cards = Array.isArray(d.data) ? d.data.map(slim) : [];
    return json(200, { ok: true, cards, total: d.totalCount || cards.length, page });
  } catch (e) {
    const msg = e && e.name === 'AbortError' ? 'Délai dépassé (source de prix lente).' : 'Erreur réseau vers la source de prix.';
    return json(502, { ok: false, error: msg });
  }
};
