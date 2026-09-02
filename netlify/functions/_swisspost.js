/* =========================================================
   SwissPost — Digital Commerce API « Barcode »
   Génère une étiquette d'expédition (PDF) + code de suivi.
   Auth : OAuth2 client_credentials (scope DCAPI_BARCODE_READ).
   Secrets EN VARIABLES D'ENV (jamais dans le repo public) :
     SWISSPOST_CLIENT_ID, SWISSPOST_CLIENT_SECRET, SWISSPOST_FRANKING_LICENSE
   Config expéditeur (valeurs par défaut = boutique Le Bouveret) :
     SWISSPOST_SENDER_NAME1/NAME2/STREET/ZIP/CITY, SWISSPOST_PRODUCT, SWISSPOST_DEFAULT_WEIGHT
   ========================================================= */
const TOKEN_URL = 'https://api.post.ch/OAuth/token';
const LABEL_URL = 'https://dcapi.apis.post.ch/barcode/v1/generateAddressLabel';

let _token = null, _tokenExp = 0;

async function getToken() {
  const now = Date.now();
  if (_token && now < _tokenExp - 30000) return _token;
  const id = process.env.SWISSPOST_CLIENT_ID, secret = process.env.SWISSPOST_CLIENT_SECRET;
  if (!id || !secret) throw new Error('SwissPost : clés API manquantes (SWISSPOST_CLIENT_ID / SWISSPOST_CLIENT_SECRET).');
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope: 'DCAPI_BARCODE_READ' });
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  const txt = await r.text();
  let data; try { data = JSON.parse(txt); } catch (e) { throw new Error('SwissPost : réponse token illisible (' + r.status + ').'); }
  if (!r.ok || !data.access_token) throw new Error('SwissPost : authentification refusée (' + r.status + ') ' + (data.error_description || data.error || txt).toString().slice(0, 180));
  _token = data.access_token;
  _tokenExp = now + (Number(data.expires_in || 300) * 1000);
  return _token;
}

function sender() {
  return {
    name1: process.env.SWISSPOST_SENDER_NAME1 || 'Coffre à Dom Sàrl',
    name2: process.env.SWISSPOST_SENDER_NAME2 || 'coffreadom.ch',
    street: process.env.SWISSPOST_SENDER_STREET || 'Route des Îles 84',
    zip: process.env.SWISSPOST_SENDER_ZIP || '1897',
    city: process.env.SWISSPOST_SENDER_CITY || 'Le Bouveret',
    country: 'CH',
    logoRotation: 0,
    domicilePostOffice: (process.env.SWISSPOST_SENDER_ZIP || '1897') + ' ' + (process.env.SWISSPOST_SENDER_CITY || 'Le Bouveret'),
  };
}

function itemID() {
  // Identifiant unique numérique 20 chiffres exigé par l'API.
  const base = String(Date.now()) + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
  return ('00000000000000000000' + base).slice(-20);
}

/* order : { full_name, lang, shipping_address:{rue,numero,npa,localite}, email }
   opts  : { product?, weight? }  → renvoie { tracking, pdfBase64, itemId, raw } */
async function generateLabel(order, opts) {
  opts = opts || {};
  const a = order.shipping_address || {};
  if (!a.rue || !a.npa || !a.localite) throw new Error('Adresse de livraison incomplète (rue, NPA, localité requis).');
  const licence = process.env.SWISSPOST_FRANKING_LICENSE;
  if (!licence) throw new Error('Numéro de licence d’affranchissement manquant (SWISSPOST_FRANKING_LICENSE).');

  const lang = (order.lang || 'fr').toUpperCase(); // DE/FR/IT/EN acceptés
  const przl = [String(opts.product || process.env.SWISSPOST_PRODUCT || 'PRI').toUpperCase()];
  const weight = Number(opts.weight || process.env.SWISSPOST_DEFAULT_WEIGHT || 1000);
  const id = itemID();

  const payload = {
    language: ['DE', 'FR', 'IT', 'EN'].indexOf(lang) !== -1 ? lang : 'FR',
    frankingLicense: licence,
    ppFranking: false,
    customer: sender(),
    customerSystem: null,
    labelDefinition: {
      labelLayout: 'A6',
      printAddresses: 'RECIPIENT_AND_CUSTOMER',
      imageFileType: 'PDF',
      imageResolution: 300,
      printPreview: false,
    },
    item: {
      itemID: id,
      recipient: {
        name1: order.full_name || 'Client',
        street: [a.rue, a.numero].filter(Boolean).join(' '),
        zip: String(a.npa),
        city: a.localite,
        country: 'CH',
        email: order.email || null,
      },
      attributes: {
        przl: przl,
        deliveryDate: null,
        weight: weight,
      },
    },
  };

  const token = await getToken();
  const r = await fetch(LABEL_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const txt = await r.text();
  let data; try { data = JSON.parse(txt); } catch (e) { throw new Error('SwissPost : réponse étiquette illisible (' + r.status + ').'); }

  // Remontée d'erreurs métier
  const errs = (data && data.errors) || (data && data.item && data.item.errors);
  if (!r.ok || (Array.isArray(errs) && errs.length)) {
    const msg = Array.isArray(errs) && errs.length ? errs.map(function (e) { return e.message || e.code; }).join(' · ') : ('HTTP ' + r.status);
    throw new Error('SwissPost : ' + msg);
  }
  const item = data.item || {};
  const label = Array.isArray(item.label) ? item.label[0] : item.label;
  if (!label) throw new Error('SwissPost : étiquette absente de la réponse.');
  const tracking = item.identCode || item.sscc || item.trackId || null;
  return { tracking: tracking, pdfBase64: label, itemId: id, raw: item };
}

// Diagnostic : vérifie la présence des clés + teste l'authentification OAuth.
async function checkAuth() {
  const cfg = {
    clientId: !!process.env.SWISSPOST_CLIENT_ID,
    secret: !!process.env.SWISSPOST_CLIENT_SECRET,
    licence: process.env.SWISSPOST_FRANKING_LICENSE || null,
  };
  let auth = 'non testé';
  if (cfg.clientId && cfg.secret) {
    try { _token = null; _tokenExp = 0; await getToken(); auth = 'ok'; }
    catch (e) { auth = String(e.message || e); }
  } else {
    auth = 'clés client manquantes';
  }
  return { config: { clientId: cfg.clientId, secret: cfg.secret, licence: !!cfg.licence }, auth };
}

module.exports = { generateLabel, checkAuth };
