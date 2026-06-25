// Shared public storefront delivery layer.
// It keeps navigation, account entry points, drawer behaviour, checkout account
// linkage, and page-specific presentation consistent while legacy templates are
// being consolidated into shared components.
const fs = require('fs');
const path = require('path');
const express = require('express');

const previousStatic = express.static.bind(express);

const drawerFix = `
<style id="drawerPositionFix">
  #mobileMenuDrawer.mobile-menu-drawer {
    transform: translateX(100%) !important;
    visibility: hidden;
    pointer-events: none;
  }
  #mobileMenuDrawer.mobile-menu-drawer.open {
    transform: translateX(0) !important;
    visibility: visible;
    pointer-events: auto;
  }
</style>
<script id="drawerStateReset">
(function () {
  function resetDrawers() {
    const mobileMenu = document.getElementById('mobileMenuDrawer');
    const cartDrawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');
    if (mobileMenu) mobileMenu.classList.remove('open');
    if (cartDrawer) cartDrawer.classList.remove('open');
    if (overlay) overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', resetDrawers, { once: true });
  else resetDrawers();
})();
</script>`;

const loyaltyContrastFix = '<link id="loyaltyContrastFix" rel="stylesheet" href="css/loyalty-contrast-fix.css?v=1">';
const accountTailwind = '<script id="accountTailwind" src="https://cdn.tailwindcss.com"></script>';
const storefrontIntegration = '<script id="storefrontIntegration" src="js/storefront-integration.js?v=1"></script>';

const navigationScript = `
<script id="loyaltyNavigationScript">
(function () {
  function addLink(anchor, mobile) {
    if (!anchor || !anchor.parentElement || anchor.parentElement.querySelector('a[href="loyalty.html"]')) return;
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

  function addAccountEntry() {
    document.querySelectorAll('.glass-nav a[href="admin/login.html"]').forEach(function (link) {
      link.href = 'customer-login.html';
      link.title = 'My Account';
      link.setAttribute('aria-label', 'My Account');
    });

    const menu = document.querySelector('#mobileMenuDrawer .flex.flex-col');
    if (menu && !menu.querySelector('a[href="customer-login.html"]')) {
      const account = document.createElement('a');
      account.href = 'customer-login.html';
      account.className = 'text-lg hover:text-amber-800 transition flex items-center gap-3';
      account.innerHTML = '<i class="fas fa-user w-5"></i>My Account';
      const shop = Array.from(menu.querySelectorAll('a')).find(function (link) { return link.getAttribute('href') === 'shop.html'; });
      if (shop) shop.insertAdjacentElement('beforebegin', account);
      else menu.prepend(account);
    }

    const footerSupport = Array.from(document.querySelectorAll('footer a')).find(function (link) { return link.getAttribute('href') === 'contact.html'; });
    if (footerSupport && !document.querySelector('footer a[href="customer-login.html"]')) {
      const item = document.createElement('li');
      item.innerHTML = '<a href="customer-login.html" class="hover:text-white transition">My Account</a>';
      footerSupport.closest('li') ? footerSupport.closest('li').insertAdjacentElement('beforebegin', item) : footerSupport.insertAdjacentElement('beforebegin', item);
    }
  }

  function run() {
    const desktopFaq = Array.from(document.querySelectorAll('.glass-nav a')).find(function (link) { return link.getAttribute('href') === 'faq.html'; });
    addLink(desktopFaq, false);

    const mobileFaq = Array.from(document.querySelectorAll('#mobileMenuDrawer a')).find(function (link) { return link.getAttribute('href') === 'faq.html'; });
    addLink(mobileFaq, true);

    const footerFaq = Array.from(document.querySelectorAll('footer a')).find(function (link) { return link.getAttribute('href') === 'faq.html'; });
    addFooterLink(footerFaq);
    addAccountEntry();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
</script>`;

express.static = function storefrontExperienceStatic(root, options) {
  const fallback = previousStatic(root, options);

  return function deliverStorefrontExperience(req, res, next) {
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
      const isAccountPage = pageName === 'account.html' || pageName === 'customer-login.html';
      const withDrawerFix = html.includes('id="drawerPositionFix"')
        ? html
        : html.replace('</head>', `${drawerFix}\n</head>`);
      const withLoyaltyContrast = isLoyaltyPage && !withDrawerFix.includes('id="loyaltyContrastFix"')
        ? withDrawerFix.replace('</head>', `${loyaltyContrastFix}\n</head>`)
        : withDrawerFix;
      const withAccountTailwind = isAccountPage && !withLoyaltyContrast.includes('id="accountTailwind"')
        ? withLoyaltyContrast.replace('</head>', `${accountTailwind}\n</head>`)
        : withLoyaltyContrast;
      const withNavigation = withAccountTailwind.includes('id="loyaltyNavigationScript"')
        ? withAccountTailwind
        : withAccountTailwind.replace('</body>', `${navigationScript}\n</body>`);
      const updated = withNavigation.includes('id="storefrontIntegration"')
        ? withNavigation
        : withNavigation.replace('</body>', `${storefrontIntegration}\n</body>`);

      res.status(200);
      res.type('html');
      res.set('Cache-Control', 'no-store, max-age=0');
      return res.send(updated);
    });
  };
};
