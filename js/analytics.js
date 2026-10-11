/**
 * analytics.js — Google Analytics 4 tracking for For You Skin Bar.
 *
 * What this file does
 *  1. Provides window.ForyouAnalytics — the full GA4 e-commerce funnel
 *     (view_item_list, select_item, view_item, add_to_cart, remove_from_cart,
 *     view_cart, begin_checkout, add_shipping_info, add_payment_info, purchase)
 *     plus search, sign_up, login, generate_lead, share and WhatsApp/contact clicks.
 *  2. Keeps window.trackEvent(name, data) working for the older custom events
 *     (newsletter_signup, quiz_start, contact_submit, ...). Those still have
 *     personal data stripped before anything is sent to Google.
 *  3. When loaded by Node (server.js / analytics-server.js) it only exports the
 *     pure helper functions, so the browser and the server build exactly the
 *     same GA4 item/purchase structures.
 *
 * Conventions (keep these consistent or GA4 reports split in two):
 *  - Currency is always JMD and amounts are the stored JMD values, never the
 *    converted display currency shown to overseas visitors.
 *  - item_id is the product's database id; the variant goes in item_variant.
 *  - item_name is the short product name (the long SEO title after " | " is dropped).
 *
 * Debugging: open any page with ?ga_debug=1 and events are logged to the console
 * and flagged for GA4 > Admin > DebugView. Use ?ga_debug=0 to switch it off again.
 */
(function () {
  'use strict';

  var MEASUREMENT_ID = 'G-Q4B00DQG7H';
  var CURRENCY = 'JMD';
  var BRAND = 'Foryou Skin Bar';

  // ───────────────────────── Pure helpers (shared with Node) ─────────────────────────

  function round2(value) {
    var n = Number(value);
    return isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  // "Bold Touch Body Butter | Luxury Body Butter ... - 8oz" -> "Bold Touch Body Butter"
  function cleanItemName(fullName, variantName) {
    var name = String(fullName || '').trim();
    if (variantName) {
      var suffix = ' - ' + variantName;
      if (name.slice(-suffix.length) === suffix) name = name.slice(0, -suffix.length);
    }
    var cut = name.indexOf(' | ');
    if (cut > 0) name = name.slice(0, cut);
    return name.trim().slice(0, 100);
  }

  // Some categories are stored as "Category A;Category B". GA4 supports up to 5 levels.
  function categoryFields(category) {
    var out = {};
    String(category || '').split(';').map(function (part) { return part.trim(); })
      .filter(Boolean).slice(0, 5).forEach(function (part, index) {
        out[index === 0 ? 'item_category' : 'item_category' + (index + 1)] = part.slice(0, 100);
      });
    return out;
  }

  // p: { id, name, variantName, category, price, quantity, discount, listId, listName, index }
  function buildItem(p) {
    var item = {
      item_id: String(p.id),
      item_name: cleanItemName(p.name, p.variantName),
      item_brand: BRAND
    };
    Object.assign(item, categoryFields(p.category));
    if (p.variantName) item.item_variant = String(p.variantName).slice(0, 100);
    if (p.listId) item.item_list_id = String(p.listId);
    if (p.listName) item.item_list_name = String(p.listName);
    if (p.index !== undefined && p.index !== null) item.index = p.index;
    item.price = round2(p.price);
    item.quantity = Math.max(1, parseInt(p.quantity, 10) || 1);
    if (p.discount) item.discount = round2(p.discount);
    return item;
  }

  function itemsValue(items) {
    return round2((items || []).reduce(function (sum, item) {
      return sum + (Number(item.price) || 0) * (Number(item.quantity) || 1);
    }, 0));
  }

  /**
   * Builds the GA4 `purchase` event for a paid order.
   *  order: { order_number, grand_total_jmd, subtotal_jmd, discount_total_jmd,
   *           shipping_total_jmd, discount_code }
   *  orderItems: [{ product_id, product_name, variant_name, unit_price_jmd, quantity, line_total_jmd }]
   *  productInfo: { [product_id]: { name, category } }   (optional, authoritative names/categories)
   *
   * `value` equals grand_total_jmd, exactly what the admin dashboard counts as revenue
   * (items after discount + shipping). Per Google's guidance an order-level discount is
   * pushed down to the items (price = discounted unit price, discount = unit discount).
   */
  function buildPurchaseEvent(order, orderItems, productInfo) {
    var info = productInfo || {};
    var lines = (orderItems || []).map(function (row) {
      var quantity = Math.max(1, parseInt(row.quantity, 10) || 1);
      var unit = Number(row.unit_price_jmd);
      if (!isFinite(unit) || unit <= 0) unit = (Number(row.line_total_jmd) || 0) / quantity;
      return { row: row, quantity: quantity, unit: unit, line: unit * quantity };
    });
    var gross = lines.reduce(function (sum, l) { return sum + l.line; }, 0);
    var discountTotal = Math.max(0, Number(order.discount_total_jmd) || 0);

    var items = lines.map(function (l) {
      var unitDiscount = gross > 0 ? round2(((l.line / gross) * discountTotal) / l.quantity) : 0;
      var known = info[l.row.product_id] || {};
      return buildItem({
        id: l.row.product_id || l.row.sku || l.row.product_name,
        name: known.name || l.row.product_name,
        variantName: l.row.variant_name,
        category: known.category,
        price: l.unit - unitDiscount,
        discount: unitDiscount,
        quantity: l.quantity
      });
    });

    var shipping = round2(order.shipping_total_jmd);
    var value = Number(order.grand_total_jmd);
    if (!isFinite(value) || value <= 0) value = itemsValue(items) + shipping;

    var event = {
      transaction_id: String(order.order_number),
      value: round2(value),
      currency: CURRENCY,
      shipping: shipping,
      items: items
    };
    if (order.discount_code) event.coupon = String(order.discount_code).slice(0, 100);
    return event;
  }

  var shared = {
    MEASUREMENT_ID: MEASUREMENT_ID,
    CURRENCY: CURRENCY,
    BRAND: BRAND,
    round2: round2,
    cleanItemName: cleanItemName,
    categoryFields: categoryFields,
    buildItem: buildItem,
    itemsValue: itemsValue,
    buildPurchaseEvent: buildPurchaseEvent
  };

  // Loaded by Node: expose the helpers only.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = shared;
    return;
  }
  if (typeof window === 'undefined') return;

  // ───────────────────────────── Browser: sending events ─────────────────────────────

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function () { window.dataLayer.push(arguments); };
  }

  var isLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  var DEBUG = (function () {
    try {
      var flag = new URLSearchParams(window.location.search).get('ga_debug');
      if (flag === '1') window.sessionStorage.setItem('ga_debug', '1');
      if (flag === '0') window.sessionStorage.removeItem('ga_debug');
      return window.sessionStorage.getItem('ga_debug') === '1';
    } catch (e) { return false; }
  })();

  // Analytics must never be able to break the shop, so everything is wrapped.
  function send(eventName, params) {
    try {
      var payload = Object.assign({}, params);
      if (DEBUG) payload.debug_mode = true;
      window.gtag('event', eventName, payload);
      if (DEBUG || isLocal) console.log('[GA4] ' + eventName, payload);
    } catch (e) { /* ignore */ }
  }

  function ecommerce(eventName, items, extra) {
    if (!items || !items.length) return;
    var params = Object.assign({ currency: CURRENCY, value: itemsValue(items) }, extra || {}, { items: items });
    send(eventName, params);
  }

  // ───────────────────────────── Item builders ─────────────────────────────

  function productVariantInfo(product, opts) {
    opts = opts || {};
    var variantName = opts.variantName || null;
    var price = opts.price;
    if (!variantName && product.variants && product.variants.length && opts.useFirstVariant) {
      variantName = product.variants[0].name;
      if (price === undefined || price === null) price = product.variants[0].price;
    }
    if (price === undefined || price === null || isNaN(Number(price))) price = product.price;
    return { variantName: variantName, price: price };
  }

  function itemFromProduct(product, opts) {
    opts = opts || {};
    var v = productVariantInfo(product, opts);
    return buildItem({
      id: product.id,
      name: product.name,
      variantName: v.variantName,
      category: product.category,
      price: v.price,
      quantity: opts.quantity || 1,
      listId: opts.listId,
      listName: opts.listName,
      index: opts.index
    });
  }

  // Lists show the product's lowest price (variants are chosen later), matching the shop grid.
  function listPrice(product) {
    var prices = (product.variants || []).map(function (v) { return Number(v.price); }).filter(function (n) { return isFinite(n) && n > 0; });
    return prices.length ? Math.min.apply(null, prices) : product.price;
  }

  function itemFromCartItem(cartItem) {
    return buildItem({
      id: cartItem.productId || cartItem.id,
      name: cartItem.name,
      variantName: cartItem.variantName,
      category: cartItem.category,
      price: cartItem.price,
      quantity: cartItem.qty || cartItem.quantity || 1
    });
  }

  function slug(value) {
    return String(value || 'list').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'list';
  }

  // ───────────────────────────── Funnel events ─────────────────────────────

  var lastLists = {};      // listId -> product ids in last emitted order (for select_item index)
  var lastListSent = {};   // listId -> { signature, time } (stops duplicate re-renders)
  var viewedItems = {};    // product id -> true (one view_item per product per page load)

  function viewItemList(products, listName, listId) {
    try {
      if (!products || !products.length) return;
      listId = listId || slug(listName);
      var capped = products.slice(0, 40);
      var signature = capped.map(function (p) { return p.id; }).join(',');
      var previous = lastListSent[listId];
      if (previous && previous.signature === signature && Date.now() - previous.time < 2500) return;
      lastListSent[listId] = { signature: signature, time: Date.now() };
      lastLists[listId] = capped.map(function (p) { return String(p.id); });
      var items = capped.map(function (p, index) {
        return itemFromProduct(p, { listId: listId, listName: listName, index: index, price: listPrice(p) });
      });
      send('view_item_list', { item_list_id: listId, item_list_name: listName, items: items });
    } catch (e) { /* ignore */ }
  }

  function selectItem(product, listName, listId) {
    try {
      listId = listId || slug(listName);
      var position = (lastLists[listId] || []).indexOf(String(product.id));
      var item = itemFromProduct(product, {
        listId: listId, listName: listName, index: position >= 0 ? position : 0, price: listPrice(product)
      });
      send('select_item', { item_list_id: listId, item_list_name: listName, items: [item] });
    } catch (e) { /* ignore */ }
  }

  function viewItem(product, opts) {
    try {
      opts = opts || {};
      if (!product || viewedItems[product.id]) return;
      viewedItems[product.id] = true;
      var item = itemFromProduct(product, { useFirstVariant: true, listName: opts.listName });
      ecommerce('view_item', [item]);
    } catch (e) { /* ignore */ }
  }

  function addToCart(item) {
    try { ecommerce('add_to_cart', [item]); } catch (e) { /* ignore */ }
  }

  function removeFromCart(item) {
    try { ecommerce('remove_from_cart', [item]); } catch (e) { /* ignore */ }
  }

  function viewCart(cartItems) {
    try { ecommerce('view_cart', (cartItems || []).map(itemFromCartItem)); } catch (e) { /* ignore */ }
  }

  function cartSignature(cartItems) {
    return (cartItems || []).map(function (c) { return (c.id || c.productId) + 'x' + (c.qty || c.quantity); }).join('|');
  }

  // Once per cart per browser tab session, so refreshing checkout doesn't inflate the funnel.
  function beginCheckout(cartItems) {
    try {
      if (!cartItems || !cartItems.length) return;
      var key = 'ga_begin_checkout';
      var signature = cartSignature(cartItems);
      try {
        if (window.sessionStorage.getItem(key) === signature) return;
        window.sessionStorage.setItem(key, signature);
      } catch (e) { /* storage blocked: just send */ }
      ecommerce('begin_checkout', cartItems.map(itemFromCartItem));
    } catch (e) { /* ignore */ }
  }

  function checkoutStep(eventName, cartItems, opts) {
    try {
      opts = opts || {};
      var items = (cartItems || []).map(itemFromCartItem);
      if (!items.length) return;
      var extra = {};
      if (opts.coupon) extra.coupon = String(opts.coupon).slice(0, 100);
      if (opts.shippingTier) extra.shipping_tier = String(opts.shippingTier).slice(0, 100);
      if (opts.paymentType) extra.payment_type = String(opts.paymentType).slice(0, 100);
      var value = Math.max(0, itemsValue(items) - (Number(opts.discount) || 0));
      send(eventName, Object.assign({ currency: CURRENCY, value: round2(value) }, extra, { items: items }));
    } catch (e) { /* ignore */ }
  }

  function addShippingInfo(cartItems, opts) { checkoutStep('add_shipping_info', cartItems, opts); }
  function addPaymentInfo(cartItems, opts) { checkoutStep('add_payment_info', cartItems, opts); }

  // `event` comes from the server (buildPurchaseEvent) so browser and server agree exactly.
  // Sent once per transaction per browser; GA4 also de-duplicates on transaction_id.
  function purchase(event) {
    try {
      if (!event || !event.transaction_id) return false;
      var key = 'ga_purchase_' + event.transaction_id;
      try {
        if (window.localStorage.getItem(key)) return false;
      } catch (e) { /* storage blocked: just send */ }
      send('purchase', event);
      try { window.localStorage.setItem(key, String(Date.now())); } catch (e) { /* ignore */ }
      return true;
    } catch (e) { return false; }
  }

  // ───────────────────────────── Other conversions / engagement ─────────────────────────────

  function search(term) {
    var text = String(term || '').trim().toLowerCase();
    if (text.length < 2) return;
    send('search', { search_term: text.slice(0, 100) });
  }
  function signUp(method) { send('sign_up', { method: method || 'email' }); }
  function login(method) { send('login', { method: method || 'email' }); }
  function generateLead(source) { send('generate_lead', { lead_source: String(source || 'website').slice(0, 100) }); }
  function share(method, contentType, itemId) {
    send('share', { method: method, content_type: contentType || 'article', item_id: String(itemId || '').slice(0, 100) });
  }
  function applyCoupon(code, success) {
    send('apply_coupon', { coupon: String(code || '').slice(0, 100), success: !!success });
  }
  function whatsappClick(where) {
    send('whatsapp_click', { click_location: where || window.location.pathname });
  }

  // ───────────────────────────── GA identifiers (for server-side tracking) ─────────────────────────────

  function readCookie(name) {
    try {
      var match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    } catch (e) { return null; }
  }

  function clientIdFromCookie() {
    var value = readCookie('_ga');            // GA1.1.1234567890.1234567890
    if (!value) return null;
    var parts = value.split('.');
    return parts.length >= 4 ? parts.slice(-2).join('.') : null;
  }

  function sessionIdFromCookie() {
    var value = readCookie('_ga_' + MEASUREMENT_ID.replace(/^G-/, ''));
    if (!value) return null;
    var match = value.match(/^GS1\.\d+\.(\d+)\./) || value.match(/^GS2\.\d+\.s(\d+)/);
    return match ? match[1] : null;
  }

  function gtagGet(field, timeoutMs) {
    return new Promise(function (resolve) {
      var finished = false;
      var timer = setTimeout(function () { if (!finished) { finished = true; resolve(null); } }, timeoutMs);
      try {
        window.gtag('get', MEASUREMENT_ID, field, function (value) {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          resolve(value === undefined || value === null ? null : String(value));
        });
      } catch (e) { clearTimeout(timer); resolve(null); }
    });
  }

  // Resolves with { clientId, sessionId } (either may be null when GA is blocked).
  function getIdentifiers(timeoutMs) {
    timeoutMs = timeoutMs || 800;
    var clientId = clientIdFromCookie();
    var sessionId = sessionIdFromCookie();
    if (clientId && sessionId) return Promise.resolve({ clientId: clientId, sessionId: sessionId });
    return Promise.all([
      clientId ? Promise.resolve(clientId) : gtagGet('client_id', timeoutMs),
      sessionId ? Promise.resolve(sessionId) : gtagGet('session_id', timeoutMs)
    ]).then(function (values) { return { clientId: values[0], sessionId: values[1] }; });
  }

  // ───────────────────────────── Public API ─────────────────────────────

  window.ForyouAnalytics = Object.assign({}, shared, {
    debug: DEBUG,
    send: send,
    itemFromProduct: itemFromProduct,
    itemFromCartItem: itemFromCartItem,
    viewItemList: viewItemList,
    selectItem: selectItem,
    viewItem: viewItem,
    addToCart: addToCart,
    removeFromCart: removeFromCart,
    viewCart: viewCart,
    beginCheckout: beginCheckout,
    addShippingInfo: addShippingInfo,
    addPaymentInfo: addPaymentInfo,
    purchase: purchase,
    search: search,
    signUp: signUp,
    login: login,
    generateLead: generateLead,
    share: share,
    applyCoupon: applyCoupon,
    whatsappClick: whatsappClick,
    getIdentifiers: getIdentifiers
  });

  // ───────────────────────────── Legacy trackEvent (custom events) ─────────────────────────────

  // Google forbids personal data in event parameters. Some call sites pass raw form
  // fields (e.g. newsletter_signup includes { email }); strip those before gtag().
  var PII_KEY_PATTERN = /email|phone|name|address/i;
  function stripPii(data) {
    var safe = {};
    Object.keys(data || {}).forEach(function (key) {
      var value = data[key];
      if (PII_KEY_PATTERN.test(key)) return;
      if (typeof value === 'string' && value.indexOf('@') !== -1) return;
      safe[key] = value;
    });
    return safe;
  }

  window.trackEvent = function (eventName, eventData) {
    eventData = eventData || {};
    window.dataLayer.push(Object.assign({
      event: eventName,
      timestamp: new Date().toISOString(),
      page: window.location.pathname
    }, eventData));

    // page_view is sent automatically by gtag('config'), forwarding it would double count.
    if (eventName !== 'page_view') send(eventName, stripPii(eventData));
  };

  window.trackEvent('page_view', { page_title: document.title, page_path: window.location.pathname });

  // ───────────────────────────── Automatic click tracking ─────────────────────────────

  function listNameForLink(anchor) {
    var tagged = anchor.closest ? anchor.closest('[data-ga-list]') : null;
    if (tagged) return tagged.getAttribute('data-ga-list');
    var path = window.location.pathname.replace(/^\//, '').replace(/\.html$/, '') || 'index';
    if (path === 'shop') return anchor.closest && anchor.closest('#searchResults') ? 'Shop search results' : 'Shop';
    if (path === 'index') return 'Home featured';
    if (path === 'product') return 'Related products';
    return 'Site';
  }

  function productFromLink(anchor) {
    try {
      var url = new URL(anchor.getAttribute('href'), window.location.href);
      var id = url.searchParams.get('id');
      return id && window.productsData ? window.productsData.find(function (p) { return String(p.id) === String(id); }) : null;
    } catch (e) { return null; }
  }

  document.addEventListener('click', function (event) {
    try {
      var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
      if (!anchor) return;
      var href = anchor.getAttribute('href') || '';

      if (/(^|\/\/)(wa\.me|api\.whatsapp\.com)\//i.test(href)) {
        whatsappClick(window.location.pathname);
      } else if (/^tel:/i.test(href)) {
        send('contact_click', { method: 'phone' });
      } else if (/^mailto:/i.test(href)) {
        send('contact_click', { method: 'email' });
      } else if (/product\.html\?id=/i.test(href)) {
        var product = productFromLink(anchor);
        if (product) selectItem(product, listNameForLink(anchor));
      }
    } catch (e) { /* ignore */ }
  }, true);
})();
