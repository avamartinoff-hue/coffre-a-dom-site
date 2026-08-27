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

// Ajoute (ou met à jour) un contact, éventuellement dans une liste.
async function addContact({ email, attributes, listIds }) {
  if (!hasKey() || !email) return { ok: false, skipped: true };
  const lists = listIds || (listId() ? [listId()] : undefined);
  try {
    const body = { email, updateEnabled: true };
    if (attributes) body.attributes = attributes;
    if (lists) body.listIds = lists;
    const r = await api('/contacts', 'POST', body);
    if (r.ok || r.status === 204) return { ok: true };
    if (r.data && r.data.code === 'duplicate_parameter') {
      // déjà présent → mise à jour (rattache à la liste, met à jour les attributs)
      const upd = {};
      if (attributes) upd.attributes = attributes;
      if (lists) upd.listIds = lists;
      await api(`/contacts/${encodeURIComponent(email)}`, 'PUT', upd);
      return { ok: true, existed: true };
    }
    return { ok: false, status: r.status };
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

module.exports = { hasKey, listId, sender, addContact, sendEmail };
