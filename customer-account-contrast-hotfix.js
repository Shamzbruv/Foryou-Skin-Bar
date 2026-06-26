// Ensures account-specific contrast overrides are applied after all global
// storefront theme styles, without altering unrelated pages.
const express = require('express');

const previousStatic = express.static.bind(express);
const contrastLink = '<link id="customerAccountContrastFix" rel="stylesheet" href="css/customer-account-contrast-fix.css?v=1">';

express.static = function customerAccountContrastStatic(root, options) {
  const fallback = previousStatic(root, options);

  return function deliverCustomerAccountContrast(req, res, next) {
    const pathname = (req.url || '').split('?')[0];
    const isAccountPage = req.method === 'GET' && (
      pathname === '/account.html'
      || pathname === '/customer-login.html'
    );

    if (!isAccountPage) return fallback(req, res, next);

    const originalSend = res.send.bind(res);
    res.send = function sendWithAccountContrast(body) {
      if (typeof body === 'string' && !body.includes('id="customerAccountContrastFix"')) {
        return originalSend(body.replace('</head>', `${contrastLink}\n</head>`));
      }
      return originalSend(body);
    };

    return fallback(req, res, next);
  };
};
