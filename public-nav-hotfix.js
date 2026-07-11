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
  var LOYALTY_HREF = 'loyalty.html';

  function normalHref(link) {
    return String(link && link.getAttribute('href') || '')
      .replace(/^\//, '')
      .split('?')[0]
      .split('#')[0]
      .toLowerCase();
  }

  function rawHref(link) {
    return String(link && link.getAttribute('href') || '')
      .replace(/^\//, '')
      .split('?')[0]
      .toLowerCase();
  }

  function isLoyaltyLink(link) {
    var href = normalHref(link);
    return href === 'loyalty.html' || href === 'loyalty';
  }

  function hasLoyaltyLink(container) {
    return !!container && Array.from(container.querySelectorAll('a')).some(isLoyaltyLink);
  }

  function preferredReference(container) {
    if (!container) return null;
    var links = Array.from(container.querySelectorAll('a'));
    var preferred = ['quiz.html', 'faq.html', 'ingredients.html', 'contact.html', 'blog.html', 'shop.html'];
    for (var i = 0; i < preferred.length; i += 1) {
      var match = links.find(function (link) { return normalHref(link) === preferred[i]; });
      if (match) return match;
    }
    return links[links.length - 1] || null;
  }

  function createGlowRewardsLink(reference, mobile) {
    var link = document.createElement('a');
    link.href = LOYALTY_HREF;
    link.setAttribute('data-glow-rewards-link', 'true');
    link.className = reference && reference.className
      ? reference.className
      : (mobile ? 'text-lg hover:text-amber-800 transition flex items-center gap-3' : 'hover:text-amber-800 transition');
    link.innerHTML = mobile
      ? '<i class="fas fa-sparkles w-5"></i>Glow Rewards'
      : 'Glow Rewards';
    return link;
  }

  function ensureGlowLink(container, mobile) {
    if (!container || hasLoyaltyLink(container)) return;
    var reference = preferredReference(container);
    if (!reference) return;
    var link = createGlowRewardsLink(reference, mobile);
    reference.insertAdjacentElement('beforebegin', link);
  }

  function desktopNavContainers() {
    var containers = [];
    Array.from(document.querySelectorAll('nav, .glass-nav')).forEach(function (nav) {
      var groups = Array.from(nav.querySelectorAll('div')).filter(function (group) {
        return group.querySelectorAll('a').length >= 2;
      });
      groups.sort(function (left, right) {
        return right.querySelectorAll('a').length - left.querySelectorAll('a').length;
      });
      if (groups[0]) containers.push(groups[0]);
    });
    return containers;
  }

  function mobileNavContainers() {
    var drawer = document.getElementById('mobileMenuDrawer');
    if (!drawer) return [];
    return Array.from(drawer.querySelectorAll('div')).filter(function (group) {
      return group.querySelectorAll('a').length >= 2;
    });
  }

  function addFooterLoyaltyLink() {
    var footer = document.querySelector('footer');
    if (!footer || hasLoyaltyLink(footer)) return;
    var links = Array.from(footer.querySelectorAll('a'));
    var reference = links.find(function (link) { return normalHref(link) === 'faq.html'; })
      || links.find(function (link) { return normalHref(link) === 'contact.html'; })
      || links.find(function (link) { return normalHref(link) === 'shipping-returns.html'; });
    if (!reference) return;

    var item = document.createElement('li');
    item.innerHTML = '<a href="loyalty.html" data-glow-rewards-link="true" class="hover:text-white transition">Glow Rewards</a>';
    var listItem = reference.closest('li');
    if (listItem) listItem.insertAdjacentElement('beforebegin', item);
    else reference.insertAdjacentElement('beforebegin', item);
  }

  function addAccountEntry() {
    document.querySelectorAll('.glass-nav a[href="admin/login.html"]').forEach(function (link) {
      link.href = 'customer-login.html';
      link.title = 'My Account';
      link.setAttribute('aria-label', 'My Account');
    });

    var drawer = document.getElementById('mobileMenuDrawer');
    var menu = drawer && Array.from(drawer.querySelectorAll('div')).find(function (group) {
      return group.querySelectorAll('a').length >= 2;
    });
    if (menu && !Array.from(menu.querySelectorAll('a')).some(function (link) {
      var href = normalHref(link);
      return href === 'customer-login.html' || href === 'account.html';
    })) {
      var account = document.createElement('a');
      account.href = 'customer-login.html';
      account.className = 'text-lg hover:text-amber-800 transition flex items-center gap-3';
      account.innerHTML = '<i class="fas fa-user w-5"></i>My Account';
      var shop = Array.from(menu.querySelectorAll('a')).find(function (link) { return normalHref(link) === 'shop.html'; });
      if (shop) shop.insertAdjacentElement('beforebegin', account);
      else menu.prepend(account);
    }

    var footer = document.querySelector('footer');
    if (!footer || Array.from(footer.querySelectorAll('a')).some(function (link) {
      var href = normalHref(link);
      return href === 'customer-login.html' || href === 'account.html';
    })) return;

    var contact = Array.from(footer.querySelectorAll('a')).find(function (link) { return normalHref(link) === 'contact.html'; });
    if (contact) {
      var item = document.createElement('li');
      item.innerHTML = '<a href="customer-login.html" class="hover:text-white transition">My Account</a>';
      var contactItem = contact.closest('li');
      if (contactItem) contactItem.insertAdjacentElement('beforebegin', item);
      else contact.insertAdjacentElement('beforebegin', item);
    }
  }

  function addFooterCancelOrderLink() {
    var footer = document.querySelector('footer');
    if (!footer) return;
    if (!Array.from(footer.querySelectorAll('a')).some(function (link) {
      var href = rawHref(link);
      return href === 'policies.html' || href === 'policies';
    })) {
      var policyAnchor = Array.from(footer.querySelectorAll('a')).find(function (link) { return normalHref(link) === 'shipping-returns.html'; })
        || Array.from(footer.querySelectorAll('a')).find(function (link) { return rawHref(link) === 'policies.html#privacy-policy'; })
        || Array.from(footer.querySelectorAll('a')).find(function (link) { return normalHref(link) === 'contact.html'; });
      if (policyAnchor) {
        var policyItem = document.createElement('li');
        policyItem.innerHTML = '<a href="policies.html" class="hover:text-white transition">Policies</a>';
        var policyListItem = policyAnchor.closest('li');
        if (policyListItem) policyListItem.insertAdjacentElement('beforebegin', policyItem);
        else policyAnchor.insertAdjacentElement('beforebegin', policyItem);
      }
    }

    if (Array.from(footer.querySelectorAll('a')).some(function (link) {
      var href = normalHref(link);
      return href === 'cancel-order.html' || href === 'cancel-order';
    })) return;

    var contact = Array.from(footer.querySelectorAll('a')).find(function (link) { return normalHref(link) === 'contact.html'; })
      || Array.from(footer.querySelectorAll('a')).find(function (link) { return normalHref(link) === 'terms.html'; });
    if (!contact) {
      var fallbackLinks = footer.querySelector('[data-footer-compliance-links]');
      if (!fallbackLinks) {
        fallbackLinks = document.createElement('div');
        fallbackLinks.setAttribute('data-footer-compliance-links', 'true');
        fallbackLinks.className = 'flex flex-wrap gap-4 justify-center mb-4 text-xs';
        fallbackLinks.innerHTML = [
          '<a href="policies.html" class="hover:text-white transition">Policies</a>',
          '<a href="shipping-returns.html" class="hover:text-white transition">Shipping & Returns</a>',
          '<a href="cancel-order.html" class="hover:text-white transition">Cancel Order</a>',
          '<a href="policies.html#privacy-policy" class="hover:text-white transition">Privacy</a>',
          '<a href="policies.html#terms-conditions" class="hover:text-white transition">Terms</a>',
          '<a href="contact.html" class="hover:text-white transition">Contact</a>'
        ].join('');
        footer.insertBefore(fallbackLinks, footer.firstChild);
      }
      return;
    }

    var item = document.createElement('li');
    item.innerHTML = '<a href="cancel-order.html" class="hover:text-white transition">Cancel Order</a>';
    var listItem = contact.closest('li');
    if (listItem) listItem.insertAdjacentElement('beforebegin', item);
    else contact.insertAdjacentElement('beforebegin', item);
  }

  function ensureNavigation() {
    desktopNavContainers().forEach(function (container) { ensureGlowLink(container, false); });
    mobileNavContainers().forEach(function (container) { ensureGlowLink(container, true); });
    addFooterLoyaltyLink();
    addAccountEntry();
    addFooterCancelOrderLink();
  }

  function start() {
    ensureNavigation();
    window.setTimeout(ensureNavigation, 150);
    window.setTimeout(ensureNavigation, 800);
    window.setTimeout(ensureNavigation, 1800);

    if (document.body && !document.body.dataset.glowRewardsObserver) {
      document.body.dataset.glowRewardsObserver = 'true';
      var queued = false;
      var observer = new MutationObserver(function () {
        if (queued) return;
        queued = true;
        window.requestAnimationFrame(function () {
          queued = false;
          ensureNavigation();
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
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
