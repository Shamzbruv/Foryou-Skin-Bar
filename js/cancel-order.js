(() => {
  const params = new URLSearchParams(window.location.search);
  const orderNumber = String(params.get('order') || '').trim();
  const token = String(params.get('token') || '').trim();
  const state = document.getElementById('cancelOrderState');
  const form = document.getElementById('guestCancellationForm');
  const message = document.getElementById('cancelFormMessage');
  const accountDestination = `account.html?cancel=${encodeURIComponent(orderNumber)}`;
  document.getElementById('cancelSignInLink').href = `customer-login.html?redirect=${encodeURIComponent(accountDestination)}`;

  function setState(text, type = '') {
    state.textContent = text;
    state.className = `cancel-state ${type}`.trim();
  }

  async function initialize() {
    if (!orderNumber || !token) return setState('This cancellation link is incomplete. Please use the link in your paid-order email.', 'error');
    if (window.supabase) {
      const { data } = await window.supabase.auth.getSession();
      if (data?.session) {
        window.location.replace(accountDestination);
        return;
      }
    }
    try {
      const response = await fetch(`/api/orders/cancellation-details?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(token)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to verify this order link.');
      document.getElementById('cancelOrderNumber').textContent = payload.orderNumber;
      document.getElementById('cancelMaskedEmail').textContent = payload.maskedEmail || 'the order email';
      if (!payload.eligible) return setState(payload.eligibilityMessage || 'This order is not eligible for cancellation.', payload.pending ? 'success' : 'error');
      setState('Secure order link verified. Complete the form below to send a request for review.', 'success');
      form.hidden = false;
    } catch (error) {
      setState(error.message, 'error');
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    message.className = 'cancel-message';
    const button = document.getElementById('cancelSubmitButton');
    button.disabled = true;
    button.textContent = 'Sending request...';
    try {
      const response = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber,
          token,
          fullName: document.getElementById('cancelFullName').value.trim(),
          email: document.getElementById('cancelEmail').value.trim(),
          phone: document.getElementById('cancelPhone').value.trim(),
          reason: document.getElementById('cancelReason').value.trim()
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to send this request.');
      form.hidden = true;
      setState(`Your cancellation request for ${payload.orderNumber} is waiting for review. The order remains active until the store approves it. Watch your email for the decision.`, 'success');
    } catch (error) {
      message.textContent = error.message;
      message.className = 'cancel-message error';
      button.disabled = false;
      button.textContent = 'Send cancellation request';
    }
  });

  document.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
