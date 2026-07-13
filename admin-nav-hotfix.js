// Shared admin navigation and operational integration layer.
const fs = require('fs');
const path = require('path');
const express = require('express');

const previousStatic = express.static.bind(express);
const adminIntegration = '<script id="adminOperationalIntegration" type="module" src="/admin/js/admin-integration.js?v=1"></script>';
const adminSidebarNormalizer = `
<style id="adminSidebarNormalizerStyle">
  .admin-sidebar-normalized {
    height: 100vh !important;
    max-height: 100vh !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    scrollbar-width: thin;
  }
  .admin-sidebar-normalized h2,
  .admin-sidebar-normalized a,
  .admin-sidebar-normalized [data-admin-logout-wrap] {
    flex-shrink: 0;
  }
  .admin-sidebar-normalized [data-admin-logout-wrap] {
    margin-top: 1rem !important;
  }
  @media (max-height: 920px) {
    .admin-sidebar-normalized h2 {
      margin-bottom: 1rem !important;
    }
    .admin-sidebar-normalized a {
      padding-top: .7rem !important;
      padding-bottom: .7rem !important;
    }
  }
</style>
<script id="adminSidebarNormalizer">
(function () {
  var navItems = [
    ['/admin/index.html', 'Dashboard'],
    ['/admin/orders.html', 'Orders'],
    ['/admin/products.html', 'Products'],
    ['/admin/inventory.html', 'Inventory'],
    ['/admin/customers.html', 'Customers'],
    ['/admin/discounts.html', 'Discounts'],
    ['/admin/loyalty.html', 'Loyalty Program'],
    ['/admin/recommendation-rules.html', 'Quiz Rules'],
    ['/admin/reviews.html', 'Reviews'],
    ['/admin/blog.html', 'Blog & Content'],
    ['/admin/content.html', 'Site Content (CMS)'],
    ['/admin/policies.html', 'Policies'],
    ['/admin/settings.html', 'Settings']
  ];
  var inactiveClass = 'block text-stone-300 hover:bg-stone-800 hover:text-white px-5 py-3 transition';
  var activeClass = 'block bg-stone-800 text-white border-l-4 border-amber-800 px-4 py-3';

  function normalizePath(value) {
    return String(value || '').replace(/\\/+$/, '') || '/';
  }

  function sidebarCandidate(element) {
    if (!element || !element.querySelector) return false;
    var title = element.querySelector('h2');
    return title && title.parentElement === element && /Foryou Admin/i.test(title.textContent || '') && element.querySelector('a[href="/admin/index.html"]');
  }

  function findSidebar() {
    return Array.from(document.querySelectorAll('aside, div')).find(sidebarCandidate);
  }

  function buildLink(item, activePath) {
    var href = item[0];
    var label = item[1];
    var isActive = normalizePath(href) === activePath;
    return '<a href="' + href + '" class="' + (isActive ? activeClass : inactiveClass) + '">' + label + '</a>';
  }

  function normalizeAdminSidebar() {
    var sidebar = findSidebar();
    if (!sidebar || sidebar.dataset.adminSidebarNormalized === 'true') return;
    sidebar.dataset.adminSidebarNormalized = 'true';
    sidebar.classList.add('admin-sidebar-normalized');

    var title = sidebar.querySelector('h2');
    var logout = sidebar.querySelector('#logoutBtn');
    var logoutWrap = logout && logout.closest('div');
    var activePath = normalizePath(window.location.pathname);

    Array.from(sidebar.children).forEach(function (child) {
      if (child !== title && child !== logoutWrap) child.remove();
    });

    if (title) {
      title.insertAdjacentHTML('afterend', navItems.map(function (item) {
        return buildLink(item, activePath);
      }).join(''));
    }

    if (!logoutWrap) {
      logoutWrap = document.createElement('div');
      logoutWrap.innerHTML = '<a href="#" id="logoutBtn" class="' + inactiveClass + '">Logout</a>';
    }
    logoutWrap.setAttribute('data-admin-logout-wrap', 'true');
    logoutWrap.className = 'border-t border-stone-800 pt-3';
    sidebar.appendChild(logoutWrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', normalizeAdminSidebar, { once: true });
  } else {
    normalizeAdminSidebar();
  }
})();
</script>`;

express.static = function adminExperienceStatic(root, options) {
  const fallback = previousStatic(root, options);

  return function deliverAdminExperience(req, res, next) {
    const pathname = (req.url || '').split('?')[0];
    const isAdminPage = req.method === 'GET' && /^\/admin\/[^/]+\.html$/.test(pathname);
    if (!isAdminPage) return fallback(req, res, next);

    const needsOrderIntegration = pathname === '/admin/orders.html';

    const pagePath = path.join(root, 'admin', path.basename(pathname));
    fs.readFile(pagePath, 'utf8', (error, html) => {
      if (error) return next(error);

      let updated = html;
      if (!updated.includes('id="adminSidebarNormalizer"')) {
        updated = updated.replace('</body>', `${adminSidebarNormalizer}\n</body>`);
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
