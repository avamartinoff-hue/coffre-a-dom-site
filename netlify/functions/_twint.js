/* =========================================================
   TWINT — client SOAP marchand (API officielle v10, mTLS)
   Reproduit le flux du plugin officiel Twint-AG :
     StartOrder (PAYMENT_IMMEDIATE, GOODS, QRCodeRendering) → QR + token
     MonitorOrder → statut (payé / en cours / échec)
   Auth : certificat client .p12 (mTLS) + UUID de commerce.
   INACTIF tant que les variables d'env ne sont pas définies.
   Env : TWINT_MERCHANT_UUID, TWINT_CASH_REGISTER_ID, TWINT_P12_BASE64,
         TWINT_P12_PASSWORD, (opt) TWINT_SOFTWARE_NAME, TWINT_SOFTWARE_VERSION
   ========================================================= */
const https = require('https');
const crypto = require('crypto');

const ENDPOINT = 'https://service.twint.ch/merchant/service/TWINTMerchantServiceV10';
const NS_M = 'http://service.twint.ch/merchant/types/v10';
const NS_B = 'http://service.twint.ch/base/types/v10';
const NS_H = 'http://service.twint.ch/header/types/v10';

// Actif si l'UUID + le mot de passe sont en env ET Supabase est configuré (le certificat .p12
// est stocké dans Supabase — table app_config, clé 'twint_p12' — pour éviter la limite 4 Ko des env Lambda).
const configured = () => !!(process.env.TWINT_MERCHANT_UUID && process.env.TWINT_P12_PASSWORD && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

// Charge le certificat .p12 (base64) depuis Supabase, avec cache mémoire.
let _pfxCache = null;
async function getPfx() {
  if (_pfxCache) return _pfxCache;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const r = await fetch(`${url}/rest/v1/app_config?select=value&key=eq.twint_p12`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`Lecture certificat Supabase ${r.status}`);
  const rows = await r.json();
  const b64 = rows && rows[0] && rows[0].value;
  if (!b64) throw new Error('Certificat TWINT introuvable (Supabase app_config / twint_p12).');
  _pfxCache = Buffer.from(String(b64).replace(/\s/g, ''), 'base64');
  return _pfxCache;
}
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Extrait le contenu texte d'une balise par son nom local (prefixe ignoré)
function tag(xml, name) {
  const m = xml.match(new RegExp('<(?:[\\w.-]+:)?' + name + '\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?' + name + '>'));
  return m ? m[1].trim() : null;
}
function attr(xml, name, at) {
  const m = xml.match(new RegExp('<(?:[\\w.-]+:)?' + name + '\\b([^>]*)>'));
  if (!m) return null;
  const a = m[1].match(new RegExp(at + '="([^"]*)"'));
  return a ? a[1] : null;
}

function envelope(bodyXml) {
  const messageId = crypto.randomUUID();
  const name = process.env.TWINT_SOFTWARE_NAME || 'Coffre a Dom Web';
  const version = process.env.TWINT_SOFTWARE_VERSION || '1.0';
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:m="' + NS_M + '" xmlns:b="' + NS_B + '" xmlns:h="' + NS_H + '">' +
      '<soapenv:Header>' +
        '<h:RequestHeaderElement>' +
          '<h:MessageId>' + messageId + '</h:MessageId>' +
          '<h:ClientSoftwareName>' + esc(name) + '</h:ClientSoftwareName>' +
          '<h:ClientSoftwareVersion>' + esc(version) + '</h:ClientSoftwareVersion>' +
        '</h:RequestHeaderElement>' +
      '</soapenv:Header>' +
      '<soapenv:Body>' + bodyXml + '</soapenv:Body>' +
    '</soapenv:Envelope>';
}

function merchantInfoXml() {
  return '<m:MerchantInformation>' +
    '<b:MerchantUuid>' + esc(process.env.TWINT_MERCHANT_UUID) + '</b:MerchantUuid>' +
    '<b:CashRegisterId>' + esc(process.env.TWINT_CASH_REGISTER_ID || 'COFFREADOM-WEB') + '</b:CashRegisterId>' +
    '</m:MerchantInformation>';
}

async function soapCall(action, bodyXml) {
  const pfx = await getPfx();
  return new Promise((resolve, reject) => {
    const payload = envelope(bodyXml);
    const req = https.request(ENDPOINT, {
      method: 'POST',
      pfx,
      passphrase: process.env.TWINT_P12_PASSWORD,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"' + action + '"',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function faultOf(xml) {
  if (!/(<|:)Fault[\s>]/.test(xml)) return null;
  return tag(xml, 'faultstring') || tag(xml, 'Reason') || tag(xml, 'Detail') || 'SOAP Fault';
}

// StartOrder : crée la commande TWINT et renvoie le QR + le token
async function startOrder({ reference, amount }) {
  const body =
    '<m:StartOrderRequestElement>' +
      merchantInfoXml() +
      '<m:Order type="PAYMENT_IMMEDIATE" confirmationNeeded="false">' +
        '<m:PostingType>GOODS</m:PostingType>' +
        '<m:RequestedAmount>' +
          '<b:Amount>' + Number(amount).toFixed(2) + '</b:Amount>' +
          '<b:Currency>CHF</b:Currency>' +
        '</m:RequestedAmount>' +
        '<m:MerchantTransactionReference>' + esc(reference) + '</m:MerchantTransactionReference>' +
      '</m:Order>' +
      '<m:UnidentifiedCustomer>true</m:UnidentifiedCustomer>' +
      '<m:QRCodeRendering>true</m:QRCodeRendering>' +
    '</m:StartOrderRequestElement>';
  const { status, body: xml } = await soapCall('StartOrder', body);
  const fault = faultOf(xml);
  if (fault) throw new Error('TWINT StartOrder: ' + fault);
  if (status >= 400) throw new Error('TWINT StartOrder HTTP ' + status);
  return {
    orderUuid: tag(xml, 'OrderUuid'),
    token: tag(xml, 'Token'),
    qrCode: tag(xml, 'QRCode'),
    statusValue: tag(xml, 'Status'),
    statusCode: attr(xml, 'Status', 'code'),
  };
}

// MonitorOrder : renvoie le statut courant de la commande
async function monitorOrder({ orderUuid }) {
  const body =
    '<m:MonitorOrderRequestElement>' +
      merchantInfoXml() +
      '<m:OrderUuid>' + esc(orderUuid) + '</m:OrderUuid>' +
      '<m:WaitForResponse>false</m:WaitForResponse>' +
    '</m:MonitorOrderRequestElement>';
  const { status, body: xml } = await soapCall('MonitorOrder', body);
  const fault = faultOf(xml);
  if (fault) throw new Error('TWINT MonitorOrder: ' + fault);
  if (status >= 400) throw new Error('TWINT MonitorOrder HTTP ' + status);
  return {
    statusValue: tag(xml, 'Status'),
    statusCode: attr(xml, 'Status', 'code'),
    reasonValue: tag(xml, 'Reason'),
    raw: xml.slice(0, 2000),
  };
}

// EnrollCashRegister : enregistre la caisse (une seule fois) auprès de TWINT
async function enrollCashRegister(type) {
  const body =
    '<m:EnrollCashRegisterRequestElement>' +
      merchantInfoXml() +
      '<m:CashRegisterType>' + (type || 'EPOS') + '</m:CashRegisterType>' +
    '</m:EnrollCashRegisterRequestElement>';
  const { status, body: xml } = await soapCall('EnrollCashRegister', body);
  const fault = faultOf(xml);
  if (fault) throw new Error('TWINT EnrollCashRegister: ' + fault);
  if (status >= 400) throw new Error('TWINT EnrollCashRegister HTTP ' + status);
  return { ok: true, raw: xml.slice(0, 800) };
}

// Interprétation du statut → 'paid' | 'failed' | 'pending' (à ajuster au test réel)
function interpret(statusValue) {
  const v = String(statusValue || '').toUpperCase();
  if (/SUCCESS|ORDER_OK|CONFIRMED|COMPLETED|OK\b/.test(v)) return 'paid';
  if (/FAIL|CANCEL|ERROR|EXPIRE|ABORT/.test(v)) return 'failed';
  return 'pending';
}

module.exports = { configured, startOrder, monitorOrder, interpret, enrollCashRegister };
