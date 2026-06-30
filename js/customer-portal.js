(() => {
  const root = document.getElementById('customerPortalRoot');
  const loginUrl = 'customer-login.html';
  let session = null;
  let portalData = null;

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&', '<': '<', '>': '>', "'": '&#39;', '"': '"' }[character]));
  const formatCurrency = (value) => new Intl.NumberFormat('en-JM', { style: 'currency', currency: 'JMD', maximumFractionDigits: 0 }).format(Number(value || 0));
  const formatNumber = (value) => new Intl.NumberFormat('en-JM').format(Number(value || 0));
  const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleDateString('en-JM', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  function showLoading() {
    if (!root) return;
    root.innerHTML = `<main class="account-shell"><div class="account-wrap loading-account"><div class="text-center"><i class="fas fa-circle-notch fa-spin"></i><p>Gathering your glow details…</p></div></div></main>`;
  }

  function statusClass(order) {
    const text = String(order.status || '').toLowerCase();
    const label = String(order.statusLabel || '').toLowerCase();
    if (text === 'cancelled' || label.includes('cancelled')) return 'cancelled';
    if (text === 'refunded' || label.includes('refund')) return 'refunded';
    if (label.includes('delivered')) return 'delivered';
    if (label.includes('awaiting') || label.includes('pending')) return 'awaiting';
    return '';
  }

  function orderItemsMarkup(items) {
    if (!items || !items.length) return '<p class="text-sm text-stone-500">Item details are being prepared.</p>';
    return items.map((item) => `
      <div class="order-item">
        <div><strong>${escapeHtml(item.productName)}</strong>${item.variantName ? `<small>${escapeHtml(item.variantName)}</small>` : ''}</div>
        <div class="text-right"><strong>${formatCurrency(item.lineTotalJmd)}</strong><small>Qty ${formatNumber(item.quantity)}</small></div>
      </div>`).join('');
  }

  function orderCard(order, compact = false) {
    if (compact) {
      return `<div class="order-row">
        <div><strong>${escapeHtml(order.orderNumber)}</strong><span>${formatDate(order.createdAt)} · ${order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} item${order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) === 1 ? '' : 's'}</span></div>
        <div><span class="status-chip ${statusClass(order)}">${escapeHtml(order.statusLabel)}</span><span class="order-row-amount">${formatCurrency(order.grandTotalJmd)}</span></div>
      </div>`;
    }

    return `<article class="account-card order-card">
      <div class="order-card-top">
        <div><h3>${escapeHtml(order.orderNumber)}</h3><p class="order-card-meta">Placed ${formatDate(order.createdAt)}${order.deliveryService ? ` · ${escapeHtml(order.deliveryService)}` : ''}</p></div>
        <span class="status-chip ${statusClass(order)}">${escapeHtml(order.statusLabel)}</span>
      </div>
      <div class="order-card-items">${orderItemsMarkup(order.items)}</div>
      <div class="order-card-bottom">
        <div><strong class="order-total">Order total: ${formatCurrency(order.grandTotalJmd)}</strong>${order.deliveryAddress ? `<span class="block mt-1 text-xs text-stone-500">${escapeHtml(order.deliveryMethod === 'pickup' ? 'Pickup' : 'Delivery')} · ${escapeHtml(order.deliveryAddress)}</span>` : ''}</div>
        ${Number(order.pointsEarned || 0) > 0 ? `<span class="order-credit"><i class="fas fa-sparkles mr-1"></i>+${formatNumber(order.pointsEarned)} ${escapeHtml(portalData.loyalty.creditLabel)}</span>` : '<span class="order-credit text-stone-500">Credits apply after payment is confirmed</span>'}
      </div>
    </article>`;
  }

  function rewardsMarkup(loyalty) {
    if (!loyalty.rewards || !loyalty.rewards.length) {
      return `<div class="account-empty"><i class="fas fa-gift"></i><h3>Rewards are coming soon.</h3><p>Keep enjoying your routine while the next reward collection is prepared.</p></div>`;
    }

    return loyalty.rewards.map((reward) => {
      const requestText = `Hi Foryou Skin Bar! I would like help with the ${reward.title} reward in my customer account.`;
      const requestHref = `https://wa.me/18763094374?text=${encodeURIComponent(requestText)}`;
      return `<article class="account-card reward-account-card">
        <span class="reward-tier">${escapeHtml(reward.tierName)}</span>
        <h3>${escapeHtml(reward.title)}</h3>
        <p>${escapeHtml(reward.description || 'A special Inner Circle reward.')}</p>
        <div class="reward-points">${escapeHtml(reward.points || 'See reward details')}</div>
        <span class="reward-state ${reward.eligible ? '' : 'locked'}">${reward.eligible ? 'Ready to claim' : 'Keep earning to unlock'}</span>
        ${reward.eligible ? `<a class="reward-request" href="${requestHref}" target="_blank" rel="noopener">Request this reward <i class="fas fa-arrow-right ml-1"></i></a>` : ''}
      </article>`;
    }).join('');
  }

  function renderPortal(data) {
    if (!root) return;
    portalData = data;
    const profile = data.profile || {};
    const summary = data.summary || {};
    const loyalty = data.loyalty || {};
    const orders = data.orders || [];
    const currentTier = loyalty.currentTier || { name: 'Glow Member', rank: 'Your level', threshold: 0, multiplier: 1 };
    const nextTier = loyalty.nextTier;
    const progress = nextTier
      ? Math.min(100, Math.max(0, ((Number(loyalty.lifetimeEarned || 0) - Number(currentTier.threshold || 0)) / Math.max(1, Number(nextTier.threshold || 0) - Number(currentTier.threshold || 0))) * 100))
      : 100;
    const firstName = String(profile.fullName || '').trim().split(/\s+/)[0] || 'Glow friend';
    const recentOrders = orders.slice(0, 3);

    root.innerHTML = `
      <main class="account-shell">
        <div class="account-wrap">
          <section class="account-hero">
            <div><span class="account-eyebrow">My Foryou Skin Bar</span><h1>Hi, ${escapeHtml(firstName)}.</h1><p>Everything from your skincare journey, in one calm little space.</p></div>
            <div class="account-hero-actions"><a href="shop.html" class="account-outline"><i class="fas fa-bag-shopping"></i>Continue shopping</a><button id="accountSignOutBtn" class="account-outline" type="button"><i class="fas fa-right-from-bracket"></i>Sign out</button></div>
          </section>

          <div class="account-tabs" role="tablist">
            <button class="account-tab active" data-account-tab="overview" type="button">Overview</button>
            <button class="account-tab" data-account-tab="orders" type="button">My orders</button>
            <button class="account-tab" data-account-tab="rewards" type="button">Glow rewards</button>
            <button class="account-tab" data-account-tab="profile" type="button">My details</button>
          </div>

          <section class="account-view active" data-account-view="overview">
            <div class="account-stat-grid">
              <article class="account-stat highlight"><p class="stat-label">${escapeHtml(loyalty.creditLabel || 'Glow Credits')}</p><p class="stat-value">${formatNumber(loyalty.pointsBalance)}</p><p class="stat-caption">Available from eligible paid purchases</p></article>
              <article class="account-stat"><p class="stat-label">Your glow level</p><p class="stat-value">${escapeHtml(currentTier.name)}</p><p class="stat-caption">${escapeHtml(currentTier.rank || 'Inner Circle member')}</p></article>
              <article class="account-stat"><p class="stat-label">Orders placed</p><p class="stat-value">${formatNumber(summary.orderCount)}</p><p class="stat-caption">${formatNumber(summary.paidOrderCount)} eligible paid order${Number(summary.paidOrderCount) === 1 ? '' : 's'}</p></article>
              <article class="account-stat"><p class="stat-label">Your skincare spend</p><p class="stat-value">${formatCurrency(summary.totalOrderSpend)}</p><p class="stat-caption">Across all orders in this account</p></article>
            </div>

            <div class="account-grid">
              <section class="account-card account-section">
                <div class="account-section-head"><div><p class="account-eyebrow">Recent purchases</p><h2>Your latest orders</h2></div><button class="account-link" data-go-tab="orders" type="button">See all orders <i class="fas fa-arrow-right ml-1"></i></button></div>
                ${recentOrders.length ? recentOrders.map((order) => orderCard(order, true)).join('') : `<div class="account-empty"><i class="fas fa-bag-shopping"></i><h3>Your first glow is waiting.</h3><p>Once you place an order with this email address, it will appear here.</p><a href="shop.html" class="reward-request">Shop skincare <i class="fas fa-arrow-right ml-1"></i></a></div>`}
              </section>
              <aside class="account-card loyalty-summary">
                <p class="account-eyebrow" style="color:#f4d98e">${escapeHtml(loyalty.creditLabel || 'Glow Credits')}</p><h2>${escapeHtml(currentTier.name)}</h2><p>${escapeHtml(currentTier.summary || 'Your loyalty journey grows with every eligible paid order.')}</p>
                <div class="loyalty-points">${formatNumber(loyalty.pointsBalance)}</div><div class="loyalty-label">${escapeHtml(loyalty.creditLabel || 'Glow Credits')} available</div>
                <span class="loyalty-tier-pill"><i class="fas fa-sparkles"></i>${escapeHtml(currentTier.rank || 'Inner Circle member')} · ${Number(currentTier.multiplier || 1)}× earning</span>
                <div class="progress-track"><div class="progress-bar" style="width:${progress}%"></div></div>
                <p class="loyalty-next">${nextTier ? `${formatNumber(loyalty.pointsToNextTier)} more ${escapeHtml(loyalty.creditLabel || 'Glow Credits')} until ${escapeHtml(nextTier.name)}.` : 'You have reached the highest glow level.'}</p>
              </aside>
            </div>
          </section>

          <section class="account-view" data-account-view="orders">
            <div class="account-section-head"><div><p class="account-eyebrow">Purchase history</p><h2 class="text-3xl text-stone-800">My orders</h2></div><a href="shop.html" class="account-link">Shop again <i class="fas fa-arrow-right ml-1"></i></a></div>
            <div class="order-list">${orders.length ? orders.map((order) => orderCard(order)).join('') : `<div class="account-empty"><i class="fas fa-bag-shopping"></i><h3>No purchases found yet.</h3><p>Orders made with ${escapeHtml(profile.email || 'this email address')} will show here after checkout.</p><a href="shop.html" class="reward-request">Browse products <i class="fas fa-arrow-right ml-1"></i></a></div>`}</div>
          </section>

          <section class="account-view" data-account-view="rewards">
            <div class="account-section-head"><div><p class="account-eyebrow">${escapeHtml(loyalty.creditLabel || 'Glow Credits')} & benefits</p><h2 class="text-3xl text-stone-800">Your glow rewards</h2></div><a href="loyalty.html" class="account-link">Explore programme <i class="fas fa-arrow-right ml-1"></i></a></div>
            <div class="account-card account-section mb-4"><h2>${formatNumber(loyalty.pointsBalance)} ${escapeHtml(loyalty.creditLabel || 'Glow Credits')} available</h2><p class="mt-3 text-sm text-stone-600">${escapeHtml(loyalty.calculationNote || '')}</p></div>
            <div class="rewards-grid">${rewardsMarkup(loyalty)}</div>
          </section>

          <section class="account-view" data-account-view="profile">
            <div class="profile-grid">
              <section class="account-card profile-card">
                <p class="account-eyebrow">Your account details</p><h2>Keep your details current.</h2><p>Your email identifies your previous orders. Update your contact details here so the team can reach you about new purchases.</p>
                <form id="profileForm" novalidate>
                  <div class="field"><label for="profileName">Full name</label><input id="profileName" value="${escapeHtml(profile.fullName || '')}" autocomplete="name" required></div>
                  <div class="field"><label for="profileEmail">Email address</label><input id="profileEmail" value="${escapeHtml(profile.email || '')}" type="email" disabled></div>
                  <div class="field"><label for="profilePhone">Phone number</label><input id="profilePhone" value="${escapeHtml(profile.phone || '')}" autocomplete="tel"></div>
                  <div class="field"><label for="profileWhatsapp">WhatsApp number</label><input id="profileWhatsapp" value="${escapeHtml(profile.whatsapp || '')}" autocomplete="tel"></div>
                  <button id="profileSaveBtn" class="account-primary" type="submit"><i class="fas fa-save"></i>Save my details</button>
                </form>
              </section>
              <section class="account-card profile-card">
                <p class="account-eyebrow">Account security</p><h2>Change your password.</h2><p>Use a strong password that you do not use elsewhere.</p>
                <form id="passwordForm" class="password-fields" novalidate>
                  <div class="field"><label for="newPassword">New password</label><input id="newPassword" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"></div>
                  <div class="field"><label for="confirmNewPassword">Confirm new password</label><input id="confirmNewPassword" type="password" autocomplete="new-password" minlength="8" placeholder="Repeat your new password"></div>
                  <button id="passwordSaveBtn" class="account-primary" type="submit"><i class="fas fa-lock"></i>Update password</button>
                </form>
                <div id="profileMessage" class="auth-message" role="status"></div>
              </section>
            </div>
          </section>
        </div>
      </main>`;

    bindPortalEvents();
  }

  function showProfileMessage(text, type = 'success') {
    const message = document.getElementById('profileMessage');
    if (!message) return;
    message.textContent = text;
    message.className = `auth-message visible ${type}`;
  }

  function setButtonBusy(button, busy, originalHtml) {
    if (!button) return;
    if (!button.dataset.originalHtml) button.dataset.originalHtml = originalHtml || button.innerHTML;
    button.disabled = busy;
    button.innerHTML = busy ? '<i class="fas fa-spinner fa-spin"></i>Please wait…' : button.dataset.originalHtml;
  }

  async function portalFetch(path, options = {}) {
    const { data } = await window.supabase.auth.getSession();
    const activeSession = data && data.session;
    if (!activeSession) {
      window.location.assign(loginUrl);
      throw new Error('Please sign in again.');
    }
    const response = await fetch(path, {
      ...options,
      headers: { Authorization: `Bearer ${activeSession.access_token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'We could not complete that request.');
    return payload;
  }

  function switchTab(tab) {
    document.querySelectorAll('[data-account-tab]').forEach((button) => button.classList.toggle('active', button.dataset.accountTab === tab));
    document.querySelectorAll('[data-account-view]').forEach((view) => view.classList.toggle('active', view.dataset.accountView === tab));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bindPortalEvents() {
    document.querySelectorAll('[data-account-tab]').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.accountTab)));
    document.querySelectorAll('[data-go-tab]').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.goTab)));

    document.getElementById('accountSignOutBtn')?.addEventListener('click', async () => {
      await window.supabase.auth.signOut();
      window.location.assign(loginUrl);
    });

    document.getElementById('profileForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = document.getElementById('profileSaveBtn');
      setButtonBusy(button, true);
      try {
        const response = await portalFetch('/api/customer-portal/profile', {
          method: 'PATCH',
          body: JSON.stringify({
            fullName: document.getElementById('profileName').value.trim(),
            phone: document.getElementById('profilePhone').value.trim(),
            whatsapp: document.getElementById('profileWhatsapp').value.trim()
          })
        });
        if (portalData && response.profile) portalData.profile = { ...portalData.profile, ...response.profile };
        showProfileMessage('Your details have been saved.', 'success');
      } catch (error) {
        showProfileMessage(error.message || 'We could not save your details.', 'error');
      } finally {
        setButtonBusy(button, false);
      }
    });

    document.getElementById('passwordForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmNewPassword').value;
      const button = document.getElementById('passwordSaveBtn');
      if (password.length < 8) return showProfileMessage('Use at least 8 characters for your new password.', 'error');
      if (password !== confirmPassword) return showProfileMessage('Your new passwords do not match.', 'error');
      setButtonBusy(button, true);
      try {
        const { error } = await window.supabase.auth.updateUser({ password });
        if (error) throw error;
        document.getElementById('passwordForm').reset();
        showProfileMessage('Your password has been updated.', 'success');
      } catch (error) {
        showProfileMessage(error.message || 'We could not update your password.', 'error');
      } finally {
        setButtonBusy(button, false);
      }
    });
  }

  async function loadPortal() {
    if (!root || !window.supabase) return;
    showLoading();
    const { data } = await window.supabase.auth.getSession();
    session = data && data.session;
    if (!session) return window.location.assign(loginUrl);
    try {
      const payload = await portalFetch('/api/customer-portal');
      renderPortal(payload);
    } catch (error) {
      if (String(error.message || '').toLowerCase().includes('sign in')) return;
      root.innerHTML = `<main class="account-shell"><div class="account-wrap"><div class="account-empty"><i class="fas fa-triangle-exclamation"></i><h3>We could not open your account.</h3><p>${escapeHtml(error.message || 'Please refresh and try again.')}</p><a class="reward-request" href="customer-login.html">Return to sign in <i class="fas fa-arrow-right ml-1"></i></a></div></div></main>`;
    }
  }

  document.addEventListener('DOMContentLoaded', loadPortal);
})();