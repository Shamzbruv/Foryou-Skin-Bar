(function () {
  const FALLBACK = {
    detectedCountryCode: 'JM',
    detectedCountry: 'Jamaica',
    isInternational: false,
    displayCurrency: 'JMD',
    shipping: {
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
    }
  };

  let config = FALLBACK;

  function normalizeConfig(value) {
    const next = value && typeof value === 'object' ? value : {};
    return {
      ...FALLBACK,
      ...next,
      shipping: { ...FALLBACK.shipping, ...(next.shipping || {}) }
    };
  }

  function formatJmd(value, options = {}) {
    const amountJmd = Number(value) || 0;
    const useUsd = options.currency === 'USD' || (!options.currency && config.isInternational);
    if (useUsd) {
      const rate = Math.max(1, Number(config.shipping.usdToJmdRate) || FALLBACK.shipping.usdToJmdRate);
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amountJmd / rate).replace('$', 'US$');
    }
    return `J$${Math.round(amountJmd).toLocaleString('en-US')}`;
  }

  function formatUsd(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value) || 0).replace('$', 'US$');
  }

  function updateAnnouncement() {
    const banner = Array.from(document.querySelectorAll('body > div')).find((element) =>
      /free shipping/i.test(element.textContent || '') && /handcrafted/i.test(element.textContent || '')
    );
    if (!banner) return;
    if (config.isInternational) {
      const thresholdUsd = Number(config.shipping.internationalFreeThresholdJmd) / Math.max(1, Number(config.shipping.usdToJmdRate));
      banner.textContent = `Free international shipping on orders over ${formatUsd(thresholdUsd)} | Handcrafted with love in Jamaica`;
    } else {
      banner.textContent = `Free shipping in Jamaica on orders over J$${Number(config.shipping.domesticFreeThresholdJmd).toLocaleString()} | Handcrafted with love in Jamaica`;
    }
  }

  window.currencyManager = {
    get config() { return config; },
    get isInternational() { return Boolean(config.isInternational); },
    get displayCurrency() { return config.displayCurrency || 'JMD'; },
    formatJmd,
    formatUsd,
    toUsd(valueJmd) {
      return (Number(valueJmd) || 0) / Math.max(1, Number(config.shipping.usdToJmdRate) || 160);
    }
  };

  window.storefrontConfigReady = fetch('/api/storefront-config', {
    headers: {
      Accept: 'application/json',
      'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    }
  })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('Storefront configuration unavailable')))
    .then((value) => {
      config = normalizeConfig(value);
      window.storefrontConfig = config;
      updateAnnouncement();
      window.dispatchEvent(new CustomEvent('storefront:config-ready', { detail: config }));
      return config;
    })
    .catch(() => {
      config = FALLBACK;
      window.storefrontConfig = config;
      updateAnnouncement();
      window.dispatchEvent(new CustomEvent('storefront:config-ready', { detail: config }));
      return config;
    });
})();
