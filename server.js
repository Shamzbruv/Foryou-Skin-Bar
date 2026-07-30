require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {
  EMAIL_TEMPLATE_DEFINITIONS,
  renderEmailTemplate,
  renderEmailSubject,
  templateVariablesFor
} = require('./email-templates');

const app = express();
const PORT = process.env.PORT || 5500;
app.set('trust proxy', 1);

app.use(cors());
// Raw body middleware needed for Fygaro webhook signature verification
app.use((req, res, next) => {
  if (req.path === '/api/fygaro-webhook') {
    const chunks = [];
    req.on('data', chunk => { chunks.push(Buffer.from(chunk)); });
    req.on('end', () => {
      req.rawBody = Buffer.concat(chunks);
      try { req.body = JSON.parse(req.rawBody.toString('utf8')); } catch(e) { req.body = {}; }
      next();
    });
  } else {
    express.json()(req, res, next);
  }
});

// ── Fygaro Helpers ──
const FYGARO_API_KEY    = process.env.FYGARO_API_KEY    || '';
const FYGARO_API_SECRET = process.env.FYGARO_API_SECRET || '';
const FYGARO_BUTTON_URL = process.env.FYGARO_BUTTON_URL || 'https://www.fygaro.com/en/pb/00c0f5ec-24aa-4069-97ce-9495f7798ab4/';
const SERVER_BASE_URL   = (process.env.SERVER_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const RESEND_API_KEY    = process.env.RESEND_API_KEY || '';
const STORE_CONTACT_EMAIL = 'foryouskinbar@gmail.com';
const DEFAULT_FROM_EMAIL = 'For You Skin Bar <noreply@foryouskinbar.com>';
const configuredOwnerEmail = String(process.env.OWNER_EMAIL || '').trim();
const configuredFromEmail = String(process.env.FROM_EMAIL || '').trim();
const configuredReplyEmail = String(process.env.REPLY_TO_EMAIL || '').trim();
const OWNER_EMAIL = !configuredOwnerEmail || /^(?:hello@foryouskinbar\.com|clientemail@example\.com)$/i.test(configuredOwnerEmail)
  ? STORE_CONTACT_EMAIL
  : configuredOwnerEmail;
const FROM_EMAIL = !configuredFromEmail || /(?:hello@foryouskinbar\.com|orders@orders\.foryouskinbar\.com)/i.test(configuredFromEmail)
  ? DEFAULT_FROM_EMAIL
  : configuredFromEmail;
const REPLY_TO_EMAIL = !configuredReplyEmail || /^hello@foryouskinbar\.com$/i.test(configuredReplyEmail)
  ? STORE_CONTACT_EMAIL
  : configuredReplyEmail;
const EMAIL_LOGO_CONTENT_ID = 'foryou-skin-bar-logo';
let emailLogoBase64 = '';

try {
  emailLogoBase64 = fs.readFileSync(path.join(__dirname, 'assets', 'brand', 'logo.png')).toString('base64');
} catch (error) {
  console.warn('[Email] Brand logo could not be loaded for inline delivery:', error.message);
}

const DEFAULT_SHIPPING_RULES = Object.freeze({
  domesticFreeThresholdJmd: 10000,
  internationalFreeThresholdJmd: 20000,
  internationalFlatRateUsd: 37,
  usdToJmdRate: 160,
  zipmailJmd: 500,
  knutsfordJmd: 700,
  bearerJmd: 750,
  bearerPortmoreJmd: 950,
  internationalCarrier: 'DHL',
  autoDetectLocation: true
});

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function parseMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function orderAccessToken(orderNumber) {
  const secret = FYGARO_API_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-order-access-token';
  return crypto.createHmac('sha256', secret).update(String(orderNumber), 'utf8').digest('hex');
}

function verifyOrderAccessToken(orderNumber, token) {
  if (!orderNumber || !token) return false;
  try {
    const expected = Buffer.from(orderAccessToken(orderNumber), 'hex');
    const received = Buffer.from(String(token), 'hex');
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  } catch (_) {
    return false;
  }
}

/**
 * Builds an order-specific Fygaro payment URL. When API credentials are
 * configured, the amount and reference are protected by a signed JWT. Until
 * then, Fygaro's documented URL parameters keep checkout operational and the
 * webhook still verifies the paid amount before confirming an order.
 */
function requestOrigin(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = forwardedHost || req.get('host');
  return host ? `${protocol}://${host}`.replace(/\/+$/, '') : SERVER_BASE_URL;
}

function orderCancellationToken(orderNumber) {
  const secret = FYGARO_API_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-order-access-token';
  return crypto.createHmac('sha256', secret).update(`cancel:${String(orderNumber)}`, 'utf8').digest('hex');
}

function verifyOrderCancellationToken(orderNumber, token) {
  if (!orderNumber || !token) return false;
  try {
    const expected = Buffer.from(orderCancellationToken(orderNumber), 'hex');
    const received = Buffer.from(String(token), 'hex');
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  } catch (_) {
    return false;
  }
}

function cancellationEligibility(order = {}) {
  const orderStatus = String(order.status || '').toLowerCase();
  const fulfillmentStatus = String(order.fulfillment_status || '').toLowerCase();
  const blocked = ['shipped', 'delivered', 'cancelled', 'refunded'].includes(orderStatus)
    || ['shipped', 'delivered', 'picked_up'].includes(fulfillmentStatus);
  return {
    eligible: !blocked,
    reason: blocked
      ? `This order can no longer be cancelled because it is ${order.status || order.fulfillment_status || 'already in fulfilment'}.`
      : ''
  };
}

function maskedEmail(email = '') {
  const [local = '', domain = ''] = String(email).split('@');
  if (!local || !domain) return '';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

function paymentCallbackUrls(origin, orderNumber) {
  const safeOrigin = String(origin || SERVER_BASE_URL).replace(/\/+$/, '');
  const token = orderAccessToken(orderNumber);
  const encodedRef = encodeURIComponent(orderNumber);
  const encodedToken = encodeURIComponent(token);
  return {
    returnUrl: `${safeOrigin}/api/fygaro-return?ref=${encodedRef}&token=${encodedToken}`,
    cancelUrl: `${safeOrigin}/checkout.html?status=cancelled&ref=${encodedRef}`,
    webhookUrl: `${safeOrigin}/api/fygaro-webhook`
  };
}

function buildFygaroPaymentUrl(orderNumber, paymentAmount, currency = 'JMD') {
  const amount = Number(paymentAmount);
  const paymentCurrency = String(currency || 'JMD').toUpperCase() === 'USD' ? 'USD' : 'JMD';
  if (!FYGARO_BUTTON_URL || !orderNumber || !Number.isFinite(amount) || amount <= 0) return null;
  if (!FYGARO_API_SECRET) {
    console.error('[Fygaro] Checkout blocked because FYGARO_API_SECRET is not configured.');
    return null;
  }

  try {
    const paymentUrl = new URL(FYGARO_BUTTON_URL);
    if (FYGARO_API_KEY && FYGARO_API_SECRET) {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = jwt.sign({
        amount: amount.toFixed(2),
        currency: paymentCurrency,
        custom_reference: orderNumber,
        exp: nowSec + 3600,
        nbf: nowSec
      }, FYGARO_API_SECRET, {
        algorithm: 'HS256',
        header: { alg: 'HS256', typ: 'JWT', kid: FYGARO_API_KEY },
      });
      paymentUrl.searchParams.set('jwt', token);
      return { url: paymentUrl.toString(), mode: 'signed_jwt' };
    }

    paymentUrl.searchParams.set('amount', amount.toFixed(2));
    paymentUrl.searchParams.set('currency', paymentCurrency);
    paymentUrl.searchParams.set('client_reference', orderNumber);
    paymentUrl.searchParams.set('client_note', `For You Skin Bar order ${orderNumber}`);
    return { url: paymentUrl.toString(), mode: 'payment_link' };
  } catch (error) {
    console.error('[Fygaro] Invalid payment button URL:', error.message);
    return null;
  }
}

function jamaicaDateStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Jamaica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
  return `${parts.year}${parts.month}${parts.day}`;
}

/**
 * Verifies the Fygaro-Signature header on incoming webhook calls.
 */
function verifyFygaroSignature(rawBody, signatureHeader, keyIdHeader) {
  if (!FYGARO_API_SECRET || !signatureHeader) return false;
  const keyId = String(keyIdHeader || '').trim();
  if (FYGARO_API_KEY && keyId !== FYGARO_API_KEY) return false;

  const parts = String(signatureHeader).split(',').map(part => part.trim()).filter(Boolean);
  let timestamp = '';
  const hashes = [];
  parts.forEach((part) => {
    const index = part.indexOf('=');
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === 't') timestamp = value;
    if (key === 'v1') hashes.push(value);
  });

  if (timestamp && hashes.length) {
    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300) return false;
    const expected = crypto
      .createHmac('sha256', FYGARO_API_SECRET)
      .update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8')]))
      .digest('hex');
    return hashes.some((hash) => {
      try {
        const expectedBuffer = Buffer.from(expected, 'hex');
        const receivedBuffer = Buffer.from(hash, 'hex');
        return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
      } catch (_) {
        return false;
      }
    });
  }

  const legacyHash = String(signatureHeader).replace(/^sha256=/i, '').trim();
  if (!/^[a-f0-9]{64}$/i.test(legacyHash)) return false;
  const expected = crypto.createHmac('sha256', FYGARO_API_SECRET).update(rawBody).digest('hex');
  try {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(legacyHash, 'hex');
    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch (_) {
    return false;
  }
}

// ── API Routes ──
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || 'https://xftnfbeembjrhezvzquu.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '', // Railway provides this via environment variables
  { realtime: { transport: WebSocket } }
);

function numberSetting(value, fallback, min = 0, max = 10000000) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeShippingRules(value) {
  let source = value;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch (_) { source = {}; }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) source = {};
  return {
    domesticFreeThresholdJmd: numberSetting(source.domesticFreeThresholdJmd, DEFAULT_SHIPPING_RULES.domesticFreeThresholdJmd),
    internationalFreeThresholdJmd: numberSetting(source.internationalFreeThresholdJmd, DEFAULT_SHIPPING_RULES.internationalFreeThresholdJmd),
    internationalFlatRateUsd: numberSetting(source.internationalFlatRateUsd, DEFAULT_SHIPPING_RULES.internationalFlatRateUsd, 0, 10000),
    usdToJmdRate: numberSetting(source.usdToJmdRate, DEFAULT_SHIPPING_RULES.usdToJmdRate, 1, 10000),
    zipmailJmd: numberSetting(source.zipmailJmd, DEFAULT_SHIPPING_RULES.zipmailJmd),
    knutsfordJmd: numberSetting(source.knutsfordJmd, DEFAULT_SHIPPING_RULES.knutsfordJmd),
    bearerJmd: numberSetting(source.bearerJmd, DEFAULT_SHIPPING_RULES.bearerJmd),
    bearerPortmoreJmd: numberSetting(source.bearerPortmoreJmd, DEFAULT_SHIPPING_RULES.bearerPortmoreJmd),
    internationalCarrier: String(source.internationalCarrier || DEFAULT_SHIPPING_RULES.internationalCarrier).trim().slice(0, 60) || 'DHL',
    autoDetectLocation: source.autoDetectLocation !== false
  };
}

async function getShippingRules() {
  const { data, error } = await supabaseAdmin
    .from('store_settings')
    .select('value')
    .eq('key', 'shipping_rules')
    .maybeSingle();
  if (error) {
    console.warn('[Shipping] Could not load admin rules:', error.message);
    return { ...DEFAULT_SHIPPING_RULES };
  }
  return normalizeShippingRules(data?.value);
}

function isJamaicaCountry(value) {
  return ['jm', 'jamaica'].includes(String(value || '').trim().toLowerCase());
}

function isPortmoreCity(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .includes('portmore');
}

function requestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || req.ip || '').replace(/^::ffff:/, '');
}

function publicIp(value) {
  const ip = String(value || '').trim();
  if (!ip || ip === '::1' || ip === '127.0.0.1') return '';
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) return '';
  return ip;
}

async function detectCountryCode(req, allowLookup = true) {
  const headerCountry = String(
    req.headers['cf-ipcountry'] ||
    req.headers['x-vercel-ip-country'] ||
    req.headers['cloudfront-viewer-country'] ||
    req.headers['x-country-code'] || ''
  ).trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(headerCountry) && headerCountry !== 'XX') return headerCountry;

  const timezone = String(req.headers['x-client-timezone'] || '').trim();
  if (!publicIp(requestIp(req))) return timezone === 'America/Jamaica' ? 'JM' : 'JM';
  if (!allowLookup) return 'JM';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1600);
  try {
    const response = await fetch(`https://api.country.is/${encodeURIComponent(publicIp(requestIp(req)))}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) return 'JM';
    const data = await response.json();
    return /^[A-Z]{2}$/.test(String(data.country || '').toUpperCase()) ? String(data.country).toUpperCase() : 'JM';
  } catch (_) {
    return 'JM';
  } finally {
    clearTimeout(timeout);
  }
}

function countryName(countryCode) {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode; }
  catch (_) { return countryCode === 'JM' ? 'Jamaica' : countryCode; }
}

function formatPaymentAmount(amount, currency = 'JMD') {
  const paymentCurrency = String(currency || 'JMD').toUpperCase();
  if (paymentCurrency !== 'USD') return `J$${Math.round(Number(amount) || 0).toLocaleString('en-US')}`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(Number(amount) || 0).replace('$', 'US$');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function emailPlainText(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const emailTemplateCache = new Map();
const EMAIL_TEMPLATE_CACHE_MS = 60 * 1000;

function baseTemplateVariables(recipient = '') {
  return {
    recipient_email: String(recipient || '').trim().toLowerCase(),
    site_url: SERVER_BASE_URL,
    shop_url: `${SERVER_BASE_URL}/shop.html`,
    contact_url: `${SERVER_BASE_URL}/contact.html`,
    policy_url: `${SERVER_BASE_URL}/policies.html`,
    current_year: String(new Date().getFullYear())
  };
}

function assertSafeEmailTemplate(subjectTemplate, bodyHtml) {
  const subject = String(subjectTemplate || '').replace(/[\r\n]+/g, ' ').trim();
  const body = String(bodyHtml || '').trim();
  if (!subject) throw new Error('Email subject is required.');
  if (subject.length > 300) throw new Error('Email subject must be 300 characters or fewer.');
  if (!body) throw new Error('Email body is required.');
  if (body.length > 100000) throw new Error('Email body is too large.');
  if (/<\/?(?:script|iframe|object|embed|form|input|button|textarea|select)\b/i.test(body)) {
    throw new Error('Scripts, forms, and embedded frames are not allowed in email templates.');
  }
  if (/\son[a-z]+\s*=/i.test(body) || /javascript\s*:/i.test(body)) {
    throw new Error('Unsafe event handlers or JavaScript links are not allowed.');
  }
  return { subject, body };
}

async function storedEmailTemplate(templateKey) {
  const cached = emailTemplateCache.get(templateKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const { data, error } = await supabaseAdmin
    .from('email_templates')
    .select('template_key,subject_template,body_html,updated_at')
    .eq('template_key', templateKey)
    .maybeSingle();
  if (error) {
    if (!['42P01', 'PGRST205'].includes(error.code)) {
      console.warn(`[Email Templates] Could not load ${templateKey}:`, error.message);
    }
    return null;
  }
  emailTemplateCache.set(templateKey, { value: data || null, expiresAt: Date.now() + EMAIL_TEMPLATE_CACHE_MS });
  return data || null;
}

async function resolveEmailContent(templateKey, fallbackSubject, fallbackBody, variables = {}) {
  const definition = EMAIL_TEMPLATE_DEFINITIONS[templateKey];
  if (!definition) return { subject: fallbackSubject, html: fallbackBody, customized: false };

  const stored = await storedEmailTemplate(templateKey);
  if (!stored) return { subject: fallbackSubject, html: fallbackBody, customized: false };
  const values = {
    ...variables,
    default_subject: fallbackSubject,
    default_body: fallbackBody
  };
  const subject = renderEmailSubject(stored.subject_template || fallbackSubject, values) || fallbackSubject;
  const html = renderEmailTemplate(stored.body_html || fallbackBody, values) || fallbackBody;
  return { subject, html, customized: true };
}

async function ensureEmailTemplateRows() {
  const { data: existing, error: readError } = await supabaseAdmin
    .from('email_templates')
    .select('template_key,name,category,audience,description,subject_template,body_html,updated_at');
  if (readError) throw readError;

  const existingKeys = new Set((existing || []).map((row) => row.template_key));
  const missingRows = Object.entries(EMAIL_TEMPLATE_DEFINITIONS)
    .filter(([templateKey]) => !existingKeys.has(templateKey))
    .map(([templateKey, definition]) => ({
      template_key: templateKey,
      name: definition.name,
      category: definition.category,
      audience: definition.audience,
      description: definition.description,
      subject_template: definition.defaultSubject,
      body_html: definition.defaultBody
    }));
  if (missingRows.length) {
    const { error: insertError } = await supabaseAdmin.from('email_templates').insert(missingRows);
    if (insertError) throw insertError;
    emailTemplateCache.clear();
  }

  if (!missingRows.length) return existing || [];
  const { data: allRows, error: reloadError } = await supabaseAdmin
    .from('email_templates')
    .select('template_key,name,category,audience,description,subject_template,body_html,updated_at');
  if (reloadError) throw reloadError;
  return allRows || [];
}

function brandedEmailHtml(subject, bodyHtml, emailType = '') {
  const isNewsletter = ['newsletter_welcome', 'newsletter_broadcast', 'blog_published'].includes(emailType);
  const preheader = isNewsletter
    ? 'Glow Letters from For You Skin Bar'
    : 'An update from For You Skin Bar';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4efe7;color:#2c211b;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4efe7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffdf9;border:1px solid #e6d5b4;">
        <tr><td style="padding:24px 30px 18px;border-bottom:3px solid #c89b3c;text-align:center;">
          <a href="${escapeHtml(SERVER_BASE_URL)}" style="text-decoration:none;color:#2c211b;">
            <img src="${emailLogoBase64 ? `cid:${EMAIL_LOGO_CONTENT_ID}` : `${escapeHtml(SERVER_BASE_URL)}/assets/brand/logo.png`}" width="178" alt="For You Skin Bar" style="display:block;width:178px;max-width:70%;height:auto;margin:0 auto;">
          </a>
        </td></tr>
        <tr><td style="padding:34px 34px 18px;">
          <p style="margin:0 0 10px;color:#a97618;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Made for your skin</p>
          <h1 style="margin:0 0 22px;color:#201915;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.18;font-weight:600;">${escapeHtml(subject)}</h1>
          <div style="color:#4f433a;font-size:16px;line-height:1.7;">${bodyHtml}</div>
        </td></tr>
        <tr><td style="padding:22px 34px 32px;">
          <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#344633;">
            <a href="${escapeHtml(SERVER_BASE_URL)}/shop.html" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">Visit For You Skin Bar</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:24px 34px;background:#201d1a;color:#e8ddcb;text-align:center;font-size:12px;line-height:1.7;">
          <strong style="color:#e1bd67;">Pure ingredients. Thoughtfully made. Beautifully you.</strong><br>
          Handmade in Jamaica &nbsp;|&nbsp; <a href="${escapeHtml(SERVER_BASE_URL)}/contact.html" style="color:#ffffff;">Contact us</a> &nbsp;|&nbsp; <a href="${escapeHtml(SERVER_BASE_URL)}/policies.html" style="color:#ffffff;">Store policies</a>
          ${isNewsletter ? '<br>You received this because you subscribed to Glow Letters. Reply with "unsubscribe" to opt out.' : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function deliverEmailLog(logId, message) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `foryou-email-${logId}`
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: message.recipient,
        reply_to: REPLY_TO_EMAIL,
        subject: message.subject,
        html: message.html,
        text: emailPlainText(message.html),
        ...(emailLogoBase64 ? {
          attachments: [{
            content: emailLogoBase64,
            filename: 'foryou-skin-bar-logo.png',
            content_id: EMAIL_LOGO_CONTENT_ID
          }]
        } : {})
      })
    });
    const responseBody = await response.json().catch(async () => ({ message: await response.text().catch(() => '') }));
    await supabaseAdmin.from('email_logs').update({
      status: response.ok ? 'sent' : 'error',
      resend_email_id: responseBody?.id || null,
      error_message: response.ok ? null : JSON.stringify(responseBody),
      updated_at: new Date().toISOString()
    }).eq('id', logId);
    return { sent: response.ok, error: response.ok ? null : responseBody };
  } catch (error) {
    await supabaseAdmin.from('email_logs').update({
      status: 'error',
      error_message: error.message || String(error),
      updated_at: new Date().toISOString()
    }).eq('id', logId);
    return { sent: false, error: error.message || String(error) };
  }
}

async function queueEmail({ orderId = null, recipient, emailType, subject, html, metadata = {}, templateVariables = {}, templateKey = emailType, scheduledFor = null }) {
  const normalizedRecipient = String(recipient || '').trim().toLowerCase();
  if (!isValidEmail(normalizedRecipient)) return { queued: false, sent: false, error: 'Invalid recipient' };

  const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
  const isScheduled = scheduledDate && Number.isFinite(scheduledDate.getTime()) && scheduledDate.getTime() > Date.now();
  const initialStatus = isScheduled ? 'scheduled' : (RESEND_API_KEY ? 'queued' : 'pending_resend_setup');
  const orderNumber = String(templateVariables.order_number || metadata.order_number || '').trim();
  const cancellationUrl = orderNumber
    ? `${SERVER_BASE_URL}/cancel-order.html?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(orderCancellationToken(orderNumber))}`
    : '';
  const cancellationAction = cancellationUrl ? `
    <div style="margin:22px 0;padding:16px;border-left:4px solid #c89b3c;background:#f8f3e9;color:#4f433a;line-height:1.7;">
      <strong style="color:#2c211b;">Need to change this order?</strong><br>
      <a href="${escapeHtml(cancellationUrl)}" style="color:#344633;font-weight:700;">Request an order cancellation</a>. Requests are reviewed before an order is cancelled.
    </div>` : '';
  const variables = {
    ...baseTemplateVariables(normalizedRecipient),
    cancellation_url: cancellationUrl,
    cancellation_action: cancellationAction,
    ...templateVariables
  };
  const resolved = templateKey
    ? await resolveEmailContent(templateKey, subject, html, variables)
    : { subject, html, customized: false };
  const decoratedHtml = brandedEmailHtml(resolved.subject, resolved.html, templateKey || emailType);
  const { data: log, error: logError } = await supabaseAdmin.from('email_logs').insert({
    order_id: orderId,
    recipient: normalizedRecipient,
    email_type: emailType,
    subject: resolved.subject,
    html_body: decoratedHtml,
    metadata: { ...metadata, template_key: templateKey || null, template_customized: resolved.customized },
    scheduled_for: isScheduled ? scheduledDate.toISOString() : null,
    status: initialStatus,
    error_message: RESEND_API_KEY ? null : 'RESEND_API_KEY missing'
  }).select('id').single();

  if (logError) {
    console.error('[Email Outbox] Could not queue email:', logError.message);
    return { queued: false, sent: false, error: logError.message };
  }
  if (isScheduled) return { queued: true, sent: false, scheduled: true };
  if (!RESEND_API_KEY) return { queued: true, sent: false, pendingSetup: true };

  const result = await deliverEmailLog(log.id, { recipient: normalizedRecipient, subject: resolved.subject, html: decoratedHtml });
  return { queued: true, ...result };
}

function normalizeTrackingWebAddress(value = '') {
  let webAddress = String(value || '').trim();
  if (!webAddress) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(webAddress)) webAddress = `https://${webAddress}`;

  let parsed;
  try {
    parsed = new URL(webAddress);
  } catch (_) {
    throw Object.assign(new Error('Enter a valid tracking web address.'), { status: 400 });
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw Object.assign(new Error('The tracking web address must be a safe HTTP or HTTPS link.'), { status: 400 });
  }
  return parsed.toString();
}

function shipmentTrackingDetailsHtml(order = {}) {
  const carrier = String(order.tracking_carrier || '').trim();
  const trackingNumber = String(order.tracking_number || '').trim();
  const trackingUrl = normalizeTrackingWebAddress(order.tracking_url || '');
  if (!carrier && !trackingNumber && !trackingUrl) return '';

  const detailRows = [
    carrier ? `<strong>Carrier:</strong> ${escapeHtml(carrier)}` : '',
    trackingNumber ? `<strong>Tracking number:</strong> ${escapeHtml(trackingNumber)}` : '',
    trackingUrl ? `<strong>Tracking web address:</strong> <a href="${escapeHtml(trackingUrl)}" style="color:#344633;word-break:break-all;">${escapeHtml(trackingUrl)}</a>` : ''
  ].filter(Boolean).join('<br>');
  const trackingButton = trackingUrl ? `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:16px;"><tr><td style="background:#344633;">
      <a href="${escapeHtml(trackingUrl)}" style="display:inline-block;padding:11px 18px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">Track your shipment</a>
    </td></tr></table>` : '';

  return `
    <div style="margin:22px 0;padding:18px;border:1px solid #dfc98f;border-left:4px solid #c89b3c;background:#fffaf0;">
      <strong style="font-size:17px;color:#2c211b;">Shipment tracking</strong>
      <p style="margin:10px 0 0;color:#4f433a;line-height:1.7;">${detailRows}</p>
      ${trackingButton}
    </div>`;
}

async function sendShippingUpdateEmail(orderId, { allowResend = false } = {}) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id,order_number,status,delivery_service,shipping_address,tracking_carrier,tracking_number,tracking_url,customers(full_name,email),order_items(product_name,quantity)')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw Object.assign(new Error('Order not found.'), { status: 404 });
  if (!order.customers?.email) return { status: 'no_customer_email', order };

  if (!allowResend) {
    const { data: existingNotice, error: noticeError } = await supabaseAdmin
      .from('email_logs')
      .select('id')
      .eq('order_id', orderId)
      .eq('email_type', 'shipping_update')
      .in('status', ['queued', 'scheduled', 'sent'])
      .limit(1)
      .maybeSingle();
    if (noticeError) throw noticeError;
    if (existingNotice) return { status: 'already_sent', order };
  }

  const itemRows = (order.order_items || []).map((item) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #eee5d6;">${escapeHtml(item.product_name)}</td><td align="right" style="padding:10px 0;border-bottom:1px solid #eee5d6;">Qty ${escapeHtml(item.quantity)}</td></tr>`
  ).join('');
  const itemsHtml = itemRows
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;">${itemRows}</table>`
    : '';
  const trackingDetails = shipmentTrackingDetailsHtml(order);
  const result = await queueEmail({
    orderId,
    recipient: order.customers.email,
    emailType: 'shipping_update',
    subject: `Your For You Skin Bar order ${order.order_number} is on the way`,
    html: `
      <p>Hi ${escapeHtml(order.customers.full_name || 'there')},</p>
      <p>Your order has been prepared and is now <strong>on the way</strong>.</p>
      <div style="margin:22px 0;padding:18px;border-left:4px solid #c89b3c;background:#f8f3e9;">
        <strong>Order:</strong> ${escapeHtml(order.order_number)}<br>
        <strong>Delivery method:</strong> ${escapeHtml(order.delivery_service || 'Delivery')}<br>
        <strong>Delivery address:</strong> ${escapeHtml(order.shipping_address || 'Address on order')}
      </div>
      ${trackingDetails}
      ${itemsHtml}
      <p>Please keep your phone available in case the delivery provider needs to contact you. We will update the order record once delivery is complete.</p>
    `,
    metadata: {
      order_number: order.order_number,
      status: 'shipped',
      tracking_carrier: order.tracking_carrier || null,
      tracking_number: order.tracking_number || null,
      tracking_url: order.tracking_url || null,
      tracking_update: allowResend
    },
    templateVariables: {
      customer_name: order.customers.full_name || 'there',
      order_number: order.order_number,
      delivery_method: order.delivery_service || 'Delivery',
      shipping_address: order.shipping_address || 'Address on order',
      tracking_carrier: order.tracking_carrier || '',
      tracking_number: order.tracking_number || '',
      tracking_url: order.tracking_url || '',
      tracking_details: trackingDetails,
      items_html: itemsHtml
    }
  });
  return { status: result.sent ? 'sent' : (result.queued ? 'queued' : 'failed'), order };
}

async function processPendingEmails(limit = 50) {
  if (!RESEND_API_KEY) return;
  const { data: pending, error } = await supabaseAdmin
    .from('email_logs')
    .select('id,recipient,subject,html_body')
    .in('status', ['queued', 'scheduled'])
    .not('subject', 'is', null)
    .not('html_body', 'is', null)
    .or(`scheduled_for.is.null,scheduled_for.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[Email Outbox] Could not load pending messages:', error.message);
    return;
  }
  for (const message of pending || []) {
    await supabaseAdmin.from('email_logs').update({ status: 'queued', updated_at: new Date().toISOString() }).eq('id', message.id);
    await deliverEmailLog(message.id, {
      recipient: message.recipient,
      subject: message.subject,
      html: message.html_body
    });
  }
}

async function materializePaidCheckoutSession(session) {
  const shipping = session.shipping_data || {};
  const cart = Array.isArray(session.cart_data) ? session.cart_data : [];
  if (!cart.length) throw new Error('Paid checkout session has no items.');

  const { data: order, error: orderError } = await supabaseAdmin.from('orders').insert({
    order_number: session.checkout_reference,
    customer_id: session.customer_id,
    country: shipping.country,
    address_line_1: shipping.addressLine1,
    address_line_2: shipping.addressLine2,
    city: shipping.city,
    parish: shipping.parish,
    state_province: shipping.stateProvince,
    postal_code: shipping.postalCode,
    shipping_address: shipping.formattedAddress,
    delivery_method: shipping.deliveryMethod,
    delivery_service: shipping.deliveryService,
    customer_notes: shipping.notes,
    subtotal_jmd: session.subtotal_jmd,
    discount_code: session.discount_code,
    discount_total_jmd: session.discount_total_jmd,
    shipping_total_jmd: session.shipping_total_jmd,
    grand_total_jmd: session.grand_total_jmd,
    payment_currency: session.payment_currency || 'JMD',
    payment_amount: session.payment_amount || session.grand_total_jmd,
    exchange_rate_jmd_per_usd: session.exchange_rate_jmd_per_usd || null,
    customer_region: session.customer_region || (isJamaicaCountry(shipping.country) ? 'domestic' : 'international'),
    points_earned: session.points_earned,
    payment_method: 'Fygaro',
    status: 'pending',
    payment_status: 'awaiting_confirmation',
    fulfillment_status: 'unfulfilled'
  }).select('id,order_number,status,payment_status,grand_total_jmd,payment_currency,payment_amount,customer_id,delivery_service,admin_notes').single();
  if (orderError) throw orderError;

  const orderItems = cart.map((item) => ({
    order_id: order.id,
    product_id: item.productId,
    variant_id: item.variantId || null,
    variant_name: item.variantName || null,
    product_name: item.name,
    unit_price_jmd: item.price,
    quantity: item.quantity,
    line_total_jmd: item.price * item.quantity
  }));
  const { error: itemsError } = await supabaseAdmin.from('order_items').insert(orderItems);
  if (itemsError) {
    await supabaseAdmin.from('orders').delete().eq('id', order.id);
    throw itemsError;
  }

  if (session.discount_code) {
    const { data: discount } = await supabaseAdmin
      .from('discount_codes')
      .select('id,used_count')
      .eq('code', session.discount_code)
      .maybeSingle();
    if (discount) {
      await supabaseAdmin.from('discount_codes')
        .update({ used_count: (Number(discount.used_count) || 0) + 1 })
        .eq('id', discount.id);
    }
  }

  return order;
}

async function reconcileCheckoutSessionPayment(orderRef, paymentReference, source = 'admin') {
  const { data: reusedPayment, error: reusedPaymentError } = await supabaseAdmin
    .from('payment_checkout_sessions')
    .select('checkout_reference')
    .eq('fygaro_transaction_id', paymentReference)
    .neq('checkout_reference', orderRef)
    .maybeSingle();
  if (reusedPaymentError) throw reusedPaymentError;
  if (reusedPayment) {
    const error = new Error(`This Fygaro reference is already linked to ${reusedPayment.checkout_reference}.`);
    error.status = 409;
    throw error;
  }

  const { data: checkoutSession, error: sessionError } = await supabaseAdmin
    .from('payment_checkout_sessions')
    .select('*')
    .eq('checkout_reference', orderRef)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!checkoutSession) {
    const error = new Error('Saved checkout session was not found.');
    error.status = 404;
    throw error;
  }

  const { data: existingOrder, error: orderFetchError } = await supabaseAdmin
    .from('orders')
    .select('id,order_number,status,payment_status,grand_total_jmd,payment_currency,payment_amount,customer_id,delivery_service,admin_notes')
    .eq('order_number', orderRef)
    .maybeSingle();
  if (orderFetchError) throw orderFetchError;

  let order = existingOrder;
  if (!order) order = await materializePaidCheckoutSession(checkoutSession);

  if (order.payment_status !== 'paid') {
    const paymentNote = [
      `[Fygaro Payment Confirmed - ${source === 'webhook' ? 'Webhook' : 'Admin Reconciliation'}]`,
      `Reference: ${paymentReference}`,
      `Recorded: ${new Date().toISOString()}`
    ].join(' ');
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'paid',
        payment_method: 'Fygaro',
        status: order.status === 'pending' ? 'confirmed' : order.status,
        admin_notes: order.admin_notes ? `${paymentNote}\n\n${order.admin_notes}` : paymentNote,
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id)
      .select('id,order_number,status,payment_status,grand_total_jmd,payment_currency,payment_amount,customer_id,delivery_service,admin_notes')
      .single();
    if (updateError) throw updateError;
    order = updatedOrder;
  }

  const { error: checkoutUpdateError } = await supabaseAdmin
    .from('payment_checkout_sessions')
    .update({
      status: 'paid',
      order_id: order.id,
      fygaro_transaction_id: paymentReference,
      updated_at: new Date().toISOString()
    })
    .eq('id', checkoutSession.id);
  if (checkoutUpdateError) throw checkoutUpdateError;

  return order;
}

async function requireAdmin(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    const error = new Error('Admin authentication is required.');
    error.status = 401;
    throw error;
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    const error = new Error('Invalid admin session.');
    error.status = 401;
    throw error;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || !profile || !['owner', 'admin', 'staff'].includes(profile.role)) {
    const error = new Error('Admin privileges are required.');
    error.status = 403;
    throw error;
  }

  return userData.user;
}

// ── API Routes ──

app.get('/api/admin/email-templates', async (req, res) => {
  try {
    await requireAdmin(req);
    const rows = await ensureEmailTemplateRows();
    const byKey = new Map(rows.map((row) => [row.template_key, row]));
    const templates = Object.entries(EMAIL_TEMPLATE_DEFINITIONS).map(([templateKey, definition]) => {
      const row = byKey.get(templateKey);
      return {
        template_key: templateKey,
        name: definition.name,
        category: definition.category,
        audience: definition.audience,
        description: definition.description,
        subject_template: row?.subject_template || definition.defaultSubject,
        body_html: row?.body_html || definition.defaultBody,
        updated_at: row?.updated_at || null,
        variables: templateVariablesFor(definition).map((variable) => ({
          ...variable,
          token: variable.html ? `{{{${variable.key}}}}` : `{{${variable.key}}}`
        }))
      };
    });
    return res.status(200).json({ templates });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Unable to load email templates.' });
  }
});

app.put('/api/admin/email-templates/:templateKey', async (req, res) => {
  try {
    const user = await requireAdmin(req);
    const templateKey = String(req.params.templateKey || '').trim();
    const definition = EMAIL_TEMPLATE_DEFINITIONS[templateKey];
    if (!definition) return res.status(404).json({ error: 'Email template not found.' });
    const template = assertSafeEmailTemplate(req.body?.subject_template, req.body?.body_html);
    const { data, error } = await supabaseAdmin.from('email_templates').upsert({
      template_key: templateKey,
      name: definition.name,
      category: definition.category,
      audience: definition.audience,
      description: definition.description,
      subject_template: template.subject,
      body_html: template.body,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'template_key' }).select('template_key,subject_template,body_html,updated_at').single();
    if (error) throw error;
    emailTemplateCache.delete(templateKey);
    return res.status(200).json({ success: true, template: data });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || 'Unable to save this email template.' });
  }
});

app.post('/api/admin/email-templates/:templateKey/reset', async (req, res) => {
  try {
    const user = await requireAdmin(req);
    const templateKey = String(req.params.templateKey || '').trim();
    const definition = EMAIL_TEMPLATE_DEFINITIONS[templateKey];
    if (!definition) return res.status(404).json({ error: 'Email template not found.' });
    const { data, error } = await supabaseAdmin.from('email_templates').upsert({
      template_key: templateKey,
      name: definition.name,
      category: definition.category,
      audience: definition.audience,
      description: definition.description,
      subject_template: definition.defaultSubject,
      body_html: definition.defaultBody,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'template_key' }).select('template_key,subject_template,body_html,updated_at').single();
    if (error) throw error;
    emailTemplateCache.delete(templateKey);
    return res.status(200).json({ success: true, template: data });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || 'Unable to reset this email template.' });
  }
});

app.post('/api/admin/email-templates/:templateKey/preview', async (req, res) => {
  try {
    await requireAdmin(req);
    const templateKey = String(req.params.templateKey || '').trim();
    const definition = EMAIL_TEMPLATE_DEFINITIONS[templateKey];
    if (!definition) return res.status(404).json({ error: 'Email template not found.' });
    const template = assertSafeEmailTemplate(req.body?.subject_template, req.body?.body_html);
    const variables = { ...baseTemplateVariables('preview@example.com'), ...definition.sampleVariables };
    const subject = renderEmailSubject(template.subject, variables);
    const body = renderEmailTemplate(template.body, variables);
    const html = brandedEmailHtml(subject, body, templateKey)
      .replace(`cid:${EMAIL_LOGO_CONTENT_ID}`, '/assets/brand/logo.png');
    return res.status(200).json({ subject, html });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || 'Unable to preview this email template.' });
  }
});

app.post('/api/admin/email-templates/:templateKey/test', async (req, res) => {
  try {
    await requireAdmin(req);
    const templateKey = String(req.params.templateKey || '').trim();
    const definition = EMAIL_TEMPLATE_DEFINITIONS[templateKey];
    if (!definition) return res.status(404).json({ error: 'Email template not found.' });
    const recipient = String(req.body?.recipient || '').trim().toLowerCase();
    if (!isValidEmail(recipient)) return res.status(400).json({ error: 'Enter a valid test email address.' });
    const template = assertSafeEmailTemplate(req.body?.subject_template, req.body?.body_html);
    const variables = { ...baseTemplateVariables(recipient), ...definition.sampleVariables };
    const subject = renderEmailSubject(template.subject, variables);
    const body = renderEmailTemplate(template.body, variables);
    const result = await queueEmail({
      recipient,
      emailType: `template_test_${templateKey}`,
      templateKey: null,
      subject: `[TEST] ${subject}`,
      html: body,
      metadata: { template_test: true, source_template_key: templateKey }
    });
    if (!result.queued && !result.sent) throw new Error(String(result.error || 'The test email could not be queued.'));
    return res.status(result.sent ? 200 : 202).json({
      success: true,
      email_status: result.sent ? 'sent' : 'queued',
      recipient
    });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || 'Unable to send the test email.' });
  }
});

app.get('/api/storefront-config', async (req, res) => {
  try {
    const shipping = await getShippingRules();
    const countryCode = await detectCountryCode(req, shipping.autoDetectLocation);
    const isInternational = countryCode !== 'JM';
    res.set('Cache-Control', 'private, max-age=300');
    return res.status(200).json({
      detectedCountryCode: countryCode,
      detectedCountry: countryName(countryCode),
      isInternational,
      displayCurrency: isInternational ? 'USD' : 'JMD',
      shipping
    });
  } catch (_) {
    return res.status(200).json({
      detectedCountryCode: 'JM',
      detectedCountry: 'Jamaica',
      isInternational: false,
      displayCurrency: 'JMD',
      shipping: { ...DEFAULT_SHIPPING_RULES }
    });
  }
});

app.post('/api/validate-discount', async (req, res) => {
  try {
    const { code, subtotal } = req.body;
    if (!code) throw new Error('Code is required');

    const { data: discountData, error } = await supabaseAdmin
      .from('discount_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('active', true)
      .single();

    if (error) {
      console.error('Supabase Error:', error);
      throw new Error(`Database error: ${error.message} (Check Railway environment variables)`);
    }

    if (!discountData) {
      throw new Error('Invalid or inactive discount code');
    }

    const now = new Date();
    const startsAt = discountData.starts_at ? new Date(discountData.starts_at) : null;
    const endsAt = discountData.ends_at ? new Date(discountData.ends_at) : null;

    if (discountData.usage_limit && discountData.used_count >= discountData.usage_limit) {
      throw new Error('Discount code has reached its usage limit');
    }
    if (startsAt && startsAt > now) {
      throw new Error('Discount code is not active yet');
    }
    if (endsAt && endsAt < now) {
      throw new Error('Discount code has expired');
    }
    if (discountData.minimum_subtotal && (subtotal || 0) < discountData.minimum_subtotal) {
      throw new Error(`This code requires a minimum order of J$${discountData.minimum_subtotal.toLocaleString()}`);
    }

    let discountAmount = 0;
    if (['percent', 'percentage'].includes(discountData.discount_type)) {
      discountAmount = (subtotal || 0) * (Number(discountData.discount_value) / 100);
    } else {
      discountAmount = Number(discountData.discount_value);
    }
    if (subtotal && discountAmount > subtotal) discountAmount = subtotal;

    res.status(200).json({
      valid: true,
      code: discountData.code,
      discountType: discountData.discount_type,
      discountValue: Number(discountData.discount_value),
      discountAmount: discountAmount
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const source = String(req.body?.source || 'website').trim().slice(0, 80);
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });

    const { data: existingSubscriber } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('email,is_active')
      .eq('email', email)
      .maybeSingle();

    const { error } = await supabaseAdmin.from('newsletter_subscribers').upsert({
      email,
      source,
      is_active: true
    }, { onConflict: 'email' });
    if (error) throw error;

    if (existingSubscriber?.is_active) {
      return res.status(200).json({ success: true, email_status: 'already_subscribed' });
    }

    const welcomeHtml = `
      <p>Welcome to Glow Letters.</p>
      <p>You are now subscribed to skincare guidance, product updates, new articles, and occasional offers from For You Skin Bar.</p>
      <p>Thank you for joining us.</p>
      <hr>
      <p style="font-size:12px;color:#666;">To unsubscribe, reply to this email with "unsubscribe".</p>
    `;
    const emailResult = await queueEmail({
      recipient: email,
      emailType: 'newsletter_welcome',
      subject: 'Welcome to Glow Letters',
      html: welcomeHtml,
      metadata: { source },
      templateVariables: { signup_source: source }
    });

    return res.status(201).json({
      success: true,
      email_status: emailResult.sent ? 'sent' : (emailResult.queued ? 'queued' : 'not_queued')
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/newsletter/send', async (req, res) => {
  try {
    await requireAdmin(req);
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();
    if (!subject) throw new Error('Subject is required.');
    if (!message) throw new Error('Message is required.');

    const { data: subscribers, error: subscribersError } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('email')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (subscribersError) throw subscribersError;

    const uniqueEmails = [...new Set((subscribers || [])
      .map((row) => String(row.email || '').trim().toLowerCase())
      .filter(isValidEmail))];
    if (uniqueEmails.length === 0) {
      return res.status(200).json({ success: true, sent: 0, queued: 0, failed: 0, message: 'No active subscribers found.' });
    }

    const htmlMessage = escapeHtml(message)
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('');
    const html = `${htmlMessage}<hr><p style="font-size:12px;color:#666;">You are receiving this email because you subscribed to Glow Letters from For You Skin Bar. To unsubscribe, reply to this email with "unsubscribe".</p>`;

    let sent = 0;
    let queued = 0;
    const failures = [];
    for (const email of uniqueEmails) {
      const result = await queueEmail({
        recipient: email,
        emailType: 'newsletter_broadcast',
        subject,
        html,
        templateVariables: { broadcast_subject: subject, message_html: htmlMessage }
      });
      if (result.sent) sent += 1;
      else if (result.queued) queued += 1;
      else failures.push({ email, error: result.error });
    }

    return res.status(failures.length ? 207 : (RESEND_API_KEY ? 200 : 202)).json({
      success: failures.length === 0,
      sent,
      queued,
      failed: failures.length,
      resend_configured: !!RESEND_API_KEY,
      failures: failures.slice(0, 10)
    });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
});

app.post('/api/blogs/:postId/notify-subscribers', async (req, res) => {
  try {
    await requireAdmin(req);
    const { data: post, error: postError } = await supabaseAdmin
      .from('blog_posts')
      .select('id,title,slug,excerpt,status,published_at,newsletter_notified_at')
      .eq('id', req.params.postId)
      .maybeSingle();
    if (postError || !post) return res.status(404).json({ error: 'Blog post not found.' });
    if (post.status !== 'published') return res.status(400).json({ error: 'Only published posts can notify subscribers.' });
    if (post.newsletter_notified_at) {
      return res.status(200).json({ success: true, already_notified: true, sent: 0, queued: 0 });
    }
    const publishTime = post.published_at ? new Date(post.published_at) : null;
    const scheduledFor = publishTime && publishTime.getTime() > Date.now() ? publishTime.toISOString() : null;

    const { data: subscribers, error: subscribersError } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('email')
      .eq('is_active', true);
    if (subscribersError) throw subscribersError;

    const emails = [...new Set((subscribers || []).map((row) => String(row.email || '').trim().toLowerCase()).filter(isValidEmail))];
    const articleUrl = `${SERVER_BASE_URL}/blog-post.html?slug=${encodeURIComponent(post.slug)}`;
    const html = `
      <p>A new article is now available from For You Skin Bar.</p>
      <h2>${escapeHtml(post.title)}</h2>
      ${post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : ''}
      <p><a href="${escapeHtml(articleUrl)}">Read the article</a></p>
      <hr>
      <p style="font-size:12px;color:#666;">You are receiving this email because you subscribed to Glow Letters. To unsubscribe, reply with "unsubscribe".</p>
    `;
    let sent = 0;
    let queued = 0;
    const failures = [];
    for (const email of emails) {
      const result = await queueEmail({
        recipient: email,
        emailType: 'blog_published',
        subject: `New from For You Skin Bar: ${post.title}`,
        html,
        metadata: { post_id: post.id, slug: post.slug },
        templateVariables: {
          post_title: post.title,
          post_excerpt: post.excerpt || '',
          article_url: articleUrl
        },
        scheduledFor
      });
      if (result.sent) sent += 1;
      else if (result.queued) queued += 1;
      else failures.push({ email, error: result.error });
    }
    if (failures.length === 0) {
      await supabaseAdmin.from('blog_posts').update({ newsletter_notified_at: new Date().toISOString() }).eq('id', post.id);
    }
    return res.status(failures.length ? 207 : (RESEND_API_KEY ? 200 : 202)).json({
      success: failures.length === 0,
      sent,
      queued,
      failed: failures.length,
      resend_configured: !!RESEND_API_KEY,
      scheduled_for: scheduledFor
    });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
});

app.post('/api/create-order', async (req, res) => {
  try {
    const payload = req.body;
    const { customer, shipping, cart, discountCode, termsAccepted, newsletterOptIn } = payload;

    if (!customer || !shipping || !cart || cart.length === 0) {
      throw new Error('Invalid order payload');
    }
    if (termsAccepted !== true) {
      throw new Error('You must read and accept the Terms and Conditions before placing an order.');
    }

    let subtotal = 0;
    const validatedCart = [];
    for (const item of cart) {
      let realPrice = 0;
      let name = item.name;
      let variantId = item.variantId || null;
      let variantName = item.variantName || null;

      if (variantId) {
        const { data: variantData } = await supabaseAdmin
          .from('product_variants')
          .select('id, price_jmd, name, products(name)')
          .eq('id', variantId)
          .maybeSingle();

        if (variantData) {
          realPrice = Number(variantData.price_jmd) || 0;
          name = `${variantData.products.name} - ${variantData.name}`;
          variantName = variantData.name;
        } else {
          throw new Error(`Invalid variant ID in cart: ${item.name}`);
        }
      } else if (variantName) {
        const { data: variantData } = await supabaseAdmin
          .from('product_variants')
          .select('id, price_jmd, name, products(name)')
          .eq('product_id', item.productId)
          .eq('name', variantName)
          .maybeSingle();

        if (variantData) {
          realPrice = Number(variantData.price_jmd) || 0;
          name = `${variantData.products.name} - ${variantData.name}`;
          variantId = variantData.id;
        } else {
          throw new Error(`Invalid variant name in cart: ${item.name}`);
        }
      } else {
        const { data: productData } = await supabaseAdmin
          .from('products')
          .select('price_jmd, name')
          .eq('id', item.productId)
          .maybeSingle();

        if (productData) {
          realPrice = Number(productData.price_jmd) || 0;
          name = productData.name;
        } else {
          throw new Error(`Invalid item in cart: ${item.name}`);
        }
      }

      subtotal += (realPrice * item.quantity);
      validatedCart.push({
        ...item,
        price: realPrice,
        name: name,
        variantId: variantId,
        variantName: variantName
      });
    }

    let discountAmount = 0;
    let appliedDiscountCode = null;
    let freeShippingDiscount = false;

    if (discountCode) {
      const { data: discountData } = await supabaseAdmin
        .from('discount_codes')
        .select('*')
        .eq('code', discountCode.toUpperCase())
        .eq('active', true)
        .single();

      if (discountData) {
        const now = new Date();
        const startsAt = discountData.starts_at ? new Date(discountData.starts_at) : null;
        const endsAt = discountData.ends_at ? new Date(discountData.ends_at) : null;
        
        let isValid = true;
        if (discountData.usage_limit && discountData.used_count >= discountData.usage_limit) isValid = false;
        if (startsAt && startsAt > now) isValid = false;
        if (endsAt && endsAt < now) isValid = false;
        if (discountData.minimum_subtotal && subtotal < discountData.minimum_subtotal) isValid = false;

        if (isValid) {
          if (discountData.discount_type === 'free_shipping') {
            freeShippingDiscount = true;
          } else if (['percent', 'percentage'].includes(discountData.discount_type)) {
            discountAmount = subtotal * (Number(discountData.discount_value) / 100);
          } else {
            discountAmount = Number(discountData.discount_value);
          }
          if (discountAmount > subtotal) discountAmount = subtotal;
          appliedDiscountCode = discountData.code;
        }
      }
    }

    const subtotalAfterDiscount = subtotal - discountAmount;

    const shippingRules = await getShippingRules();
    const isInternational = !isJamaicaCountry(shipping.country);
    let shippingCost = 0;
    let shippingStatus = 'confirmed';
    let deliveryMethod = 'delivery';
    let deliveryService = isInternational ? 'Overseas' : shipping.deliveryMethod;

    if (isInternational) {
      shippingCost = subtotalAfterDiscount >= shippingRules.internationalFreeThresholdJmd
        ? 0
        : Number((shippingRules.internationalFlatRateUsd * shippingRules.usdToJmdRate).toFixed(2));
    } else if (deliveryService === 'Zipmail') shippingCost = shippingRules.zipmailJmd;
    else if (deliveryService === 'Knutsford') shippingCost = shippingRules.knutsfordJmd;
    else if (deliveryService === 'Bearer') {
      shippingCost = isPortmoreCity(shipping.city)
        ? shippingRules.bearerPortmoreJmd
        : shippingRules.bearerJmd;
    }
    else if (deliveryService === 'Pickup') {
      deliveryMethod = 'pickup';
      shippingCost = 0;
    } else {
      const error = new Error('Select a valid delivery method.');
      error.status = 400;
      throw error;
    }

    if (!isInternational && subtotalAfterDiscount >= shippingRules.domesticFreeThresholdJmd) {
      shippingCost = 0;
    }
    if (freeShippingDiscount) shippingCost = 0;

    const total = subtotalAfterDiscount + shippingCost;
    const paymentCurrency = isInternational ? 'USD' : 'JMD';
    const paymentAmount = isInternational
      ? Number((total / shippingRules.usdToJmdRate).toFixed(2))
      : Number(total.toFixed(2));
    const customerRegion = isInternational ? 'international' : 'domestic';

    const dateStr = jamaicaDateStamp();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `FSB-${dateStr}-${randomNum}`;
    const checkoutOrigin = requestOrigin(req);
    const fygaroPayment = buildFygaroPaymentUrl(orderNumber, paymentAmount, paymentCurrency);
    if (!fygaroPayment) {
      const error = new Error('Secure payment is temporarily unavailable. No order was created. Please try again shortly.');
      error.status = 503;
      throw error;
    }

    let customerId = null;
    if (customer.email) {
      const { data: existingByEmail } = await supabaseAdmin.from('customers').select('id').eq('email', customer.email).maybeSingle();
      if (existingByEmail) customerId = existingByEmail.id;
    }
    if (!customerId && customer.phone) {
      const { data: existingByPhone } = await supabaseAdmin.from('customers').select('id').eq('phone', customer.phone).maybeSingle();
      if (existingByPhone) customerId = existingByPhone.id;
    }
    
    if (!customerId) {
      const { data: newCustomer, error: custError } = await supabaseAdmin
        .from('customers')
        .insert({
          full_name: customer.fullName,
          phone: customer.phone,
          email: customer.email
        })
        .select('id')
        .single();
      if (custError) throw custError;
      customerId = newCustomer.id;
    }

    let formattedAddress = shipping.addressLine1;
    if (shipping.addressLine2) formattedAddress += `, ${shipping.addressLine2}`;
    if (shipping.city) formattedAddress += `, ${shipping.city}`;
    if (shipping.parish) formattedAddress += `, ${shipping.parish}`;
    if (shipping.stateProvince) formattedAddress += `, ${shipping.stateProvince}`;
    if (shipping.country) formattedAddress += `, ${shipping.country}`;

    let pointsEarned = Math.floor(subtotalAfterDiscount);
    try {
        const { data: customerData } = await supabaseAdmin.from('customers').select('lifetime_earned_points').eq('id', customerId).maybeSingle();
        const lifetimePoints = customerData ? (Number(customerData.lifetime_earned_points) || 0) : 0;
        
        const { data: settingsRows } = await supabaseAdmin.from('store_settings').select('key, value').in('key', ['loyalty_program', 'loyalty_point_policy']);
        const settings = (settingsRows || []).reduce((all, row) => ({ ...all, [row.key]: row.value }), {});
        
        const policy = settings.loyalty_point_policy;
        let policyObj = {};
        if (typeof policy === 'string') { try { policyObj = JSON.parse(policy); } catch(e){} } else if (policy) { policyObj = policy; }
        
        const pointsPerJmd = typeof policyObj.pointsPerJmd === 'number' ? policyObj.pointsPerJmd : 1;
        const tierMultipliers = Array.isArray(policyObj.tierMultipliers) ? policyObj.tierMultipliers : [1, 2, 3];

        const prog = settings.loyalty_program;
        let progObj = {};
        if (typeof prog === 'string') { try { progObj = JSON.parse(prog); } catch(e){} } else if (prog) { progObj = prog; }
        
        const tiers = Array.isArray(progObj.tiers) ? progObj.tiers : [];
        let tierIndex = 0;
        
        for (let i = 0; i < tiers.length; i++) {
            let threshold = 0;
            if (tiers[i].minimumLifetimePoints !== undefined) threshold = Number(tiers[i].minimumLifetimePoints);
            else if (tiers[i].requiredPoints !== undefined) threshold = Number(tiers[i].requiredPoints);
            else {
                const match = String(tiers[i].threshold || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
                if (match) threshold = Number(match[0]);
            }
            if (!isNaN(threshold) && lifetimePoints >= threshold) tierIndex = i;
        }
        
        const multiplier = typeof tiers[tierIndex]?.pointsMultiplier === 'number' ? tiers[tierIndex].pointsMultiplier : (tierMultipliers[tierIndex] || 1);
        pointsEarned = Math.floor(subtotalAfterDiscount * pointsPerJmd * multiplier);
    } catch (e) {
        console.error("Error calculating loyalty multiplier", e);
    }

    const { error: checkoutSessionError } = await supabaseAdmin
      .from('payment_checkout_sessions')
      .insert({
        checkout_reference: orderNumber,
        customer_id: customerId,
        customer_data: customer,
        shipping_data: {
          ...shipping,
          formattedAddress,
          deliveryMethod,
          deliveryService,
          shippingStatus
        },
        cart_data: validatedCart,
        subtotal_jmd: subtotal,
        discount_code: appliedDiscountCode,
        discount_total_jmd: discountAmount,
        shipping_total_jmd: shippingCost,
        grand_total_jmd: total,
        payment_currency: paymentCurrency,
        payment_amount: paymentAmount,
        exchange_rate_jmd_per_usd: isInternational ? shippingRules.usdToJmdRate : null,
        customer_region: customerRegion,
        points_earned: pointsEarned,
        status: 'pending'
      });
    if (checkoutSessionError) throw checkoutSessionError;

    // There is deliberately no orders row until Fygaro confirms payment.
    const orderId = null;

    if (newsletterOptIn && customer.email) {
      const normalizedEmail = String(customer.email).trim().toLowerCase();
      const { data: existingSubscriber } = await supabaseAdmin
        .from('newsletter_subscribers')
        .select('email,is_active')
        .eq('email', normalizedEmail)
        .maybeSingle();
      const { error: newsletterError } = await supabaseAdmin
        .from('newsletter_subscribers')
        .upsert({
          email: normalizedEmail,
          source: 'checkout',
          is_active: true
        }, { onConflict: 'email' });
      if (newsletterError) {
        console.warn('[Newsletter] Checkout opt-in could not be saved:', newsletterError.message);
      } else if (!existingSubscriber?.is_active) {
        await queueEmail({
          recipient: normalizedEmail,
          emailType: 'newsletter_welcome',
          subject: 'Welcome to Glow Letters',
          html: '<p>Welcome to Glow Letters.</p><p>You are now subscribed to skincare guidance, product updates, new articles, and occasional offers from For You Skin Bar.</p><p>Thank you for joining us.</p>',
          templateVariables: { signup_source: 'checkout' }
        });
      }
    }

    // Resend Email Logic
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const OWNER_EMAIL = process.env.OWNER_EMAIL || STORE_CONTACT_EMAIL;
    const FROM_EMAIL = process.env.FROM_EMAIL || DEFAULT_FROM_EMAIL;

    // All active delivery goes through queueEmail so every message is logged,
    // branded, and protected by a Resend idempotency key.
    if (false && RESEND_API_KEY) {
      const itemsListText = validatedCart.map((item, idx) => `${idx + 1}. ${item.name} × ${item.quantity} — J$${(item.price * item.quantity).toLocaleString()}`).join('\n');

      const customerHtml = `
        <p>Hi ${customer.fullName},</p>
        <p>Your checkout details have been saved with For You Skin Bar.</p>
        <p><strong>Your order is not confirmed until payment is completed through Fygaro.</strong></p>
        <p><b>Order Number:</b> ${orderNumber}<br>
        <b>Payment Status:</b> Awaiting Fygaro payment<br>
        <b>Delivery Method:</b> ${deliveryService}</p>
        <p><b>Items:</b><br>${itemsListText.replace(/\n/g, '<br>')}</p>
        <p><b>Subtotal:</b> J$${subtotal.toLocaleString()}<br>
        ${discountAmount > 0 ? `<b>Discount (${appliedDiscountCode}):</b> -J$${discountAmount.toLocaleString()}<br>` : ''}
        <b>Shipping:</b> ${deliveryService === 'Overseas' ? 'To be confirmed' : 'J$' + shippingCost.toLocaleString()}<br>
        <b>Final Total:</b> ${deliveryService === 'Overseas' ? 'Pending shipping confirmation' : 'J$' + total.toLocaleString()}</p>
        <p><b>Delivery Address:</b><br>
        ${shipping.addressLine1}<br>
        ${shipping.addressLine2 ? shipping.addressLine2 + '<br>' : ''}
        ${shipping.city}${shipping.stateProvince ? ', ' + shipping.stateProvince : ''}<br>
        ${shipping.parish ? shipping.parish + '<br>' : ''}
        ${shipping.postalCode ? shipping.postalCode + '<br>' : ''}
        ${shipping.country}</p>
        <p>This is a payment-pending notice, not an order confirmation or tax invoice. Card payment is completed securely through Fygaro.</p>
        <p>Thank you for shopping with us.</p>
      `;

      const ownerHtml = `
        <p>A customer started Fygaro checkout. Do not fulfil this order until its payment status changes to Paid.</p>
        <p><b>Customer:</b><br>
        Name: ${customer.fullName}<br>
        Phone: ${customer.phone}<br>
        Email: ${customer.email}</p>
        <p><b>Delivery:</b><br>
        Method: ${deliveryService}<br>
        Address: ${shipping.addressLine1}, ${shipping.city}, ${shipping.country}<br>
        Postal / ZIP Code: ${shipping.postalCode || 'N/A'}</p>
        <p><b>Order:</b><br>${itemsListText.replace(/\n/g, '<br>')}</p>
        <p>Subtotal: J$${subtotal.toLocaleString()}<br>
        ${discountAmount > 0 ? `Discount (${appliedDiscountCode}): -J$${discountAmount.toLocaleString()}<br>` : ''}
        Shipping: ${deliveryService === 'Overseas' ? 'To be confirmed' : 'J$' + shippingCost.toLocaleString()}<br>
        Total: ${deliveryService === 'Overseas' ? 'Pending shipping confirmation' : 'J$' + total.toLocaleString()}</p>
        <p><b>Notes:</b><br>${shipping.notes || 'None'}</p>
      `;

      let resCustomerOk = false;
      let customerErrorMsg = null;
      try {
        const resCustomer = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: customer.email,
            subject: `Complete payment for For You Skin Bar order ${orderNumber}`,
            html: customerHtml
          })
        });
        resCustomerOk = resCustomer.ok;
        if (!resCustomer.ok) customerErrorMsg = JSON.stringify(await resCustomer.json());
      } catch (err) {
        customerErrorMsg = String(err);
      }

      await supabaseAdmin.from('email_logs').insert({
        order_id: orderId,
        recipient: customer.email,
        email_type: 'customer_confirmation',
        status: resCustomerOk ? 'sent' : 'error',
        error_message: customerErrorMsg
      });

      let resOwnerOk = false;
      let ownerErrorMsg = null;
      try {
        const resOwner = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: OWNER_EMAIL,
            subject: `Payment pending - ${orderNumber}`,
            html: ownerHtml
          })
        });
        resOwnerOk = resOwner.ok;
        if (!resOwner.ok) ownerErrorMsg = JSON.stringify(await resOwner.json());
      } catch (err) {
        ownerErrorMsg = String(err);
      }

      await supabaseAdmin.from('email_logs').insert({
        order_id: orderId,
        recipient: OWNER_EMAIL,
        email_type: 'owner_notification',
        status: resOwnerOk ? 'sent' : 'error',
        error_message: ownerErrorMsg
      });
    } else {
      const customerMoney = (valueJmd) => paymentCurrency === 'USD'
        ? formatPaymentAmount(Number(valueJmd) / shippingRules.usdToJmdRate, 'USD')
        : formatPaymentAmount(valueJmd, 'JMD');
      const paymentDisplay = formatPaymentAmount(paymentAmount, paymentCurrency);
      const pendingItemsHtml = validatedCart.map((item, index) =>
        `<div style="padding:8px 0;border-bottom:1px solid #eee5d6;"><strong>${index + 1}. ${escapeHtml(item.name)}</strong><br>Qty ${escapeHtml(item.quantity)} &middot; ${customerMoney(item.price * item.quantity)}</div>`
      ).join('');
      const paymentButton = `<p style="margin:24px 0;"><a href="${escapeHtml(fygaroPayment.url)}" style="display:inline-block;background:#344633;color:#fff;text-decoration:none;padding:13px 20px;font-weight:700;">Complete secure payment</a></p>`;
      await queueEmail({
        orderId,
        recipient: customer.email,
        emailType: 'payment_pending',
        subject: `Complete payment for For You Skin Bar order ${orderNumber}`,
        html: `<p>Hi ${escapeHtml(customer.fullName)},</p><p>Your checkout is saved, but <strong>your order is not confirmed until Fygaro payment is complete.</strong></p>${paymentButton}<p><strong>Reference:</strong> ${escapeHtml(orderNumber)}<br><strong>Delivery:</strong> ${escapeHtml(isInternational ? `${shippingRules.internationalCarrier} international delivery` : deliveryService)}<br><strong>Amount due:</strong> ${paymentDisplay}</p><div style="margin:20px 0;">${pendingItemsHtml}</div><p><strong>Ship to:</strong><br>${escapeHtml(formattedAddress)}</p><p>This is a payment reminder, not a paid-order receipt.</p>`,
        metadata: { order_number: orderNumber, payment_currency: paymentCurrency, payment_amount: paymentAmount },
        templateVariables: {
          customer_name: customer.fullName,
          order_number: orderNumber,
          payment_url: fygaroPayment.url,
          payment_button: paymentButton,
          amount_due: paymentDisplay,
          delivery_method: isInternational ? `${shippingRules.internationalCarrier} international delivery` : deliveryService,
          shipping_address: formattedAddress,
          items_html: `<div style="margin:20px 0;">${pendingItemsHtml}</div>`
        }
      });
      await queueEmail({
        orderId,
        recipient: OWNER_EMAIL,
        emailType: 'owner_payment_pending',
        subject: `Payment pending - ${orderNumber}`,
        html: `<p>A customer reached Fygaro checkout. <strong>Do not fulfil this checkout until payment is marked Paid.</strong></p><p><strong>Customer:</strong> ${escapeHtml(customer.fullName)}<br>${escapeHtml(customer.email)}<br>${escapeHtml(customer.phone)}</p><p><strong>Amount awaiting payment:</strong> ${paymentDisplay}<br><strong>JMD accounting total:</strong> ${formatPaymentAmount(total, 'JMD')}<br><strong>Delivery:</strong> ${escapeHtml(isInternational ? `${shippingRules.internationalCarrier} international delivery` : deliveryService)}</p><div style="margin:20px 0;">${pendingItemsHtml}</div><p><strong>Address:</strong><br>${escapeHtml(formattedAddress)}</p><p><strong>Notes:</strong> ${escapeHtml(shipping.notes || 'None')}</p>`,
        metadata: { order_number: orderNumber, payment_currency: paymentCurrency, payment_amount: paymentAmount },
        templateVariables: {
          customer_name: customer.fullName,
          customer_email: customer.email,
          customer_phone: customer.phone,
          order_number: orderNumber,
          amount_due: paymentDisplay,
          accounting_total: formatPaymentAmount(total, 'JMD'),
          delivery_method: isInternational ? `${shippingRules.internationalCarrier} international delivery` : deliveryService,
          shipping_address: formattedAddress,
          customer_notes: shipping.notes || 'None',
          items_html: `<div style="margin:20px 0;">${pendingItemsHtml}</div>`
        }
      });
    }

    // ── Build Fygaro Payment URL ──
    res.status(201).json({
      success: true, 
      order_number: orderNumber,
      grand_total: total,
      payment_amount: paymentAmount,
      payment_currency: paymentCurrency,
      display_total: formatPaymentAmount(paymentAmount, paymentCurrency),
      shipping_status: shippingStatus,
      email_status: RESEND_API_KEY ? 'processed' : 'queued',
      fygaro_url: fygaroPayment.url,
      fygaro_mode: fygaroPayment.mode,
      payment_access_token: orderAccessToken(orderNumber),
      payment_return_url: paymentCallbackUrls(checkoutOrigin, orderNumber).returnUrl
    });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

// ── Payment confirmation routes ──
app.post('/api/admin/payment-checkouts/:reference/confirm', async (req, res) => {
  try {
    await requireAdmin(req);
    const orderRef = String(req.params.reference || '').trim();
    const paymentReference = String(req.body?.paymentReference || '').trim();
    if (!/^FSB-\d{8}-\d{4}$/.test(orderRef)) {
      return res.status(400).json({ error: 'A valid checkout reference is required.' });
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{4,159}$/.test(paymentReference)) {
      return res.status(400).json({ error: 'Enter the Fygaro payment or transaction reference.' });
    }

    const order = await reconcileCheckoutSessionPayment(orderRef, paymentReference, 'admin');
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('full_name,email')
      .eq('id', order.customer_id)
      .maybeSingle();

    if (customer?.email) {
      await queueEmail({
        orderId: order.id,
        recipient: customer.email,
        emailType: 'payment_confirmed',
        subject: `Payment confirmed - For You Skin Bar order ${order.order_number}`,
        html: `<p>Hi ${escapeHtml(customer.full_name)},</p><p>Your Fygaro payment for <strong>${escapeHtml(order.order_number)}</strong> has been confirmed.</p><p>We are now preparing your order and will send a fulfilment update when it is ready.</p>`,
        metadata: { order_number: order.order_number, payment_reference: paymentReference, source: 'admin_reconciliation' },
        templateVariables: {
          customer_name: customer.full_name,
          order_number: order.order_number,
          payment_reference: paymentReference,
          amount_paid: formatPaymentAmount(order.payment_amount ?? order.grand_total_jmd, order.payment_currency || 'JMD'),
          items_html: ''
        }
      });
    }

    await queueEmail({
      orderId: order.id,
      recipient: OWNER_EMAIL,
      emailType: 'owner_payment_confirmed',
      subject: `Payment reconciled - ${order.order_number}`,
      html: `<p>Fygaro payment <strong>${escapeHtml(paymentReference)}</strong> was matched to <strong>${escapeHtml(order.order_number)}</strong>.</p><p>Amount: ${formatPaymentAmount(order.payment_amount ?? order.grand_total_jmd, order.payment_currency || 'JMD')}</p>`,
      metadata: { order_number: order.order_number, payment_reference: paymentReference, source: 'admin_reconciliation' },
      templateVariables: {
        order_number: order.order_number,
        payment_reference: paymentReference,
        amount_paid: formatPaymentAmount(order.payment_amount ?? order.grand_total_jmd, order.payment_currency || 'JMD'),
        accounting_total: formatPaymentAmount(order.grand_total_jmd, 'JMD')
      }
    });

    return res.status(200).json({ success: true, order });
  } catch (error) {
    console.error('[Payment Reconciliation]', error.message);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to reconcile this payment.' });
  }
});

app.patch('/api/admin/orders/:id/status', async (req, res) => {
  try {
    await requireAdmin(req);
    const orderId = String(req.params.id || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
      return res.status(400).json({ error: 'A valid order ID is required.' });
    }

    const field = String(req.body?.field || '').trim();
    const value = String(req.body?.value || '').trim().toLowerCase();
    const allowedValues = {
      payment_status: ['unpaid', 'awaiting_confirmation', 'paid', 'partially_paid', 'refunded'],
      status: ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled', 'refunded']
    };
    if (!allowedValues[field]?.includes(value)) {
      return res.status(400).json({ error: 'Select a valid order status.' });
    }

    const { data: currentOrder, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('id,status,payment_status')
      .eq('id', orderId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!currentOrder) return res.status(404).json({ error: 'Order not found.' });

    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select('id,order_number,status,payment_status')
      .single();
    if (updateError) throw updateError;

    let emailStatus = 'not_required';
    if (field === 'status' && value === 'shipped' && currentOrder.status !== 'shipped') {
      const emailResult = await sendShippingUpdateEmail(orderId);
      emailStatus = emailResult.status;
    }

    return res.status(200).json({ success: true, order: updatedOrder, email_status: emailStatus });
  } catch (error) {
    console.error('[Admin Order Status]', error.message);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to update this order.' });
  }
});

app.patch('/api/admin/orders/:id/tracking', async (req, res) => {
  try {
    await requireAdmin(req);
    const orderId = String(req.params.id || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
      return res.status(400).json({ error: 'A valid order ID is required.' });
    }

    const trackingCarrier = String(req.body?.tracking_carrier || '').trim();
    const trackingNumber = String(req.body?.tracking_number || '').trim();
    const trackingUrl = normalizeTrackingWebAddress(req.body?.tracking_url || '');
    const notifyCustomer = req.body?.notify_customer === true;
    if (trackingCarrier.length > 100) return res.status(400).json({ error: 'Carrier name must be 100 characters or fewer.' });
    if (trackingNumber.length > 180) return res.status(400).json({ error: 'Tracking number must be 180 characters or fewer.' });
    if (trackingUrl.length > 2000) return res.status(400).json({ error: 'Tracking web address is too long.' });

    const { data: currentOrder, error: currentError } = await supabaseAdmin
      .from('orders')
      .select('id,status')
      .eq('id', orderId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!currentOrder) return res.status(404).json({ error: 'Order not found.' });
    if (notifyCustomer && currentOrder.status !== 'shipped') {
      return res.status(409).json({ error: 'Mark the order as shipped before emailing tracking details.' });
    }
    if (notifyCustomer && !trackingNumber && !trackingUrl) {
      return res.status(400).json({ error: 'Add a tracking number or tracking web address before emailing the customer.' });
    }

    const { data: order, error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        tracking_carrier: trackingCarrier || null,
        tracking_number: trackingNumber || null,
        tracking_url: trackingUrl || null,
        tracking_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select('id,order_number,status,tracking_carrier,tracking_number,tracking_url,tracking_updated_at')
      .single();
    if (updateError) throw updateError;

    let emailStatus = 'not_requested';
    if (notifyCustomer) {
      const emailResult = await sendShippingUpdateEmail(orderId, { allowResend: true });
      emailStatus = emailResult.status;
    }

    return res.status(200).json({ success: true, order, email_status: emailStatus });
  } catch (error) {
    console.error('[Admin Order Tracking]', error.message);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to update shipment tracking.' });
  }
});

app.delete('/api/admin/payment-checkouts/:reference', async (req, res) => {
  try {
    await requireAdmin(req);
    const checkoutReference = String(req.params.reference || '').trim();
    if (!/^FSB-\d{8}-\d{4}$/.test(checkoutReference)) {
      return res.status(400).json({ error: 'A valid checkout reference is required.' });
    }

    const { data: checkout, error: checkoutError } = await supabaseAdmin
      .from('payment_checkout_sessions')
      .select('id,status,order_id,fygaro_transaction_id')
      .eq('checkout_reference', checkoutReference)
      .maybeSingle();
    if (checkoutError) throw checkoutError;
    if (!checkout) return res.status(404).json({ error: 'Checkout not found.' });
    if (checkout.order_id || checkout.status === 'paid' || checkout.fygaro_transaction_id) {
      return res.status(409).json({ error: 'Paid or order-linked checkouts cannot be deleted.' });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('payment_checkout_sessions')
      .delete()
      .eq('id', checkout.id);
    if (deleteError) throw deleteError;

    console.log(`[Admin Cleanup] Deleted unmatched checkout ${checkoutReference}.`);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Admin Checkout Delete]', error.message);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to delete this checkout.' });
  }
});

app.delete('/api/admin/orders/:id', async (req, res) => {
  try {
    await requireAdmin(req);
    const orderId = String(req.params.id || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
      return res.status(400).json({ error: 'A valid order ID is required.' });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id,order_number,status,payment_status')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.payment_status !== 'unpaid' || order.status !== 'cancelled') {
      return res.status(409).json({
        error: 'Only cancelled, unpaid orders can be deleted. Paid orders must remain in the sales record.'
      });
    }

    const { data: linkedCheckouts, error: linkedError } = await supabaseAdmin
      .from('payment_checkout_sessions')
      .select('id,status,fygaro_transaction_id')
      .eq('order_id', order.id);
    if (linkedError) throw linkedError;
    if ((linkedCheckouts || []).some(checkout => checkout.status === 'paid' || checkout.fygaro_transaction_id)) {
      return res.status(409).json({ error: 'This order is linked to a recorded Fygaro payment and cannot be deleted.' });
    }

    if (linkedCheckouts?.length) {
      const { error: checkoutDeleteError } = await supabaseAdmin
        .from('payment_checkout_sessions')
        .delete()
        .in('id', linkedCheckouts.map(checkout => checkout.id));
      if (checkoutDeleteError) throw checkoutDeleteError;
    }

    const { error: redemptionDeleteError } = await supabaseAdmin
      .from('discount_redemptions')
      .delete()
      .eq('order_id', order.id);
    if (redemptionDeleteError && redemptionDeleteError.code !== '42P01') throw redemptionDeleteError;

    const { error: deleteError } = await supabaseAdmin.from('orders').delete().eq('id', order.id);
    if (deleteError) throw deleteError;

    console.log(`[Admin Cleanup] Deleted cancelled unpaid order ${order.order_number}.`);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Admin Order Delete]', error.message);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to delete this order.' });
  }
});

app.post('/api/fygaro-webhook', async (req, res) => {
  try {
    const signature = req.headers['fygaro-signature'] || req.headers['x-fygaro-signature'] || '';
    const keyId     = req.headers['fygaro-key-id'] || '';
    const rawBody   = req.rawBody || Buffer.from(JSON.stringify(req.body), 'utf8');

    // Verify the request is genuinely from Fygaro
    if (!FYGARO_API_SECRET) {
      console.error('[Fygaro Webhook] FYGARO_API_SECRET is not configured.');
      return res.status(503).json({ error: 'Fygaro webhook is not configured' });
    }
    if (!verifyFygaroSignature(rawBody, signature, keyId)) {
      console.warn('[Fygaro Webhook] Signature verification failed.');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const payload = req.body;
    console.log('[Fygaro Webhook] Received:', JSON.stringify(payload));

    // Extract the order reference (we set this as custom_reference in the JWT).
    // Fygaro hook payloads use customReference; return URLs may use custom_reference.
    const orderRef = payload.customReference || payload.custom_reference || payload.client_reference || payload.order_ref;
    const paymentRef = payload.transactionId || payload.reference || payload.id || payload.payment_id || null;
    const paymentStatus = String(payload.status || payload.paymentStatus || '').toLowerCase();
    const amountPaid = parseMoney(payload.amount ?? payload.total ?? payload.totalAmount);
    const currency = String(payload.currency || 'JMD').toUpperCase();

    if (!orderRef) {
      return res.status(400).json({ error: 'No order reference in payload' });
    }

    // Fygaro payment hooks are sent after successful payments. If a status is
    // included, only process confirmed successful values.
    if (paymentStatus && !['paid', 'success', 'completed', 'approved', 'captured'].includes(paymentStatus)) {
      console.log(`[Fygaro Webhook] Ignoring non-success status: ${paymentStatus}`);
      return res.status(200).json({ received: true, action: 'ignored' });
    }

    // Paid orders are created from the saved checkout session only after this
    // signed webhook passes reference, currency, and amount validation.
    const { data: existingOrder, error: fetchErr } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, status, payment_status, grand_total_jmd, payment_currency, payment_amount, customer_id, delivery_service, admin_notes')
      .eq('order_number', orderRef)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    let order = existingOrder;
    let checkoutSession = null;

    if (!order) {
      const { data: session, error: sessionError } = await supabaseAdmin
        .from('payment_checkout_sessions')
        .select('*')
        .eq('checkout_reference', orderRef)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!session) {
        console.error('[Fygaro Webhook] Checkout reference not found:', orderRef);
        return res.status(404).json({ error: 'Checkout reference not found' });
      }
      checkoutSession = session;
    }

    // Idempotency — skip if already marked paid
    if (order?.payment_status === 'paid') {
      console.log('[Fygaro Webhook] Already paid, skipping:', orderRef);
      return res.status(200).json({ received: true, action: 'already_paid' });
    }

    const expectedCurrency = String(order?.payment_currency || checkoutSession?.payment_currency || 'JMD').toUpperCase();
    if (currency !== expectedCurrency) {
      console.error('[Fygaro Webhook] Currency mismatch:', { currency, expectedCurrency, orderRef });
      return res.status(400).json({ error: 'Currency mismatch' });
    }

    const expectedTotal = Number(order?.payment_amount ?? checkoutSession?.payment_amount ?? order?.grand_total_jmd ?? checkoutSession?.grand_total_jmd ?? 0);
    if (amountPaid === null) {
      console.error('[Fygaro Webhook] Payment amount missing:', orderRef);
      return res.status(400).json({ error: 'Payment amount is required' });
    }
    const paymentTolerance = expectedCurrency === 'USD' ? 0.01 : 1;
    if (amountPaid + paymentTolerance < expectedTotal) {
      console.error('[Fygaro Webhook] Amount mismatch:', { orderRef, expectedTotal, amountPaid });
      return res.status(400).json({ error: 'Payment amount does not match order total' });
    }

    if (!order) {
      order = await materializePaidCheckoutSession(checkoutSession);
    }

    const paymentNote = [
      '[Fygaro Payment Confirmed]',
      `Transaction: ${paymentRef || 'N/A'}`,
      `Amount: ${amountPaid === null ? 'N/A' : formatPaymentAmount(amountPaid, expectedCurrency)}`,
      `Received: ${new Date().toISOString()}`
    ].join(' ');

    // Mark order as paid
    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'paid',
        payment_method: 'Fygaro',
        status: order.status === 'pending' ? 'confirmed' : order.status,
        admin_notes: order.admin_notes ? `${paymentNote}\n\n${order.admin_notes}` : paymentNote,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    if (updateErr) throw updateErr;

    await supabaseAdmin.from('payment_checkout_sessions').update({
      status: 'paid',
      order_id: order.id,
      fygaro_transaction_id: paymentRef,
      updated_at: new Date().toISOString()
    }).eq('checkout_reference', orderRef);

    console.log(`[Fygaro Webhook] Order ${orderRef} marked as PAID.`);

    // Fetch customer details for confirmation email
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('full_name, email, phone')
      .eq('id', order.customer_id)
      .maybeSingle();

    // Fetch order items for email
    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select('product_name, quantity, unit_price_jmd, line_total_jmd')
      .eq('order_id', order.id);

    // Send payment confirmation email via Resend
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const OWNER_EMAIL    = process.env.OWNER_EMAIL || STORE_CONTACT_EMAIL;
    const FROM_EMAIL     = process.env.FROM_EMAIL  || DEFAULT_FROM_EMAIL;

    if (false && RESEND_API_KEY && customer?.email) {
      const itemsHtml = (items || []).map((item, i) =>
        `${i + 1}. ${escapeHtml(item.product_name)} x ${escapeHtml(item.quantity)} - J$${Number(item.line_total_jmd).toLocaleString()}`
      ).join('<br>');

      const confirmHtml = `
        <p>Hi ${escapeHtml(customer.full_name)},</p>
        <p>Great news - your payment has been <strong>confirmed</strong>.</p>
        <p><b>Order Number:</b> ${escapeHtml(order.order_number)}<br>
        <b>Amount Paid:</b> J$${Number(order.grand_total_jmd).toLocaleString()}<br>
        <b>Payment Method:</b> Fygaro (Card)</p>
        <p><b>Items:</b><br>${itemsHtml}</p>
        <p>We are now preparing your order. You will receive a shipping update soon.</p>
        <p>Thank you for shopping with For You Skin Bar.</p>
      `;

      const ownerConfirmHtml = `
        <p>Payment confirmed for order <strong>${escapeHtml(order.order_number)}</strong>.</p>
        <p>Customer: ${escapeHtml(customer.full_name)} (${escapeHtml(customer.email)}, ${escapeHtml(customer.phone)})<br>
        Amount: J$${Number(order.grand_total_jmd).toLocaleString()}<br>
        Delivery: ${escapeHtml(order.delivery_service)}</p>
        <p><b>Items:</b><br>${itemsHtml}</p>
        <p>Please prepare and dispatch this order.</p>
      `;

      // Email customer
      try {
        const r1 = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: customer.email,
            subject: `Payment Confirmed - Your For You Skin Bar order ${order.order_number}`,
            html: confirmHtml,
          }),
        });
        await supabaseAdmin.from('email_logs').insert({
          order_id: order.id, recipient: customer.email,
          email_type: 'payment_confirmed', status: r1.ok ? 'sent' : 'error',
        });
      } catch (e) { console.error('[Fygaro Webhook] Customer email error:', e); }

      // Notify owner
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: OWNER_EMAIL,
            subject: `Payment Received - ${order.order_number} (J$${Number(order.grand_total_jmd).toLocaleString()})`,
            html: ownerConfirmHtml,
          }),
        });
      } catch (e) { console.error('[Fygaro Webhook] Owner email error:', e); }
    } else if (customer?.email) {
      const confirmedCurrency = String(order.payment_currency || 'JMD').toUpperCase();
      const confirmedAmount = Number(order.payment_amount ?? order.grand_total_jmd);
      const confirmedDisplay = formatPaymentAmount(confirmedAmount, confirmedCurrency);
      const pendingItemsHtml = (items || []).map((item, index) =>
        `<div style="padding:8px 0;border-bottom:1px solid #eee5d6;"><strong>${index + 1}. ${escapeHtml(item.product_name)}</strong><br>Qty ${escapeHtml(item.quantity)}</div>`
      ).join('');
      await queueEmail({
        orderId: order.id,
        recipient: customer.email,
        emailType: 'payment_confirmed',
        subject: `Payment confirmed - For You Skin Bar order ${order.order_number}`,
        html: `<p>Hi ${escapeHtml(customer.full_name)},</p><p>Your Fygaro payment for <strong>${escapeHtml(order.order_number)}</strong> is confirmed.</p><div style="margin:20px 0;">${pendingItemsHtml}</div><p><strong>Amount paid:</strong> ${confirmedDisplay}</p><p>We are preparing your order now. You will receive another update when it is ready for pickup or dispatch.</p>`,
        metadata: { order_number: order.order_number },
        templateVariables: {
          customer_name: customer.full_name,
          order_number: order.order_number,
          payment_reference: paymentRef,
          amount_paid: confirmedDisplay,
          items_html: `<div style="margin:20px 0;">${pendingItemsHtml}</div>`
        }
      });
      await queueEmail({
        orderId: order.id,
        recipient: OWNER_EMAIL,
        emailType: 'owner_payment_confirmed',
        subject: `Payment received - ${order.order_number}`,
        html: `<p>Payment was confirmed for <strong>${escapeHtml(order.order_number)}</strong>.</p><p><strong>Amount:</strong> ${confirmedDisplay}<br><strong>JMD accounting total:</strong> ${formatPaymentAmount(order.grand_total_jmd, 'JMD')}</p><p>Please prepare this order for fulfilment.</p>`,
        metadata: { order_number: order.order_number },
        templateVariables: {
          order_number: order.order_number,
          payment_reference: paymentRef,
          amount_paid: confirmedDisplay,
          accounting_total: formatPaymentAmount(order.grand_total_jmd, 'JMD')
        }
      });
    }

    res.status(200).json({ received: true, action: 'paid', order: orderRef });
  } catch (err) {
    console.error('[Fygaro Webhook] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/payment-status', async (req, res) => {
  try {
    const ref = String(req.query.ref || req.query.customReference || req.query.custom_reference || '').trim();
    const token = String(req.query.token || '').trim();
    if (!ref) return res.status(400).json({ error: 'Order reference is required.' });
    if (!verifyOrderAccessToken(ref, token)) return res.status(403).json({ error: 'Invalid order access token.' });

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, status, payment_status, delivery_service, shipping_address, subtotal_jmd, discount_total_jmd, shipping_total_jmd, grand_total_jmd, payment_currency, payment_amount, exchange_rate_jmd_per_usd, customer_region')
      .eq('order_number', ref)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) {
      const { data: checkoutSession, error: sessionError } = await supabaseAdmin
        .from('payment_checkout_sessions')
        .select('checkout_reference,status,shipping_data,cart_data,subtotal_jmd,discount_total_jmd,shipping_total_jmd,grand_total_jmd,payment_currency,payment_amount,exchange_rate_jmd_per_usd,customer_region')
        .eq('checkout_reference', ref)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!checkoutSession) return res.status(404).json({ error: 'Checkout reference not found.' });
      const shipping = checkoutSession.shipping_data || {};
      const items = (Array.isArray(checkoutSession.cart_data) ? checkoutSession.cart_data : []).map((item) => ({
        product_name: item.name,
        quantity: item.quantity,
        unit_price_jmd: item.price,
        line_total_jmd: item.price * item.quantity
      }));
      return res.status(200).json({
        order: {
          order_number: checkoutSession.checkout_reference,
          status: 'pending',
          payment_status: 'awaiting_confirmation',
          delivery_service: shipping.deliveryService,
          shipping_address: shipping.formattedAddress,
          subtotal_jmd: checkoutSession.subtotal_jmd,
          discount_total_jmd: checkoutSession.discount_total_jmd,
          shipping_total_jmd: checkoutSession.shipping_total_jmd,
          grand_total_jmd: checkoutSession.grand_total_jmd,
          payment_currency: checkoutSession.payment_currency || 'JMD',
          payment_amount: checkoutSession.payment_amount || checkoutSession.grand_total_jmd,
          exchange_rate_jmd_per_usd: checkoutSession.exchange_rate_jmd_per_usd,
          customer_region: checkoutSession.customer_region
        },
        items
      });
    }

    const { data: items, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('product_name, quantity, unit_price_jmd, line_total_jmd')
      .eq('order_id', order.id);
    if (itemsError) throw itemsError;

    return res.status(200).json({ order, items: items || [] });
  } catch (err) {
    console.error('[Payment Status] API Error:', err);
    return res.status(500).json({ error: 'Unable to load payment status.' });
  }
});

// ── Order Cancellation Endpoint (EU Compliance) ──
async function legacyCancellationHandler(req, res) {
  try {
    const { orderNumber, email } = req.body;
    const reason = String(req.body?.reason || '').trim().slice(0, 1000);
    if (!orderNumber || !email) {
      return res.status(400).json({ error: 'Order number and email are required.' });
    }

    // 1. Fetch order and customer
    const { data: order, error: fetchErr } = await supabaseAdmin
      .from('orders')
      .select('*, customers(full_name, email, phone)')
      .eq('order_number', orderNumber.trim())
      .maybeSingle();

    if (fetchErr || !order) {
      console.error('[Cancel Order] Fetch error or order not found:', fetchErr);
      return res.status(404).json({ error: 'Order not found. Please verify the order number.' });
    }

    // 2. Validate email matches
    const customerEmail = order.customers?.email || order.email || '';
    if (customerEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
      return res.status(400).json({ error: 'The email address provided does not match this order.' });
    }

    // 3. Verify cancellation eligibility
    const orderStatus = String(order.status || '').toLowerCase();
    const fulfillmentStatus = String(order.fulfillment_status || '').toLowerCase();
    if (['shipped', 'delivered', 'cancelled', 'refunded'].includes(orderStatus) || ['shipped', 'delivered', 'picked_up'].includes(fulfillmentStatus)) {
      return res.status(400).json({
        error: `This order cannot be cancelled because its current status is "${order.status || order.fulfillment_status}".`
      });
    }

    // 4. Perform database updates
    const updateFields = {
      status: 'cancelled',
      updated_at: new Date().toISOString()
    };

    // Prepend customer cancellation note to admin notes
    const paymentNote = order.payment_status === 'paid'
      ? 'Order was already paid. Admin refund review is required before marking payment as refunded.'
      : `Payment status at cancellation: ${order.payment_status || 'unknown'}.`;
    let newAdminNotes = [
      '[Customer Cancellation Request]',
      `Reason: ${reason || 'No reason provided'}`,
      paymentNote,
      `Requested: ${new Date().toISOString()}`
    ].join('\n');
    if (order.admin_notes) {
      newAdminNotes = `${newAdminNotes}\n\n${order.admin_notes}`;
    }
    updateFields.admin_notes = newAdminNotes;

    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update(updateFields)
      .eq('id', order.id);

    if (updateErr) throw updateErr;

    console.log(`[Cancel Order] Order ${orderNumber} cancelled successfully by customer.`);

    // 5. Send confirmation emails via Resend
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const OWNER_EMAIL    = process.env.OWNER_EMAIL || STORE_CONTACT_EMAIL;
    const FROM_EMAIL     = process.env.FROM_EMAIL  || DEFAULT_FROM_EMAIL;

    if (false && RESEND_API_KEY && customerEmail) {
      const customerHtml = `
        <p>Hi ${escapeHtml(order.customers?.full_name || 'Valued Customer')},</p>
        <p>Your request to cancel For You Skin Bar order <strong>${escapeHtml(order.order_number)}</strong> has been received and the order has been marked cancelled.</p>
        ${order.payment_status === 'paid' ? `<p>Since this order was paid, our team will review and process the refund manually. Please allow 3-5 business days after refund processing for your bank to reflect it.</p>` : ''}
        <p>If you did not make this request or have any questions, please contact us on WhatsApp immediately.</p>
        <p>Thank you,<br>For You Skin Bar Team</p>
      `;

      const ownerHtml = `
        <p><strong>Order Cancellation Request</strong></p>
        <p>Order <strong>${escapeHtml(order.order_number)}</strong> has been cancelled by the customer.</p>
        <p><b>Customer:</b> ${escapeHtml(order.customers?.full_name || 'N/A')} (${escapeHtml(customerEmail)})</p>
        <p><b>Reason:</b> ${escapeHtml(reason || 'No reason provided')}</p>
        <p><b>Payment Status:</b> ${escapeHtml(order.payment_status)}<br>
        <b>Total Order Value:</b> J$${Number(order.grand_total_jmd).toLocaleString()}</p>
        ${order.payment_status === 'paid' ? '<p><strong>Action needed:</strong> process the refund in Fygaro, then mark the payment as refunded in the admin dashboard.</p>' : '<p>No payment refund is needed unless payment was collected outside the website.</p>'}
      `;

      // Customer email
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: customerEmail,
            subject: `Order Cancellation Received - ${order.order_number}`,
            html: customerHtml,
          }),
        });
      } catch (e) { console.error('[Cancel Order] Customer email error:', e); }

      // Owner email
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: OWNER_EMAIL,
            subject: `Order Cancelled by Customer - ${order.order_number}`,
            html: ownerHtml,
          }),
        });
      } catch (e) { console.error('[Cancel Order] Owner email error:', e); }
    } else if (customerEmail) {
      await queueEmail({
        orderId: order.id,
        recipient: customerEmail,
        emailType: 'order_cancelled',
        subject: `Order cancellation received - ${order.order_number}`,
        html: `<p>Hi ${escapeHtml(order.customers?.full_name || 'Valued Customer')},</p><p>Your request to cancel <strong>${escapeHtml(order.order_number)}</strong> has been received and the order is now marked cancelled.</p>${order.payment_status === 'paid' ? '<p>Because payment was already collected, our team will review the transaction and process the refund manually. Bank posting times may vary.</p>' : '<p>No payment refund is required for this order.</p>'}<p>Contact us immediately if you did not request this cancellation.</p>`,
        metadata: { order_number: order.order_number },
        templateVariables: {
          customer_name: order.customers?.full_name || 'Valued Customer',
          order_number: order.order_number,
          payment_status: order.payment_status,
          refund_message: order.payment_status === 'paid'
            ? '<p>Because payment was already collected, our team will review the transaction and process the refund manually. Bank posting times may vary.</p>'
            : '<p>No payment refund is required for this order.</p>'
        }
      });
      await queueEmail({
        orderId: order.id,
        recipient: OWNER_EMAIL,
        emailType: 'owner_order_cancelled',
        subject: `Order cancelled by customer - ${order.order_number}`,
        html: `<p>Order <strong>${escapeHtml(order.order_number)}</strong> was cancelled by the customer.</p><p><strong>Customer:</strong> ${escapeHtml(order.customers?.full_name || 'N/A')} (${escapeHtml(customerEmail)})<br><strong>Reason:</strong> ${escapeHtml(reason || 'No reason provided')}<br><strong>Payment status:</strong> ${escapeHtml(order.payment_status)}</p>${order.payment_status === 'paid' ? '<p><strong>Action required:</strong> review and process the refund in Fygaro.</p>' : '<p>No refund action is currently required.</p>'}`,
        metadata: { order_number: order.order_number },
        templateVariables: {
          order_number: order.order_number,
          customer_name: order.customers?.full_name || 'N/A',
          customer_email: customerEmail,
          cancellation_reason: reason || 'No reason provided',
          payment_status: order.payment_status,
          refund_action: order.payment_status === 'paid'
            ? '<p><strong>Action required:</strong> review and process the refund in Fygaro.</p>'
            : '<p>No refund action is currently required.</p>'
        }
      });
    }

    return res.status(200).json({ success: true, orderNumber });

  } catch (err) {
    console.error('[Cancel Order] API Error:', err);
    return res.status(500).json({ error: 'Failed to request order cancellation. Please try again.' });
  }
}


// ── Static Files serving ──
app.get('/api/orders/cancellation-details', async (req, res) => {
  try {
    const orderNumber = String(req.query.order || '').trim().slice(0, 80);
    const token = String(req.query.token || '').trim();
    if (!verifyOrderCancellationToken(orderNumber, token)) {
      return res.status(403).json({ error: 'This cancellation link is invalid. Use the link from your order email.' });
    }
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id,order_number,status,fulfillment_status,customers(email)')
      .eq('order_number', orderNumber)
      .maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const { data: pendingRequest, error: pendingError } = await supabaseAdmin
      .from('order_cancellation_requests')
      .select('id,status,created_at')
      .eq('order_id', order.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (pendingError) throw pendingError;
    const eligibility = cancellationEligibility(order);
    return res.status(200).json({
      orderNumber: order.order_number,
      maskedEmail: maskedEmail(order.customers?.email || ''),
      eligible: eligibility.eligible && !pendingRequest,
      eligibilityMessage: pendingRequest ? 'A cancellation request for this order is already waiting for review.' : eligibility.reason,
      pending: Boolean(pendingRequest)
    });
  } catch (error) {
    console.error('[Cancellation Details]', error.message);
    return res.status(500).json({ error: 'Unable to open this cancellation request.' });
  }
});

app.post('/api/orders/cancel', async (req, res) => {
  try {
    const orderNumber = String(req.body?.orderNumber || '').trim().slice(0, 80);
    const reason = String(req.body?.reason || '').trim().slice(0, 1000);
    const suppliedEmail = String(req.body?.email || '').trim().toLowerCase();
    const suppliedName = String(req.body?.fullName || '').trim().slice(0, 120);
    const suppliedPhone = String(req.body?.phone || '').trim().slice(0, 40);
    const suppliedToken = String(req.body?.token || '').trim();
    if (!orderNumber || reason.length < 5) {
      return res.status(400).json({ error: 'Select an order and provide a short reason for the request.' });
    }

    const { data: order, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('id,order_number,status,fulfillment_status,payment_status,grand_total_jmd,customers(full_name,email,phone)')
      .eq('order_number', orderNumber)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const customerEmail = String(order.customers?.email || '').trim().toLowerCase();
    let authenticatedUser = null;
    const authHeader = String(req.headers.authorization || '');
    if (authHeader.startsWith('Bearer ')) {
      const { data } = await supabaseAdmin.auth.getUser(authHeader.slice(7).trim());
      authenticatedUser = data?.user || null;
    }

    let requestSource = 'guest_email';
    if (authenticatedUser && String(authenticatedUser.email || '').trim().toLowerCase() === customerEmail) {
      requestSource = 'customer_account';
    } else {
      if (!verifyOrderCancellationToken(orderNumber, suppliedToken)) {
        return res.status(403).json({ error: 'Use the secure cancellation link from your order email.' });
      }
      if (!isValidEmail(suppliedEmail) || suppliedEmail !== customerEmail) {
        return res.status(400).json({ error: 'The email address does not match this order.' });
      }
    }

    const eligibility = cancellationEligibility(order);
    if (!eligibility.eligible) return res.status(409).json({ error: eligibility.reason });

    const requestRecord = {
      order_id: order.id,
      order_number: order.order_number,
      customer_name: suppliedName || order.customers?.full_name || 'Customer',
      customer_email: customerEmail,
      customer_phone: suppliedPhone || order.customers?.phone || null,
      reason,
      request_source: requestSource,
      requested_by_user_id: authenticatedUser?.id || null,
      status: 'pending'
    };
    const { data: cancellationRequest, error: insertError } = await supabaseAdmin
      .from('order_cancellation_requests')
      .insert(requestRecord)
      .select('id,status,created_at')
      .single();
    if (insertError?.code === '23505') {
      return res.status(409).json({ error: 'A cancellation request for this order is already waiting for review.' });
    }
    if (insertError) throw insertError;

    const refundMessage = order.payment_status === 'paid'
      ? '<p>If the cancellation is approved, payment and refund handling will be reviewed separately. We will email you with the next step.</p>'
      : '<p>No refund action is currently expected because payment is not marked paid.</p>';
    await queueEmail({
      orderId: order.id,
      recipient: customerEmail,
      emailType: 'order_cancelled',
      subject: `Cancellation request received - ${order.order_number}`,
      html: `<p>We received your request to cancel <strong>${escapeHtml(order.order_number)}</strong>. Your order remains active while our team reviews it.</p>`,
      metadata: { order_number: order.order_number, cancellation_request_id: cancellationRequest.id },
      templateVariables: {
        customer_name: requestRecord.customer_name,
        order_number: order.order_number,
        payment_status: order.payment_status,
        cancellation_reason: reason,
        refund_message: refundMessage
      }
    });
    await queueEmail({
      orderId: order.id,
      recipient: OWNER_EMAIL,
      emailType: 'owner_order_cancelled',
      subject: `Cancellation review needed - ${order.order_number}`,
      html: `<p>A cancellation request for <strong>${escapeHtml(order.order_number)}</strong> is waiting in Admin Orders.</p>`,
      metadata: { order_number: order.order_number, cancellation_request_id: cancellationRequest.id },
      templateVariables: {
        order_number: order.order_number,
        customer_name: requestRecord.customer_name,
        customer_email: customerEmail,
        cancellation_reason: reason,
        payment_status: order.payment_status,
        request_source: requestSource === 'customer_account' ? 'Customer account' : 'Guest email link',
        admin_orders_url: `${SERVER_BASE_URL}/admin/orders.html`,
        refund_action: order.payment_status === 'paid'
          ? '<p><strong>Paid order:</strong> if approved, process the refund in Fygaro separately and then update the payment status.</p>'
          : '<p>No refund action is currently expected.</p>'
      }
    });
    return res.status(202).json({ success: true, status: 'pending_review', requestId: cancellationRequest.id, orderNumber });
  } catch (error) {
    console.error('[Cancel Order]', error.message);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to submit the cancellation request.' });
  }
});

app.patch('/api/admin/cancellation-requests/:id', async (req, res) => {
  try {
    const adminUser = await requireAdmin(req);
    const requestId = String(req.params.id || '').trim();
    const action = String(req.body?.action || '').trim().toLowerCase();
    const adminNote = String(req.body?.admin_note || '').trim().slice(0, 1000);
    if (!['approve', 'decline'].includes(action)) return res.status(400).json({ error: 'Choose approve or decline.' });
    if (adminNote.length < 3) return res.status(400).json({ error: 'Add a short note explaining the decision.' });

    const { data: requestRow, error: requestError } = await supabaseAdmin
      .from('order_cancellation_requests')
      .select('*,orders(id,order_number,status,fulfillment_status,payment_status,admin_notes,customers(full_name,email))')
      .eq('id', requestId)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!requestRow) return res.status(404).json({ error: 'Cancellation request not found.' });
    if (requestRow.status !== 'pending') return res.status(409).json({ error: 'This request has already been reviewed.' });
    const order = requestRow.orders;
    if (!order) return res.status(404).json({ error: 'The related order no longer exists.' });
    if (action === 'approve') {
      const eligibility = cancellationEligibility(order);
      if (!eligibility.eligible) return res.status(409).json({ error: eligibility.reason });
    }

    const decision = action === 'approve' ? 'approved' : 'declined';
    const reviewedAt = new Date().toISOString();
    const { error: decisionError } = await supabaseAdmin
      .from('order_cancellation_requests')
      .update({ status: decision, reviewed_by: adminUser.id, reviewed_at: reviewedAt, admin_note: adminNote, updated_at: reviewedAt })
      .eq('id', requestId)
      .eq('status', 'pending');
    if (decisionError) throw decisionError;

    if (action === 'approve') {
      const note = `[Cancellation approved ${reviewedAt}] ${adminNote}${order.payment_status === 'paid' ? ' Paid order: Fygaro refund review required.' : ''}`;
      const { error: orderUpdateError } = await supabaseAdmin
        .from('orders')
        .update({ status: 'cancelled', admin_notes: order.admin_notes ? `${note}\n\n${order.admin_notes}` : note, updated_at: reviewedAt })
        .eq('id', order.id);
      if (orderUpdateError) {
        await supabaseAdmin.from('order_cancellation_requests').update({ status: 'pending', reviewed_by: null, reviewed_at: null, admin_note: null, updated_at: reviewedAt }).eq('id', requestId);
        throw orderUpdateError;
      }
    }

    const customerEmail = requestRow.customer_email || order.customers?.email;
    if (customerEmail) {
      const approved = action === 'approve';
      await queueEmail({
        orderId: order.id,
        recipient: customerEmail,
        emailType: approved ? 'cancellation_request_approved' : 'cancellation_request_declined',
        subject: approved ? `Cancellation approved - ${order.order_number}` : `Update on your cancellation request - ${order.order_number}`,
        html: approved
          ? `<p>Your cancellation request for <strong>${escapeHtml(order.order_number)}</strong> was approved.</p>`
          : `<p>Your cancellation request for <strong>${escapeHtml(order.order_number)}</strong> could not be approved.</p>`,
        metadata: { order_number: order.order_number, cancellation_request_id: requestId, decision },
        templateVariables: {
          customer_name: requestRow.customer_name || order.customers?.full_name || 'Customer',
          order_number: order.order_number,
          admin_note: adminNote,
          refund_message: approved && order.payment_status === 'paid'
            ? '<p>Our team will contact you separately when the Fygaro refund has been processed. Bank posting times may vary.</p>'
            : '<p>No refund action is expected for this order.</p>'
        }
      });
    }
    return res.status(200).json({ success: true, status: decision, order_status: action === 'approve' ? 'cancelled' : order.status });
  } catch (error) {
    console.error('[Cancellation Review]', error.message);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to review this cancellation request.' });
  }
});

// Serve all files from current directory
// Fygaro redirects successful payments here. This must be registered before
// the static-site fallback or the customer will be sent to the home page.
app.get('/api/fygaro-return', (req, res) => {
  const suppliedOrderRef = String(
    req.query.customReference ||
    req.query.custom_reference ||
    req.query.client_reference ||
    req.query.ref ||
    ''
  ).trim();
  const orderRef = /^FSB-\d{8}-\d{4}$/.test(suppliedOrderRef) ? suppliedOrderRef : '';
  const paymentReference = String(req.query.reference || req.query.transactionId || '').trim().slice(0, 160);
  const destination = new URLSearchParams();

  if (orderRef) {
    destination.set('ref', orderRef);
    destination.set('token', orderAccessToken(orderRef));
  }
  if (paymentReference) destination.set('reference', paymentReference);

  const query = destination.toString();
  return res.redirect(303, `/payment-success.html${query ? `?${query}` : ''}`);
});

app.get('/api/fygaro-integration-info', (req, res) => {
  const origin = requestOrigin(req);
  return res.status(200).json({
    configured: Boolean(FYGARO_API_KEY && FYGARO_API_SECRET && FYGARO_BUTTON_URL),
    return_url: `${origin}/api/fygaro-return`,
    webhook_url: `${origin}/api/fygaro-webhook`
  });
});

app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// Fallback to index.html for SPA-like behavior (optional, if using client side routing)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (RESEND_API_KEY) {
    setTimeout(() => processPendingEmails().catch((error) => {
      console.error('[Email Outbox] Startup processing failed:', error.message);
    }), 1500);
    const emailOutboxTimer = setInterval(() => processPendingEmails().catch((error) => {
      console.error('[Email Outbox] Scheduled processing failed:', error.message);
    }), 5 * 60 * 1000);
    emailOutboxTimer.unref();
  } else {
    console.log('[Email Outbox] Resend is prewired but inactive. Add RESEND_API_KEY, FROM_EMAIL, and OWNER_EMAIL to enable delivery.');
  }
});
