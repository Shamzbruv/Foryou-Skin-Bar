const express = require('express');
const previousStatic = express.static.bind(express);

const contrastStyle = `<style id="customerAccountContrastFix">
.account-auth-aside,.account-auth-aside h1,.account-auth-aside h2,.account-auth-aside h3,.account-auth-aside p,.account-auth-aside span,.account-auth-aside strong,.account-auth-aside .account-auth-benefit{color:#fffdf8!important}.account-auth-aside .account-auth-kicker,.account-auth-aside .account-auth-kicker i,.account-auth-aside h1 em,.account-auth-aside .account-auth-benefit i{color:#f4d98e!important}.account-auth-aside p,.account-auth-aside .account-auth-benefit{color:rgba(255,253,248,.9)!important}.account-hero,.account-hero h1,.account-hero h2,.account-hero h3,.account-hero p,.account-hero span,.account-hero strong,.account-hero .account-outline{color:#fffdf8!important}.account-hero .account-eyebrow{color:#f4d98e!important}.account-hero p{color:rgba(255,253,248,.88)!important}.account-stat.highlight,.account-stat.highlight h1,.account-stat.highlight h2,.account-stat.highlight h3,.account-stat.highlight p,.account-stat.highlight span,.account-stat.highlight strong,.loyalty-summary,.loyalty-summary h1,.loyalty-summary h2,.loyalty-summary h3,.loyalty-summary h4,.loyalty-summary p,.loyalty-summary span,.loyalty-summary strong,.loyalty-summary .loyalty-tier-pill{color:#fffdf8!important}.loyalty-summary .account-eyebrow,.loyalty-summary .loyalty-points{color:#f4d98e!important}.account-stat.highlight .stat-caption,.loyalty-summary p,.loyalty-summary .loyalty-next{color:rgba(255,253,248,.84)!important}
</style>`;

express.static = function customerAccountContrastStatic(root, options) {
  const fallback = previousStatic(root, options);
  return function deliverCustomerAccountContrast(req, res, next) {
    const pathname = (req.url || '').split('?')[0];
    const isAccountPage = req.method === 'GET' && (pathname === '/account.html' || pathname === '/customer-login.html');
    if (!isAccountPage) return fallback(req, res, next);
    const originalSend = res.send.bind(res);
    res.send = function sendWithAccountContrast(body) {
      if (typeof body === 'string' && !body.includes('id="customerAccountContrastFix"')) {
        return originalSend(body.replace('</head>', `${contrastStyle}\n</head>`));
      }
      return originalSend(body);
    };
    return fallback(req, res, next);
  };
};
