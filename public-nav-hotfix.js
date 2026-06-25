// Adds the Glow Rewards link to existing public-page navigation without
// duplicating the full header/footer markup across every legacy page.
const fs = require('fs');
const path = require('path');
const express = require('express');

const previousStatic = express.static.bind(express);

const navigationScript = `
<script id="loyaltyNavigationScript">
(function () {
  function addLink(anchor, mobile) {
    if (!anchor || document.querySelector('a[href="loyalty.html"]')) return;
    const link = document.createElement('a');
    link.href = 'loyalty.html';
    link.className = anchor.className;
    link.innerHTML = mobile ? '<i class="fas fa-sparkles w-5"></i>Glow Rewards' : 'Glow Rewards';
    anchor.insertAdjacentElement('beforebegin', link);
  }

  function addFooterLink(anchor) {
    if (!anchor || document.querySelector('footer a[href="loyalty.html"]')) return;
    const item = document.createElement('li');
    item.innerHTML = '<a href="loyalty.html" class="hover:text-white transition">Glow Rewards</a>';
    anchor.closest('li') ? anchor.closest('li').insertAdjacentElement('beforebegin', item) : anchor.insertAdjacentElement('beforebegin', item);
  }

  function run() {
    const desktopFaq = Array.from(document.querySelectorAll('.glass-nav a')).find(link => link.getAttribute('href') === 'faq.html');
    addLink(desktopFaq, false);

    const mobileFaq = Array.from(document.querySelectorAll('#mobileMenuDrawer a')).find(link => link.getAttribute('href') === 'faq.html');
    addLink(mobileFaq, true);

    const footerFaq = Array.from(document.querySelectorAll('footer a')).find(link => link.getAttribute('href') === 'faq.html');
    addFooterLink(footerFaq);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
</script>`;

express.static = function loyaltyNavigationStatic(root, options) {
  const fallback = previousStatic(root, options);

  return function addLoyaltyNavigation(req, res, next) {
    const pathname = (req.url || '').split('?')[0];
    const isPublicPage = req.method === 'GET' && (
      pathname === '/'
      || pathname === '/loyalty'
      || /^\/[^/]+\.html$/.test(pathname)
    );

    if (!isPublicPage) return fallback(req, res, next);

    const pageName = pathname === '/' ? 'index.html'
      : pathname === '/loyalty' ? 'loyalty.html'
      : path.basename(pathname);
    const pagePath = path.join(root, pageName);

    fs.readFile(pagePath, 'utf8', (error, html) => {
      if (error) return next(error);
      const isLoyaltyPage = pageName === 'loyalty.html';
      const updated = isLoyaltyPage || html.includes('id="loyaltyNavigationScript"')
        ? html
        : html.replace('</body>', `${navigationScript}\n</body>`);
      res.status(200);
      res.type('html');
      res.set('Cache-Control', 'no-store, max-age=0');
      return res.send(updated);
    });
  };
};
