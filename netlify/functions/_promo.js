/* =========================================================
   Codes promo — validation partagée (checkout + create-order).
   Lecture Supabase via la clé secrète. La remise n'est JAMAIS
   calculée côté client : promo-check (aperçu) et create-order
   (source de vérité) appellent tous deux validatePromo.
   ========================================================= */
function sbHeaders() {
  const key = process.env.SUPABASE_SECRET_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

// Valide un code pour un sous-total et renvoie la remise applicable.
async function validatePromo(rawCode, subtotal) {
  const code = String(rawCode || '').trim().toUpperCase();
  const sub = Number(subtotal) || 0;
  if (!code) return { valid: false, discount: 0, reason: 'empty' };
  const url = process.env.SUPABASE_URL;
  if (!url || !process.env.SUPABASE_SECRET_KEY) return { valid: false, discount: 0, reason: 'error' };
  try {
    const r = await fetch(`${url}/rest/v1/promo_codes?select=*&code=eq.${encodeURIComponent(code)}`, { headers: sbHeaders() });
    if (!r.ok) return { valid: false, discount: 0, reason: 'error' };
    const rows = await r.json();
    const p = rows && rows[0];
    if (!p) return { valid: false, discount: 0, reason: 'unknown' };
    if (!p.active) return { valid: false, discount: 0, reason: 'inactive' };
    if (p.expires_at && String(p.expires_at) < new Date().toISOString().slice(0, 10)) return { valid: false, discount: 0, reason: 'expired' };
    if (p.max_uses != null && Number(p.used_count) >= Number(p.max_uses)) return { valid: false, discount: 0, reason: 'limit' };
    if (sub < Number(p.min_amount || 0)) return { valid: false, discount: 0, reason: 'min', minAmount: Number(p.min_amount || 0) };
    let discount = p.kind === 'fixed' ? Number(p.value) : sub * Number(p.value) / 100;
    discount = Math.min(discount, sub);              // jamais plus que le sous-total
    discount = Math.round(discount * 100) / 100;
    return { valid: true, discount, code: p.code, kind: p.kind, value: Number(p.value), id: p.id };
  } catch (e) {
    return { valid: false, discount: 0, reason: 'error' };
  }
}

// Incrémente le compteur d'utilisation (à l'enregistrement d'une commande).
async function bumpUsage(id) {
  try {
    const url = process.env.SUPABASE_URL;
    const [row] = await (await fetch(`${url}/rest/v1/promo_codes?select=used_count&id=eq.${encodeURIComponent(id)}`, { headers: sbHeaders() })).json();
    const next = (Number(row && row.used_count) || 0) + 1;
    await fetch(`${url}/rest/v1/promo_codes?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { ...sbHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ used_count: next }),
    });
  } catch (e) { /* non bloquant */ }
}

// Message lisible par raison d'invalidité (français).
function reasonMessage(reason, minAmount) {
  switch (reason) {
    case 'unknown': return 'Code promo inconnu.';
    case 'inactive': return 'Ce code promo n\'est plus actif.';
    case 'expired': return 'Ce code promo a expiré.';
    case 'limit': return 'Ce code promo a atteint sa limite d\'utilisation.';
    case 'min': return `Ce code demande un minimum de CHF ${Number(minAmount || 0).toFixed(2)}.`;
    case 'empty': return 'Entrez un code promo.';
    default: return 'Code promo indisponible pour le moment.';
  }
}

module.exports = { validatePromo, bumpUsage, reasonMessage };
