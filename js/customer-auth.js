(() => {
  const byId = (id) => document.getElementById(id);
  const message = byId('authMessage');
  const tabs = Array.from(document.querySelectorAll('[data-auth-tab]'));
  const panels = Array.from(document.querySelectorAll('[data-auth-panel]'));
  const loginForm = byId('loginForm');
  const registerForm = byId('registerForm');
  const resetButton = byId('resetPasswordBtn');

  function showMessage(text, type = 'success') {
    if (!message) return;
    message.textContent = text;
    message.className = `auth-message visible ${type}`;
  }

  function clearMessage() {
    if (!message) return;
    message.textContent = '';
    message.className = 'auth-message';
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (!button.dataset.label) button.dataset.label = button.innerHTML;
    button.disabled = busy;
    button.innerHTML = busy ? '<i class="fas fa-spinner fa-spin"></i>Please wait…' : (label || button.dataset.label);
  }

  function activateTab(tab) {
    tabs.forEach((button) => button.classList.toggle('active', button.dataset.authTab === tab));
    panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.authPanel === tab));
    clearMessage();
  }

  async function redirectIfAuthenticated() {
    if (!window.supabase) return;
    const { data } = await window.supabase.auth.getSession();
    if (data && data.session) window.location.replace('account.html');
  }

  tabs.forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.authTab)));

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();
    const email = byId('loginEmail').value.trim();
    const password = byId('loginPassword').value;
    const button = byId('loginSubmitBtn');
    if (!email || !password) return showMessage('Enter your email address and password.', 'error');
    if (!window.supabase) return showMessage('Account service is unavailable. Please refresh and try again.', 'error');

    setBusy(button, true);
    try {
      const { error } = await window.supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.assign('account.html');
    } catch (error) {
      showMessage(error.message || 'We could not sign you in. Please try again.', 'error');
    } finally {
      setBusy(button, false);
    }
  });

  registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();
    const fullName = byId('registerName').value.trim();
    const email = byId('registerEmail').value.trim();
    const password = byId('registerPassword').value;
    const confirmPassword = byId('registerConfirmPassword').value;
    const button = byId('registerSubmitBtn');

    if (!fullName || !email || !password || !confirmPassword) return showMessage('Complete all account fields to continue.', 'error');
    if (password.length < 8) return showMessage('Choose a password with at least 8 characters.', 'error');
    if (password !== confirmPassword) return showMessage('Your passwords do not match.', 'error');
    if (!window.supabase) return showMessage('Account service is unavailable. Please refresh and try again.', 'error');

    setBusy(button, true);
    try {
      const { data, error } = await window.supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/account.html`
        }
      });
      if (error) throw error;
      if (data && data.session) {
        window.location.assign('account.html');
        return;
      }
      showMessage('Your account has been created. Check your email to confirm it, then sign in to see your purchases and Glow Credits.', 'success');
      activateTab('login');
      byId('loginEmail').value = email;
    } catch (error) {
      showMessage(error.message || 'We could not create your account. Please try again.', 'error');
    } finally {
      setBusy(button, false);
    }
  });

  resetButton?.addEventListener('click', async () => {
    clearMessage();
    const email = byId('loginEmail').value.trim();
    if (!email) return showMessage('Enter your email first, then select “Reset password.”', 'error');
    if (!window.supabase) return showMessage('Account service is unavailable. Please refresh and try again.', 'error');
    setBusy(resetButton, true);
    try {
      const { error } = await window.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/customer-login.html`
      });
      if (error) throw error;
      showMessage('A password reset link has been sent to your email address.', 'success');
    } catch (error) {
      showMessage(error.message || 'We could not send a reset link. Please try again.', 'error');
    } finally {
      setBusy(resetButton, false, 'Reset password');
    }
  });

  document.addEventListener('DOMContentLoaded', redirectIfAuthenticated);
})();
