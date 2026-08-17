/**
 * analytics.js — Lightweight event tracking for For You Skin Bar
 * Logs events to console in dev, pushes to dataLayer for GTM integration,
 * and forwards events to GA4 via gtag() (installed in <head> on every page).
 */
(function() {
  // Initialize dataLayer for Google Tag Manager
  window.dataLayer = window.dataLayer || [];

  // Google/GA4 prohibits sending personally identifiable information (emails,
  // names, phone numbers, etc.) as event parameters. Some existing call sites
  // pass raw form fields (e.g. newsletter_signup includes { email }) that are
  // fine for the internal dataLayer/GTM push below, but must be stripped
  // before anything goes to gtag()/GA4 directly.
  const PII_KEY_PATTERN = /email|phone|name|address|first_?name|last_?name/i;
  function stripPii(data) {
    const safe = {};
    Object.keys(data || {}).forEach((key) => {
      const value = data[key];
      if (PII_KEY_PATTERN.test(key)) return;
      if (typeof value === 'string' && value.includes('@')) return;
      safe[key] = value;
    });
    return safe;
  }

  /**
   * Track a custom event
   * @param {string} eventName - Event name (e.g., 'add_to_cart', 'quiz_complete')
   * @param {object} eventData - Additional event data
   */
  window.trackEvent = function(eventName, eventData = {}) {
    const event = {
      event: eventName,
      timestamp: new Date().toISOString(),
      page: window.location.pathname,
      ...eventData
    };

    // Push to GTM dataLayer (used if/when a GTM container is added later)
    window.dataLayer.push(event);

    // Forward to GA4 directly via gtag(), which is loaded in <head> on every
    // page. 'page_view' is skipped here because gtag('config', ...) already
    // sends it automatically on load — forwarding it too would double-count
    // pageviews in GA4. PII is stripped before it ever reaches Google.
    if (eventName !== 'page_view' && typeof window.gtag === 'function') {
      window.gtag('event', eventName, stripPii(eventData));
    }

    // Console log in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log(`📊 Event: ${eventName}`, eventData);
    }
  };

  // ── Auto-track page views ──
  window.trackEvent('page_view', {
    page_title: document.title,
    page_path: window.location.pathname
  });

})();
