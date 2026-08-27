/* =========================================================
   Brevo — helper partagé (contacts + e-mails transactionnels)
   Clé API : env BREVO_API_KEY (secrète). Liste : env BREVO_LIST_ID.
   Expéditeur : env BREVO_SENDER_EMAIL / BREVO_SENDER_NAME (doit être
   un expéditeur VÉRIFIÉ dans Brevo). Tolérant : si la clé manque, on
   n'échoue jamais (les e-mails ne doivent pas bloquer une commande).
   ========================================================= */
const API = 'https://api.brevo.com/v3';
const key = () => process.env.BREVO_API_KEY || '';
const hasKey = () => !!key();

// « #3 », « 3 », « liste 3 » → 3
function listId() {
  const n = parseInt(String(process.env.BREVO_LIST_ID || '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sender() {
  return {
    email: process.env.BREVO_SENDER_EMAIL || 'coffreadom@hotmail.com',
    name: process.env.BREVO_SENDER_NAME || 'Coffre à Dom',
  };
}

async function api(path, method, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': key() },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch (e) { /* 204 no content */ }
  return { status: r.status, ok: r.ok, data };
}

// Vérifie la validité de la clé API (sans l'exposer) : 200 = OK, 401 = invalide.
async function checkKey() {
  if (!hasKey()) return { ok: false, reason: 'no-key' };
  try {
    const r = await api('/account', 'GET');
    return { ok: r.ok, status: r.status, listId: listId(), errCode: r.data && r.data.code };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}

// Ajoute (ou met à jour) un contact, éventuellement dans une liste.
// Résilient : si la liste est invalide, on ajoute quand même le contact (sans liste).
async function addContact({ email, attributes, listIds }) {
  if (!hasKey() || !email) return { ok: false, skipped: true };
  const lists = listIds || (listId() ? [listId()] : undefined);
  async function post(withList) {
    const body = { email, updateEnabled: true };
    if (attributes) body.attributes = attributes;
    if (withList && lists) body.listIds = lists;
    return api('/contacts', 'POST', body);
  }
  try {
    let r = await post(true);
    if (r.ok || r.status === 204) return { ok: true };
    if (r.data && r.data.code === 'duplicate_parameter') {
      const upd = {};
      if (attributes) upd.attributes = attributes;
      if (lists) upd.listIds = lists;
      await api(`/contacts/${encodeURIComponent(email)}`, 'PUT', upd);
      return { ok: true, existed: true };
    }
    // Liste invalide → on réessaie sans liste pour ne pas perdre le contact
    if (lists && r.status >= 400 && r.status < 500) {
      const r2 = await post(false);
      if (r2.ok || r2.status === 204) return { ok: true, listError: true };
      if (r2.data && r2.data.code === 'duplicate_parameter') return { ok: true, existed: true, listError: true };
      return { ok: false, status: r2.status, code: r2.data && r2.data.code };
    }
    return { ok: false, status: r.status, code: r.data && r.data.code };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// Envoie un e-mail transactionnel (HTML).
async function sendEmail({ to, toName, subject, html, replyTo, tag }) {
  if (!hasKey() || !to) return { ok: false, skipped: true };
  try {
    const body = {
      sender: sender(),
      to: [{ email: to, name: toName || undefined }],
      subject,
      htmlContent: html,
    };
    if (replyTo) body.replyTo = { email: replyTo };
    if (tag) body.tags = [tag];
    const r = await api('/smtp/email', 'POST', body);
    return r.ok ? { ok: true } : { ok: false, status: r.status, detail: r.data };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

module.exports = { hasKey, listId, sender, addContact, sendEmail, checkKey };
