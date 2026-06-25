// Shared admin navigation and operational integration layer.
const fs = require('fs');
const path = require('path');
const express = require('express');

const previousStatic = express.static.bind(express);
const quizRulesLink = '<a href="/admin/recommendation-rules.html" class="block text-stone-300 hover:bg-stone-800 hover:text-white px-5 py-3 transition">Quiz Rules</a>';
const adminIntegration = '<script id="adminOperationalIntegration" type="module" src="/admin/js/admin-integration.js?v=1"></script>';

express.static = function adminExperienceStatic(root, options) {
  const fallback = previousStatic(root, options);

  return function deliverAdminExperience(req, res, next) {
    const pathname = (req.url || '').split('?')[0];
    const isAdminPage = req.method === 'GET' && /^\/admin\/[^/]+\.html$/.test(pathname);
    if (!isAdminPage) return fallback(req, res, next);

    const needsQuizNavigation = pathname !== '/admin/products.html'
      && pathname !== '/admin/recommendation-rules.html';
    const needsOrderIntegration = pathname === '/admin/orders.html';

    if (!needsQuizNavigation && !needsOrderIntegration) return fallback(req, res, next);

    const pagePath = path.join(root, 'admin', path.basename(pathname));
    fs.readFile(pagePath, 'utf8', (error, html) => {
      if (error) return next(error);

      let updated = html;
      if (needsQuizNavigation && !updated.includes('href="/admin/recommendation-rules.html"')) {
        updated = updated.replace(
          /(<a href="\/admin\/discounts\.html"[^>]*>Discounts<\/a>)/,
          `$1\n        ${quizRulesLink}`
        );
      }
      if (needsOrderIntegration && !updated.includes('id="adminOperationalIntegration"')) {
        updated = updated.replace('</body>', `${adminIntegration}\n</body>`);
      }

      res.status(200);
      res.type('html');
      res.set('Cache-Control', 'no-store, max-age=0');
      return res.send(updated);
    });
  };
};
