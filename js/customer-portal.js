(() => {
  const root = document.getElementById('customerPortalRoot');
  const loginUrl = 'customer-login.html';
  let session = null;
  let portalData = null;

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
  const formatCurrency = (value) => new Intl.NumberFormat('en-JM', { style: 'currency', currency: 'JMD', maximumFractionDigits: 0 }).format(Number(value || 0));
  const formatNumber = (value) => new Intl.NumberFormat('en-JM').format(Number(value || 0));
  const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleDateString('en-JM', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const safeHref = (value = 'policies.html') => {
    const href = String(value || 'policies.html').trim();
    if (/^(https?:)?\/\//i.test(href) || href.toLowerCase().startsWith('javascript:')) return 'policies.html';
    return href || 'policies.html';
  };
  const safeTrackingHref = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw, window.location.origin);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch (_) {
      return '';
    }
  };

  function showLoading() {
    if (!root) return;
    root.innerHTML = `<main class="account-shell"><div class="account-wrap loading-account"><div class="text-center"><i class="fas fa-circle-notch fa-spin"></i><p>Gathering your glow details…</p></div></div></main>`;
  }

  function showLoginGate() {
    if (!root) return;
    root.innerHTML = `
      <main class="account-shell">
        <div class="account-wrap">
          <div class="account-empty" style="max-width: 520px; margin: 60px auto; text-align: center;">
            <i class="fas fa-lock fa-3x" style="color: #c89b3c; margin-bottom: 16px;"></i>
            <h2 style="font-size: 1.75rem; margin-bottom: 8px;">Sign in to access your account</h2>
            <p style="color: #6b5d50; margin-bottom: 24px;">Your orders, Glow Credits, delivery updates, and skincare journey are waiting for you.</p>
            <a href="${loginUrl}" class="account-primary" style="display: inline-flex; align-items: center; gap: 8px; padding: 14px 32px; text-decoration: none;">
              <i class="fas fa-sign-in-alt"></i> Sign in or create account
            </a>
            <p style="margin-top: 24px; font-size: 0.875rem; color: #8a7d6e;">
              Use the same email you used at checkout. New here? Creating an account is free and takes 30 seconds.
            </p>
          </div>
        </div>
      </main>`;
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

    const cancellationRequest = order.cancellationRequest || null;
    const isPendingCancellation = cancellationRequest?.status === 'pending';
    const isEligibleForCancellation = !isPendingCancellation
      && !['shipped', 'delivered', 'cancelled', 'refunded'].includes(String(order.status || '').toLowerCase())
      && !['shipped', 'delivered', 'picked_up'].includes(String(order.fulfillmentStatus || '').toLowerCase());
    const cancellationStatus = isPendingCancellation ? `
      <div class="cancellation-request-status pending"><i class="fas fa-clock"></i><span><strong>Cancellation requested</strong><small>Waiting for store review since ${formatDate(cancellationRequest.createdAt)}. This order remains active until approved.</small></span></div>`
      : cancellationRequest?.status === 'declined' ? `
      <div class="cancellation-request-status declined"><i class="fas fa-circle-info"></i><span><strong>Previous request not approved</strong><small>${escapeHtml(cancellationRequest.adminNote || 'Contact the store if you need more help.')}</small></span></div>` : '';
    const trackingUrl = safeTrackingHref(order.trackingUrl);
    const hasTracking = Boolean(order.trackingCarrier || order.trackingNumber || trackingUrl);
    const trackingMarkup = hasTracking ? `
      <section class="order-tracking" aria-label="Shipment tracking">
        <div class="order-tracking-heading"><i class="fas fa-truck-fast" aria-hidden="true"></i><strong>Shipment tracking</strong></div>
        <div class="order-tracking-details">
          ${order.trackingCarrier ? `<span><small>Carrier</small>${escapeHtml(order.trackingCarrier)}</span>` : ''}
          ${order.trackingNumber ? `<span><small>Tracking number</small><code>${escapeHtml(order.trackingNumber)}</code></span>` : ''}
        </div>
        ${trackingUrl ? `<a class="order-tracking-link" href="${escapeHtml(trackingUrl)}" target="_blank" rel="noopener noreferrer">Track shipment <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i></a>` : ''}
      </section>` : '';

    return `<article class="account-card order-card">
      <div class="order-card-top">
        <div><h3>${escapeHtml(order.orderNumber)}</h3><p class="order-card-meta">Placed ${formatDate(order.createdAt)}${order.deliveryService ? ` · ${escapeHtml(order.deliveryService)}` : ''}</p></div>
        <span class="status-chip ${statusClass(order)}">${escapeHtml(order.statusLabel)}</span>
      </div>
      <div class="order-card-items">${orderItemsMarkup(order.items)}</div>
      ${trackingMarkup}
      ${cancellationStatus}
      <div class="order-card-bottom">
        <div>
          <strong class="order-total">Order total: ${formatCurrency(order.grandTotalJmd)}</strong>
          ${order.deliveryAddress ? `<span class="block mt-1 text-xs text-stone-500">${escapeHtml(order.deliveryMethod === 'pickup' ? 'Pickup' : 'Delivery')} · ${escapeHtml(order.deliveryAddress)}</span>` : ''}
          ${isEligibleForCancellation ? `
            <div style="margin-top: 12px;">
              <button class="cancel-order-portal-btn text-red-600 hover:text-red-800 font-semibold text-xs flex items-center gap-1.5 transition" data-order-number="${escapeHtml(order.orderNumber)}" type="button">
                <i class="fas fa-ban"></i> Request Cancellation
              </button>
            </div>` : ''}
        </div>
        ${order.paymentStatus !== 'paid'
          ? '<span class="order-credit text-stone-500">Credits apply after payment is confirmed</span>'
          : Number(order.pointsEarned || 0) > 0
            ? `<span class="order-credit"><i class="fas fa-sparkles mr-1"></i>+${formatNumber(order.pointsEarned)} ${escapeHtml(portalData.loyalty.creditLabel)}</span>`
            : `<span class="order-credit text-stone-500">No ${escapeHtml(portalData.loyalty.creditLabel)} on this order</span>`}
      </div>
    </article>`;
  }

  function rewardsMarkup(loyalty) {
    if (!loyalty.rewards || !loyalty.rewards.length) {
      return `<div class="account-empty"><i class="fas fa-gift"></i><h3>Rewards are coming soon.</h3><p>Keep enjoying your routine while the next reward collection is prepared.</p></div>`;
    }

    return loyalty.rewards.map((reward) => `<article class="account-card reward-account-card">
        <h3>${escapeHtml(reward.title)}</h3>
        <p>${escapeHtml(reward.description || 'A special Inner Circle reward.')}</p>
        <div class="reward-points">${escapeHtml(reward.points || 'See reward details')} ${escapeHtml(loyalty.creditLabel || 'Glow Credits')}</div>
        <span class="reward-state ${reward.eligible ? '' : 'locked'}">${reward.eligible ? 'Ready to redeem' : 'Keep earning to unlock'}</span>
        ${reward.eligible
          ? `<button class="reward-request redeem-credits-btn" type="button" data-redeem-credits="${reward.requiredPoints}"><i class="fas fa-sparkles mr-1"></i>Redeem now</button>`
          : ''}
      </article>`).join('');
  }

  function referralCardMarkup(loyalty) {
    return `<article class="account-card" style="margin-bottom:1.5rem;">
      <p class="account-eyebrow">Refer a friend</p>
      <h2>Share your glow, earn ${escapeHtml(String(loyalty.referralCredits ?? 200))} ${escapeHtml(loyalty.creditLabel || 'Glow Credits')}</h2>
      <p class="mt-2 text-sm text-stone-600">Your friend gets ${escapeHtml(String(loyalty.referralFriendDiscountPercent ?? 20))}% off their first order. You get ${escapeHtml(String(loyalty.referralCredits ?? 200))} ${escapeHtml(loyalty.creditLabel || 'Glow Credits')} once they complete it — enter your code in the discount box at checkout.</p>
      <div id="referralCodeBox" class="mt-4 flex flex-wrap items-center gap-3">
        <button id="loadReferralCodeBtn" class="account-outline" type="button"><i class="fas fa-gift"></i>Get my referral code</button>
      </div>
    </article>`;
  }

  function notificationStorageKey() {
    return `foryou_policy_notifications_read:${portalData?.profile?.email || 'guest'}`;
  }

  function dismissedNotificationIds() {
    try {
      const ids = JSON.parse(localStorage.getItem(notificationStorageKey()) || '[]');
      return new Set(Array.isArray(ids) ? ids.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveDismissedNotification(id) {
    const ids = dismissedNotificationIds();
    ids.add(String(id));
    localStorage.setItem(notificationStorageKey(), JSON.stringify([...ids].slice(-100)));
  }

  function visibleNotifications(notifications) {
    const dismissed = dismissedNotificationIds();
    return (Array.isArray(notifications) ? notifications : [])
      .filter((notification) => notification?.id && !dismissed.has(String(notification.id)))
      .slice(0, 5);
  }

  function notificationPanel(notifications) {
    if (!notifications.length) return '';
    return `<section class="account-card account-section" data-policy-notifications style="margin-bottom: 24px; border-left: 4px solid #C89B3C;">
      <div class="account-section-head">
        <div><p class="account-eyebrow">Policy updates</p><h2>Updates from Foryou Skin Bar</h2></div>
        <a href="policies.html" class="account-link">View all policies <i class="fas fa-arrow-right ml-1"></i></a>
      </div>
      <div style="display: grid; gap: 12px;">
        ${notifications.map((notification) => `
          <article data-policy-notification="${escapeHtml(notification.id)}" style="background:#F8F5EF; border:1px solid #EBE3D5; border-radius:14px; padding:14px;">
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
              <div>
                <h3 style="font-size:1rem; margin-bottom:4px; color:#3A2E27;">${escapeHtml(notification.title)}</h3>
                <p style="font-size:.875rem; color:#5A4C3A; line-height:1.55;">${escapeHtml(notification.message)}</p>
                ${notification.updatedAt ? `<p style="font-size:.75rem; color:#8A7D6E; margin-top:6px;">Updated ${formatDate(notification.updatedAt)}</p>` : ''}
              </div>
              <button type="button" data-dismiss-policy-notification="${escapeHtml(notification.id)}" aria-label="Dismiss notification" style="color:#8A7D6E; padding:4px;">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <a href="${escapeHtml(safeHref(notification.href))}" class="reward-request" style="margin-top:10px;">Review policy <i class="fas fa-arrow-right ml-1"></i></a>
          </article>`).join('')}
      </div>
    </section>`;
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
    const lifetimeSpend = Number(loyalty.lifetimePurchaseJmd || 0);
    const progress = nextTier
      ? Math.min(100, Math.max(0, ((lifetimeSpend - Number(currentTier.threshold || 0)) / Math.max(1, Number(nextTier.threshold || 0) - Number(currentTier.threshold || 0))) * 100))
      : 100;
    const firstName = String(profile.fullName || '').trim().split(/\s+/)[0] || 'Glow friend';
    const recentOrders = orders.slice(0, 3);
    const policyNotifications = visibleNotifications(data.notifications || []);

    root.innerHTML = `
      <main class="account-shell">
        <div class="account-wrap">
          <section class="account-hero">
            <div><span class="account-eyebrow">My Foryou Skin Bar</span><h1>Hi, ${escapeHtml(firstName)}.</h1><p>Everything from your skincare journey, in one calm little space.</p></div>
            <div class="account-hero-actions"><a href="shop.html" class="account-outline"><i class="fas fa-bag-shopping"></i>Continue shopping</a><button id="accountSignOutBtn" class="account-outline" type="button"><i class="fas fa-right-from-bracket"></i>Sign out</button></div>
          </section>

          ${notificationPanel(policyNotifications)}

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
                <p class="loyalty-next">${nextTier ? `${formatCurrency(loyalty.spendToNextTierJmd)} more in lifetime purchases until ${escapeHtml(nextTier.name)}.` : 'You have reached the highest glow level.'}</p>
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
            ${referralCardMarkup(loyalty)}
            <div id="redeemMessage" class="auth-message" role="status"></div>
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
                  <div class="field"><label for="profileDob">Birthday</label><input id="profileDob" value="${escapeHtml(profile.dateOfBirth || '')}" type="date" autocomplete="bday"></div>
                  <p class="text-xs text-stone-500 mt-1">Add your birthday to receive a birthday Glow Credits reward every year.</p>
              </section>
              <section class="account-card profile-card">
                <p class="account-eyebrow">Shipping Address</p><h2>Your default delivery address.</h2><p>Save time at checkout by keeping this updated.</p>
                  <div class="field"><label for="profileCountry">Country</label><input id="profileCountry" value="${escapeHtml(profile.country || 'Jamaica')}" autocomplete="country"></div>
                  <div class="field"><label for="profileAddress1">Address Line 1</label><input id="profileAddress1" value="${escapeHtml(profile.addressLine1 || '')}" autocomplete="address-line1"></div>
                  <div class="field"><label for="profileAddress2">Address Line 2</label><input id="profileAddress2" value="${escapeHtml(profile.addressLine2 || '')}" autocomplete="address-line2"></div>
                  <div class="grid grid-cols-2 gap-4">
                    <div class="field"><label for="profileCity">City</label><input id="profileCity" value="${escapeHtml(profile.city || '')}" autocomplete="address-level2"></div>
                    <div class="field"><label for="profileParish">Parish</label><input id="profileParish" value="${escapeHtml(profile.parish || '')}" autocomplete="address-level1"></div>
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div class="field"><label for="profileState">State / Province</label><input id="profileState" value="${escapeHtml(profile.stateProvince || '')}" autocomplete="address-level1"></div>
                    <div class="field"><label for="profilePostal">Postal / Zip Code</label><input id="profilePostal" value="${escapeHtml(profile.postalCode || '')}" autocomplete="postal-code"></div>
                  </div>
                  <button id="profileSaveBtn" class="account-primary mt-4" type="submit"><i class="fas fa-save"></i>Save my details</button>
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
          <div id="cancellationRequestModal" class="cancellation-modal" hidden>
            <div class="cancellation-modal-backdrop" data-close-cancellation-modal></div>
            <section class="cancellation-modal-panel" role="dialog" aria-modal="true" aria-labelledby="cancellationModalTitle">
              <button class="cancellation-modal-close" type="button" data-close-cancellation-modal aria-label="Close"><i class="fas fa-times"></i></button>
              <p class="account-eyebrow">Order support</p>
              <h2 id="cancellationModalTitle">Request a cancellation</h2>
              <p>Your order will remain active until the Foryou Skin Bar team reviews and approves this request.</p>
              <form id="accountCancellationForm">
                <input id="accountCancellationOrder" type="hidden">
                <label class="cancellation-order-label">Order <strong id="accountCancellationOrderLabel"></strong></label>
                <label for="accountCancellationReason">Reason for cancellation</label>
                <textarea id="accountCancellationReason" rows="5" minlength="5" maxlength="1000" required placeholder="Tell the team what changed."></textarea>
                <label class="cancellation-confirmation"><input id="accountCancellationConfirm" type="checkbox" required><span>I understand this is a request and the order is not cancelled yet.</span></label>
                <p id="accountCancellationMessage" class="auth-message" role="status"></p>
                <div class="cancellation-modal-actions"><button type="button" class="account-outline" data-close-cancellation-modal>Keep order</button><button id="accountCancellationSubmit" type="submit" class="account-primary">Send request</button></div>
              </form>
            </section>
          </div>
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
              whatsapp: document.getElementById('profileWhatsapp').value.trim(),
              dateOfBirth: document.getElementById('profileDob').value.trim(),
              country: document.getElementById('profileCountry').value.trim(),
              addressLine1: document.getElementById('profileAddress1').value.trim(),
              addressLine2: document.getElementById('profileAddress2').value.trim(),
              city: document.getElementById('profileCity').value.trim(),
              parish: document.getElementById('profileParish').value.trim(),
              stateProvince: document.getElementById('profileState').value.trim(),
              postalCode: document.getElementById('profilePostal').value.trim()
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

    const showRedeemMessage = (text, type = 'success') => {
      const target = document.getElementById('redeemMessage');
      if (!target) return;
      target.textContent = text;
      target.className = `auth-message visible ${type}`;
    };
    document.querySelectorAll('.redeem-credits-btn').forEach((button) => button.addEventListener('click', async () => {
      const credits = Number(button.dataset.redeemCredits);
      if (!credits) return;
      const original = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      try {
        const result = await portalFetch('/api/rewards/redeem', { method: 'POST', body: JSON.stringify({ credits }) });
        await loadPortal();
        switchTab('rewards');
        showRedeemMessage(`Success! Use code ${result.code} at checkout for ${formatCurrency(result.cashValueJmd)} off — valid until ${formatDate(result.validUntil)}.`, 'success');
      } catch (error) {
        showRedeemMessage(error.message || 'Unable to redeem right now.', 'error');
        button.disabled = false;
        button.innerHTML = original;
      }
    }));

    document.getElementById('loadReferralCodeBtn')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const box = document.getElementById('referralCodeBox');
      setButtonBusy(button, true);
      try {
        const result = await portalFetch('/api/rewards/referral-code');
        box.innerHTML = `<code class="referral-code-value">${escapeHtml(result.referralCode)}</code><button id="copyReferralCodeBtn" class="account-outline" type="button"><i class="fas fa-copy"></i>Copy</button>`;
        document.getElementById('copyReferralCodeBtn')?.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(result.referralCode);
            showRedeemMessage('Referral code copied — share it with a friend!', 'success');
          } catch (_) { showRedeemMessage(`Your referral code is ${result.referralCode}`, 'success'); }
        });
      } catch (error) {
        setButtonBusy(button, false);
        showRedeemMessage(error.message || 'Unable to load your referral code.', 'error');
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

    const cancellationModal = document.getElementById('cancellationRequestModal');
    const openCancellationModal = (orderNumber) => {
      if (!cancellationModal || !orderNumber) return;
      document.getElementById('accountCancellationOrder').value = orderNumber;
      document.getElementById('accountCancellationOrderLabel').textContent = orderNumber;
      document.getElementById('accountCancellationReason').value = '';
      document.getElementById('accountCancellationConfirm').checked = false;
      const modalMessage = document.getElementById('accountCancellationMessage');
      modalMessage.textContent = '';
      modalMessage.className = 'auth-message';
      cancellationModal.hidden = false;
      document.body.classList.add('cancellation-modal-open');
      document.getElementById('accountCancellationReason').focus();
    };
    const closeCancellationModal = () => {
      if (!cancellationModal) return;
      cancellationModal.hidden = true;
      document.body.classList.remove('cancellation-modal-open');
    };
    document.querySelectorAll('.cancel-order-portal-btn').forEach((button) => button.addEventListener('click', () => openCancellationModal(button.dataset.orderNumber)));
    document.querySelectorAll('[data-close-cancellation-modal]').forEach((button) => button.addEventListener('click', closeCancellationModal));
    document.getElementById('accountCancellationForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const orderNumber = document.getElementById('accountCancellationOrder').value;
      const reason = document.getElementById('accountCancellationReason').value.trim();
      const submitButton = document.getElementById('accountCancellationSubmit');
      const modalMessage = document.getElementById('accountCancellationMessage');
      setButtonBusy(submitButton, true, 'Send request');
      try {
        await portalFetch('/api/orders/cancel', { method: 'POST', body: JSON.stringify({ orderNumber, reason }) });
        modalMessage.textContent = 'Request sent. Your order remains active while the store reviews it.';
        modalMessage.className = 'auth-message visible success';
        window.setTimeout(loadPortal, 900);
      } catch (error) {
        modalMessage.textContent = error.message;
        modalMessage.className = 'auth-message visible error';
        setButtonBusy(submitButton, false, 'Send request');
      }
    });

    const requestedOrder = new URLSearchParams(window.location.search).get('cancel');
    if (requestedOrder) {
      switchTab('orders');
      const matchingButton = Array.from(document.querySelectorAll('.cancel-order-portal-btn')).find((button) => button.dataset.orderNumber === requestedOrder);
      if (matchingButton) openCancellationModal(requestedOrder);
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
    }

    document.querySelectorAll('[data-dismiss-policy-notification]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.dismissPolicyNotification;
        if (!id) return;
        saveDismissedNotification(id);
        const item = Array.from(document.querySelectorAll('[data-policy-notification]')).find((node) => node.dataset.policyNotification === id);
        item?.remove();
        const panel = document.querySelector('[data-policy-notifications]');
        if (panel && !panel.querySelector('[data-policy-notification]')) panel.remove();
      });
    });
  }

  async function loadPortal() {
    if (!root || !window.supabase) return;
    showLoading();
    const { data } = await window.supabase.auth.getSession();
    session = data && data.session;
    if (!session) {
      showLoginGate();
      return;
    }
    try {
      const payload = await portalFetch('/api/customer-portal');
      renderPortal(payload);
    } catch (error) {
      if (String(error.message || '').toLowerCase().includes('sign in')) {
        showLoginGate();
        return;
      }
      root.innerHTML = `<main class="account-shell"><div class="account-wrap"><div class="account-empty"><i class="fas fa-triangle-exclamation"></i><h3>We could not open your account.</h3><p>${escapeHtml(error.message || 'Please refresh and try again.')}</p><a class="reward-request" href="customer-login.html">Return to sign in <i class="fas fa-arrow-right ml-1"></i></a></div></div></main>`;
    }
  }

  document.addEventListener('DOMContentLoaded', loadPortal);
})();
