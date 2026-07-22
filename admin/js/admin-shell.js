(function initializeAdminShell() {
    const navigationItems = [
        ['/admin/index.html', 'fas fa-chart-line', 'Dashboard'],
        ['/admin/orders.html', 'fas fa-receipt', 'Orders'],
        ['/admin/products.html', 'fas fa-box-open', 'Products'],
        ['/admin/inventory.html', 'fas fa-boxes-stacked', 'Inventory'],
        ['/admin/customers.html', 'fas fa-users', 'Customers'],
        ['/admin/discounts.html', 'fas fa-tags', 'Discounts'],
        ['/admin/loyalty.html', 'fas fa-gift', 'Loyalty Program'],
        ['/admin/recommendation-rules.html', 'fas fa-wand-magic-sparkles', 'Quiz Rules'],
        ['/admin/reviews.html', 'fas fa-star', 'Reviews'],
        ['/admin/blog.html', 'fas fa-newspaper', 'Blog & Content'],
        ['/admin/content.html', 'fas fa-pen-ruler', 'Site Content'],
        ['/admin/policies.html', 'fas fa-file-contract', 'Policies'],
        ['/admin/settings.html', 'fas fa-gear', 'Settings']
    ];

    function normalizedPath(path) {
        const cleanPath = (path || '').replace(/\/+$/, '');
        return cleanPath === '/admin' ? '/admin/index.html' : cleanPath;
    }

    function sidebarMarkup() {
        const currentPath = normalizedPath(window.location.pathname);
        const links = navigationItems.map(([href, icon, label]) => {
            const active = currentPath === href ? ' class="active" aria-current="page"' : '';
            return `<a href="${href}"${active}><i class="${icon}" aria-hidden="true"></i><span>${label}</span></a>`;
        }).join('');

        return `
            <div class="sidebar-brand">
                <div>
                    <p class="sidebar-eyebrow">For You Skin Bar</p>
                    <h2>Admin</h2>
                </div>
                <button id="closeSidebarBtn" class="sidebar-close" type="button" aria-label="Close navigation" title="Close navigation">
                    <i class="fas fa-times" aria-hidden="true"></i>
                </button>
            </div>
            <nav class="admin-nav">${links}</nav>
            <div class="sidebar-footer">
                <a href="/index.html" target="_blank" rel="noopener"><i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i><span>View website</span></a>
                <button id="logoutBtn" type="button"><i class="fas fa-right-from-bracket" aria-hidden="true"></i><span>Logout</span></button>
            </div>`;
    }

    function findSidebar() {
        const existing = document.getElementById('adminSidebar') || document.querySelector('.admin-sidebar');
        if (existing) return existing;
        const dashboardLink = document.querySelector('a[href="/admin/index.html"]');
        return dashboardLink?.closest('aside') || dashboardLink?.parentElement || null;
    }

    function setDrawer(open) {
        document.body.classList.toggle('admin-drawer-open', open);
        document.body.classList.toggle('sidebar-open', open);
        document.getElementById('sidebarOverlay')?.setAttribute('aria-hidden', String(!open));
    }

    function setup() {
        if (!window.location.pathname.startsWith('/admin/') || window.location.pathname.endsWith('/login.html')) return;

        const sidebar = findSidebar();
        if (!sidebar) return;

        const shell = sidebar.parentElement;
        const main = sidebar.nextElementSibling;
        if (!shell || !main) return;

        shell.classList.add('admin-shell');
        sidebar.id = 'adminSidebar';
        sidebar.className = 'admin-sidebar';
        sidebar.setAttribute('aria-label', 'Admin navigation');
        sidebar.innerHTML = sidebarMarkup();

        if (!main.classList.contains('dashboard-main')) main.classList.add('admin-page-main');

        let overlay = document.getElementById('sidebarOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'sidebarOverlay';
            overlay.className = 'sidebar-overlay';
            overlay.setAttribute('aria-hidden', 'true');
            document.body.insertBefore(overlay, shell);
        }

        let openButton = document.getElementById('openSidebarBtn');
        if (!openButton) {
            openButton = document.createElement('button');
            openButton.id = 'openSidebarBtn';
            openButton.className = 'admin-mobile-menu';
            openButton.type = 'button';
            openButton.setAttribute('aria-label', 'Open navigation');
            openButton.title = 'Open navigation';
            openButton.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
            main.insertBefore(openButton, main.firstChild);
        }

        openButton.addEventListener('click', () => setDrawer(true));
        document.getElementById('closeSidebarBtn')?.addEventListener('click', () => setDrawer(false));
        overlay.addEventListener('click', () => setDrawer(false));
        sidebar.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setDrawer(false)));
        document.getElementById('logoutBtn')?.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            const button = event.currentTarget;
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            try {
                const { supabase } = await import('/admin/js/supabase-client.js');
                await supabase.auth.signOut();
            } finally {
                window.location.href = '/admin/login.html';
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') setDrawer(false);
        });
        window.addEventListener('resize', () => {
            if (window.innerWidth > 900) setDrawer(false);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup, { once: true });
    } else {
        setup();
    }
})();
