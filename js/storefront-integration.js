(() => {
  const accountLoginUrl = 'customer-login.html';
  const accountUrl = 'account.html';

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function findField(form, name) {
    return form ? form.querySelector(`[name="${name}"]`) : null;
  }

  function setIfEmpty(field, value) {
    if (field && !field.value && value) field.value = value;
  }

  function addCheckoutAccountNote(form, profile, signedIn) {
    if (!form || document.getElementById('checkoutAccountNote')) return;
    const contactHeading = Array.from(form.querySelectorAll('h3')).find((heading) => heading.textContent.trim() === 'Contact Information');
    if (!contactHeading) return;

    const note = document.createElement('div');
    note.id = 'checkoutAccountNote';
    note.className = 'mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-stone-700 leading-6';
    if (signedIn) {
      note.innerHTML = `<i class="fas fa-circle-check text-amber-800 mr-2"></i><strong>Shopping as ${escapeHtml(profile.fullName || 'a For You Skin Bar member')}.</strong> This purchase will appear in your account and eligible paid orders earn Glow Credits.`;
    } else {
      note.innerHTML = `<i class="fas fa-sparkles text-amber-800 mr-2"></i><a class="font-bold underline" href="${accountLoginUrl}">Sign in to your account</a> before checking out to automatically connect this purchase to your order history and Glow Credits.`;
    }
    contactHeading.insertAdjacentElement('afterend', note);
  }

  function ensureAccountEntryPoint(session) {
    const nav = document.querySelector('.glass-nav');
    if (!nav || nav.querySelector('a[data-customer-account-entry]')) return;
    const actionGroups = Array.from(nav.children).filter((child) => child.classList?.contains('flex'));
    const actions = actionGroups[actionGroups.length - 1];
    if (!actions) return;
    const existingAccount = actions.querySelector('a[href="customer-login.html"], a[href="account.html"], a[href="admin/login.html"]');
    if (existingAccount) return;

    const link = document.createElement('a');
    link.dataset.customerAccountEntry = 'true';
    link.href = session ? accountUrl : accountLoginUrl;
    link.title = session ? 'My Account' : 'Sign in or create an account';
    link.setAttribute('aria-label', link.title);
    link.className = 'text-stone-700 hover:text-amber-800 transition';
    link.innerHTML = '<i class="fas fa-user text-xl"></i>';
    actions.insertAdjacentElement('afterbegin', link);
  }

  async function fetchAccountProfile(accessToken) {
    const response = await fetch('/api/customer-portal', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error('Unable to load account details.');
    return response.json();
  }

  async function integrateAuthenticatedCheckout(session) {
    const form = document.getElementById('checkoutForm');
    if (!form || !session) return;
    const email = session.user?.email || '';
    let profile = {
      fullName: session.user?.user_metadata?.full_name || session.user?.user_metadata?.name || '',
      email,
      phone: session.user?.user_metadata?.phone || '',
      whatsapp: ''
    };

    try {
      const account = await fetchAccountProfile(session.access_token);
      if (account?.profile) profile = { ...profile, ...account.profile };
    } catch (_) {
      // The signed-in customer can still check out. Their Supabase profile fills
      // the basic contact fields while the customer record is created or linked.
    }

    setIfEmpty(findField(form, 'fullName'), profile.fullName);
    setIfEmpty(findField(form, 'phone'), profile.phone || profile.whatsapp);
    const emailField = findField(form, 'email');
    if (emailField && email) {
      emailField.value = email.toLowerCase();
      emailField.readOnly = true;
      emailField.classList.add('bg-stone-100', 'cursor-not-allowed');
      emailField.title = 'Your account email keeps this order connected to your purchase history and Glow Credits.';
    }
    addCheckoutAccountNote(form, profile, true);
  }

  function normalizeCheckoutEmail() {
    const emailField = document.querySelector('#checkoutForm [name="email"]');
    if (emailField && !emailField.readOnly) {
      emailField.addEventListener('change', () => { emailField.value = emailField.value.trim().toLowerCase(); });
    }
  }

  async function updateAccountLinksAndCheckout() {
    if (!window.supabase?.auth) return;
    const { data } = await window.supabase.auth.getSession();
    const session = data?.session || null;

    document.querySelectorAll('a[href="customer-login.html"]').forEach((link) => {
      if (session) {
        link.href = accountUrl;
        link.title = 'My Account';
        link.setAttribute('aria-label', 'My Account');
      }
    });
    ensureAccountEntryPoint(session);

    const form = document.getElementById('checkoutForm');
    if (session) await integrateAuthenticatedCheckout(session);
    else if (form) addCheckoutAccountNote(form, {}, false);
    normalizeCheckoutEmail();
  }

  function run() {
    updateAccountLinksAndCheckout().catch((error) => {
      console.warn('Storefront account integration could not be completed.', error);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
