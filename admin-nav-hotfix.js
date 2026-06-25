// Keeps the Quiz Rules link available in every admin sidebar while the shared
// navigation component is being consolidated.
const fs = require('fs');
const path = require('path');
const express = require('express');

const previousStatic = express.static.bind(express);

express.static = function quizRulesNavigationStatic(root, options) {
  const fallback = previousStatic(root, options);

  return function ensureQuizRulesNavigation(req, res, next) {
    const pathname = (req.url || '').split('?')[0];
    const isEligibleAdminPage = req.method === 'GET'
      && /^\/admin\/[^/]+\.html$/.test(pathname)
      && pathname !== '/admin/products.html'
      && pathname !== '/admin/recommendation-rules.html';

    if (!isEligibleAdminPage) return fallback(req, res, next);

    const pagePath = path.join(root, 'admin', path.basename(pathname));
    fs.readFile(pagePath, 'utf8', (error, html) => {
      if (error) return next(error);

      if (html.includes('href="/admin/recommendation-rules.html"')) {
        return fallback(req, res, next);
      }

      const quizRulesLink = '<a href="/admin/recommendation-rules.html" class="block text-stone-300 hover:bg-stone-800 hover:text-white px-5 py-3 transition">Quiz Rules</a>';
      const updated = html.replace(
        /(<a href="\/admin\/discounts\.html"[^>]*>Discounts<\/a>)/,
        `$1\n        ${quizRulesLink}`
      );

      res.status(200);
      res.type('html');
      res.set('Cache-Control', 'no-store, max-age=0');
      return res.send(updated);
    });
  };
};
