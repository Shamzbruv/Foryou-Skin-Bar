// Server-side Google Analytics 4 reporting (GA4 Measurement Protocol).
//
// Why this exists: customers pay on Fygaro's website, so the browser only reports a purchase if the
// customer comes back to payment-success.html (not guaranteed, and ad-blockers stop it too). This module
// reports `purchase` (and `refund`) from the server the moment the order's payment status changes, using
// the Google Analytics client/session ids the checkout page saved with the order, so the sale is still
// credited to the original visit (Instagram, Google, ...) rather than to "fygaro.com".
//
// It is switched on by one environment variable and does nothing without it:
//   GA4_API_SECRET        GA4 Admin > Data streams > (web stream) > Measurement Protocol API secrets
//   GA4_MEASUREMENT_ID    optional, defaults to the ID used by the site's tag (G-Q4B00DQG7H)
//
// The browser still sends its own `purchase` from the thank-you page. Both carry the same
// transaction_id (the order number), which GA4 uses to count a purchase only once.

const crypto = require('crypto');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const shared = require('./js/analytics.js');

const MP_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const MP_DEBUG_ENDPOINT = 'https://www.google-analytics.com/debug/mp/collect';

function createAnalyticsServer(options = {}) {
  const env = options.env || process.env;
  const log = options.log || console;
  const doFetch = options.fetch || ((...args) => fetch(...args));
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const retryDelaysMs = options.retryDelaysMs || [600, 2000];

  let db = options.db || null;
  const database = () => {
    if (!db) {
      db = createClient(
        env.SUPABASE_URL || 'https://xftnfbeembjrhezvzquu.supabase.co',
        env.SUPABASE_SERVICE_ROLE_KEY || '',
        { realtime: { transport: WebSocket } }
      );
    }
    return db;
  };

  const measurementId = () => String(env.GA4_MEASUREMENT_ID || shared.MEASUREMENT_ID);
  const apiSecret = () => String(env.GA4_API_SECRET || '').trim();
  const isConfigured = () => apiSecret().length > 0;

  // ───────────────────────── ids captured by the checkout page ─────────────────────────

  // Only accept values shaped like real GA ids; this comes from the browser, so never trust it blindly.
  function sanitizeIds(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const clientId = /^\d{3,12}\.\d{3,12}$/.test(String(raw.clientId || '')) ? String(raw.clientId) : null;
    const sessionId = /^\d{6,13}$/.test(String(raw.sessionId || '')) ? String(raw.sessionId) : null;
    return clientId || sessionId ? { clientId, sessionId } : null;
  }

  // Customers whose browser blocked GA have no client id. The sale still counts toward revenue under a
  // stable id derived from the order number (so a retry never creates a second "user").
  function syntheticClientId(orderNumber) {
    const digest = crypto.createHash('sha1').update('fsb-order:' + orderNumber).digest();
    return `${digest.readUInt32BE(0)}.${digest.readUInt32BE(4)}`;
  }

  // ───────────────────────── loading order data ─────────────────────────

  const loaders = Object.assign({
    async order(orderId) {
      const { data, error } = await database().from('orders')
        .select('id, order_number, payment_status, subtotal_jmd, discount_total_jmd, shipping_total_jmd, grand_total_jmd, discount_code')
        .eq('id', orderId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async items(orderId) {
      const { data, error } = await database().from('order_items')
        .select('product_id, product_name, variant_name, unit_price_jmd, quantity, line_total_jmd')
        .eq('order_id', orderId);
      if (error) throw error;
      return data || [];
    },
    async productInfo(productIds) {
      const ids = Array.from(new Set((productIds || []).filter(Boolean)));
      if (!ids.length) return {};
      const { data, error } = await database().from('products').select('id, name, categories(name)').in('id', ids);
      if (error) throw error;
      const info = {};
      (data || []).forEach((product) => {
        const category = Array.isArray(product.categories) ? product.categories[0] : product.categories;
        info[product.id] = { name: product.name, category: category && category.name };
      });
      return info;
    },
    async savedIds(orderNumber) {
      try {
        const { data, error } = await database().from('payment_checkout_sessions')
          .select('analytics_data').eq('checkout_reference', orderNumber).maybeSingle();
        if (error) return null;               // e.g. column not migrated yet: carry on without ids
        return sanitizeIds(data && data.analytics_data);
      } catch (error) { return null; }
    }
  }, options.loaders || {});

  // The GA4 `purchase` event for an order (used by the thank-you page AND the server-side send).
  async function purchaseEventFor(order, items) {
    let productInfo = {};
    try { productInfo = await loaders.productInfo((items || []).map((item) => item.product_id)); } catch (error) { /* names fall back to the order lines */ }
    return shared.buildPurchaseEvent(order, items || [], productInfo);
  }

  // ───────────────────────── sending ─────────────────────────

  async function post(body, { debug = false } = {}) {
    const url = `${debug ? MP_DEBUG_ENDPOINT : MP_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId())}&api_secret=${encodeURIComponent(apiSecret())}`;
    let lastError = null;
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const response = await doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (response.status >= 500) throw new Error(`GA4 responded ${response.status}`);
        if (debug) {
          const text = await response.text();
          let parsed = {};
          try { parsed = JSON.parse(text); } catch (error) { /* not JSON */ }
          return { ok: response.status < 300, status: response.status, validationMessages: parsed.validationMessages || [] };
        }
        return { ok: response.status < 300, status: response.status };
      } catch (error) {
        clearTimeout(timer);
        lastError = error;
        if (attempt < retryDelaysMs.length) await sleep(retryDelaysMs[attempt]);
      }
    }
    throw lastError || new Error('GA4 request failed');
  }

  function envelope(clientId, sessionId, name, params) {
    const eventParams = Object.assign({ engagement_time_msec: 100 }, params);
    if (sessionId) eventParams.session_id = Number(sessionId);
    return { client_id: clientId, events: [{ name, params: eventParams }] };
  }

  async function purchaseBody(orderId) {
    const order = await loaders.order(orderId);
    if (!order) return null;
    const items = await loaders.items(orderId);
    const event = await purchaseEventFor(order, items);
    const ids = await loaders.savedIds(order.order_number);
    return envelope((ids && ids.clientId) || syntheticClientId(order.order_number), ids && ids.sessionId, 'purchase', event);
  }

  async function refundBody(orderId) {
    const order = await loaders.order(orderId);
    if (!order) return null;
    const ids = await loaders.savedIds(order.order_number);
    const refund = {
      transaction_id: String(order.order_number),
      value: shared.round2(order.grand_total_jmd),
      currency: shared.CURRENCY
    };
    // No session id on purpose: the refund must not be counted as activity inside the original session.
    return envelope((ids && ids.clientId) || syntheticClientId(order.order_number), null, 'refund', refund);
  }

  async function sendPurchase(orderId, opts) {
    const body = await purchaseBody(orderId);
    if (!body) return { sent: false, reason: 'order not found' };
    const result = await post(body, opts);
    log.log(`[GA4] purchase ${body.events[0].params.transaction_id} reported from the server (HTTP ${result.status})`);
    return Object.assign({ sent: true, body }, result);
  }

  async function sendRefund(orderId, opts) {
    const body = await refundBody(orderId);
    if (!body) return { sent: false, reason: 'order not found' };
    const result = await post(body, opts);
    log.log(`[GA4] refund ${body.events[0].params.transaction_id} reported from the server (HTTP ${result.status})`);
    return Object.assign({ sent: true, body }, result);
  }

  // Call whenever orders.payment_status changes. Never throws and never blocks the caller's work.
  async function handlePaymentStatusChange(orderId, previousStatus, newStatus) {
    if (!isConfigured() || !orderId || previousStatus === newStatus) return;
    try {
      if (newStatus === 'paid' && previousStatus !== 'paid') await sendPurchase(orderId);
      else if (previousStatus === 'paid' && newStatus === 'refunded') await sendRefund(orderId);
    } catch (error) {
      log.error('[GA4] server-side event failed:', error.message);
    }
  }

  // Lets an admin confirm the API secret works: the event shows up in GA4 > Realtime / DebugView as "mp_test".
  async function sendTestEvent() {
    if (!isConfigured()) {
      return { configured: false, message: 'GA4_API_SECRET is not set, so server-side tracking is off.' };
    }
    const body = envelope(syntheticClientId('mp-test-' + Date.now()), null, 'mp_test', { debug_mode: 1, source: 'admin_check' });
    const validation = await post(body, { debug: true });
    const sent = await post(body);
    return { configured: true, measurementId: measurementId(), validationMessages: validation.validationMessages, status: sent.status };
  }

  if (!isConfigured()) {
    log.log('[GA4] server-side purchase tracking is OFF (set GA4_API_SECRET to enable it).');
  } else {
    log.log(`[GA4] server-side purchase tracking is ON for ${measurementId()}.`);
  }

  return {
    isConfigured, sanitizeIds, syntheticClientId, purchaseEventFor,
    sendPurchase, sendRefund, handlePaymentStatusChange, sendTestEvent,
    _bodies: { purchaseBody, refundBody }
  };
}

module.exports = createAnalyticsServer();
module.exports.createAnalyticsServer = createAnalyticsServer;
