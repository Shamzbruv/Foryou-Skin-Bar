import { supabase } from '/admin/js/supabase-client.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

function notify(message, type = 'success') {
  let toast = document.getElementById('adminIntegrationToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'adminIntegrationToast';
    toast.className = 'fixed right-5 bottom-5 z-[999] max-w-sm rounded-xl px-4 py-3 text-sm font-semibold shadow-xl transition-all duration-200 translate-y-24 opacity-0';
    document.body.appendChild(toast);
  }
  toast.className = `fixed right-5 bottom-5 z-[999] max-w-sm rounded-xl px-4 py-3 text-sm font-semibold shadow-xl transition-all duration-200 ${type === 'error' ? 'bg-red-600 text-white' : 'bg-stone-900 text-white'} translate-y-0 opacity-100`;
  toast.textContent = message;
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => toast.classList.add('translate-y-24', 'opacity-0'), 3400);
}

function orderStatusOptions(value) {
  const options = [
    ['pending', 'Pending'],
    ['confirmed', 'Confirmed'],
    ['processing', 'Processing'],
    ['ready_for_pickup', 'Ready for pickup'],
    ['shipped', 'Shipped'],
    ['delivered', 'Delivered'],
    ['cancelled', 'Cancelled'],
    ['refunded', 'Refunded']
  ];
  return options.map(([optionValue, label]) => `<option value="${optionValue}" ${optionValue === value ? 'selected' : ''}>${label}</option>`).join('');
}

function paymentStatusOptions(value) {
  const options = [
    ['unpaid', 'Unpaid'],
    ['awaiting_confirmation', 'Awaiting confirmation'],
    ['paid', 'Paid'],
    ['partially_paid', 'Partially paid'],
    ['refunded', 'Refunded']
  ];
  return options.map(([optionValue, label]) => `<option value="${optionValue}" ${optionValue === value ? 'selected' : ''}>${label}</option>`).join('');
}

function fulfillmentStatusOptions(value) {
  const options = [
    ['unfulfilled', 'Unfulfilled'],
    ['packed', 'Packed'],
    ['shipped', 'Shipped'],
    ['delivered', 'Delivered'],
    ['picked_up', 'Picked up']
  ];
  return options.map(([optionValue, label]) => `<option value="${optionValue}" ${optionValue === value ? 'selected' : ''}>${label}</option>`).join('');
}

async function updateOrderField(orderId, field, value) {
  if (field === 'status' || field === 'payment_status') {
    return adminApi(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ field, value })
    });
  }
  const { error } = await supabase.from('orders').update({ [field]: value }).eq('id', orderId);
  if (error) throw error;
  return { success: true };
}

async function adminApi(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (!accessToken) throw new Error('Your admin session has expired. Sign in again.');
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The update could not be completed.');
  return result;
}

function shippingEmailMessage(emailStatus) {
  if (emailStatus === 'sent') return ' The customer email was sent.';
  if (emailStatus === 'queued') return ' The customer email was queued.';
  if (emailStatus === 'already_sent') return ' The original shipped email was already sent.';
  if (emailStatus === 'no_customer_email') return ' No customer email is saved on this order.';
  if (emailStatus === 'failed') return ' The email could not be sent; check the email log.';
  return '';
}

function trackingEditor(orderId, order, deliveryService = '') {
  const existing = document.getElementById('orderTrackingEditor');
  if (existing) existing.remove();

  const panel = document.createElement('section');
  panel.id = 'orderTrackingEditor';
  panel.className = 'mt-5 min-w-0 overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40 p-4';
  const suggestedCarrier = order.tracking_carrier || (/dhl/i.test(deliveryService) ? 'DHL' : '');
  panel.innerHTML = `
    <div class="flex items-start gap-3">
      <i class="fas fa-truck-fast mt-1 text-amber-700" aria-hidden="true"></i>
      <div>
        <h4 class="font-bold text-stone-900">Shipment tracking</h4>
        <p class="mt-1 break-words text-xs leading-5 text-stone-600">These saved details appear in the customer account and in shipment emails.</p>
      </div>
    </div>
    <div class="mt-4 grid min-w-0 gap-3">
      <label class="block text-xs font-bold text-stone-600">Carrier
        <input id="trackingCarrierInput" type="text" maxlength="100" value="${escapeHtml(suggestedCarrier)}" placeholder="DHL" class="mt-1 w-full min-w-0 max-w-full rounded border border-stone-300 bg-white p-2 text-sm text-stone-900">
      </label>
      <label class="block text-xs font-bold text-stone-600">Tracking number
        <input id="trackingNumberInput" type="text" maxlength="180" value="${escapeHtml(order.tracking_number || '')}" placeholder="Enter the carrier reference" class="mt-1 w-full min-w-0 max-w-full rounded border border-stone-300 bg-white p-2 text-sm text-stone-900">
      </label>
      <label class="block text-xs font-bold text-stone-600">Tracking web address
        <input id="trackingUrlInput" type="url" maxlength="2000" value="${escapeHtml(order.tracking_url || '')}" placeholder="https://www.dhl.com/..." class="mt-1 w-full min-w-0 max-w-full rounded border border-stone-300 bg-white p-2 text-sm text-stone-900">
      </label>
      <a id="trackingLinkPreview" class="hidden break-all text-xs font-semibold text-amber-800 underline" target="_blank" rel="noopener noreferrer">Open saved tracking page</a>
    </div>
    <p id="trackingEditorStatus" class="mt-3 text-xs leading-5 text-stone-600" aria-live="polite"></p>
    <div class="mt-4 flex flex-wrap gap-2">
      <button id="saveTrackingButton" type="button" class="rounded-lg border border-amber-700 bg-white px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-50">Save tracking</button>
      <button id="notifyTrackingButton" type="button" class="rounded-lg bg-amber-800 px-3 py-2 text-xs font-bold text-white hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-50">Save &amp; email customer</button>
    </div>`;

  const statusContainer = document.getElementById('orderStatusSelect')?.closest('div.flex.flex-col')
    || document.getElementById('orderStatusSelect')?.parentElement?.parentElement;
  statusContainer?.insertAdjacentElement('afterend', panel);

  const carrierInput = panel.querySelector('#trackingCarrierInput');
  const numberInput = panel.querySelector('#trackingNumberInput');
  const urlInput = panel.querySelector('#trackingUrlInput');
  const preview = panel.querySelector('#trackingLinkPreview');
  const editorStatus = panel.querySelector('#trackingEditorStatus');
  const saveButton = panel.querySelector('#saveTrackingButton');
  const notifyButton = panel.querySelector('#notifyTrackingButton');

  const updateState = () => {
    const isShipped = order.status === 'shipped';
    notifyButton.disabled = !isShipped;
    notifyButton.title = isShipped ? 'Save these details and send a shipment update' : 'Mark the order as shipped first';
    const rawUrl = urlInput.value.trim();
    let normalizedUrl = rawUrl;
    if (normalizedUrl && !/^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;
    try {
      const parsed = normalizedUrl ? new URL(normalizedUrl) : null;
      const safe = parsed && ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
      preview.href = safe;
      preview.classList.toggle('hidden', !safe);
    } catch (_) {
      preview.classList.add('hidden');
      preview.removeAttribute('href');
    }
    if (!isShipped) editorStatus.textContent = 'Save the details now, then mark the Order Status as Shipped to send the first shipment email.';
  };

  const save = async (notifyCustomer) => {
    saveButton.disabled = true;
    notifyButton.disabled = true;
    editorStatus.textContent = notifyCustomer ? 'Saving and preparing the customer email...' : 'Saving tracking details...';
    try {
      const result = await adminApi(`/api/admin/orders/${encodeURIComponent(orderId)}/tracking`, {
        method: 'PATCH',
        body: JSON.stringify({
          tracking_carrier: carrierInput.value,
          tracking_number: numberInput.value,
          tracking_url: urlInput.value,
          notify_customer: notifyCustomer
        })
      });
      carrierInput.value = result.order?.tracking_carrier || '';
      numberInput.value = result.order?.tracking_number || '';
      urlInput.value = result.order?.tracking_url || '';
      editorStatus.textContent = notifyCustomer
        ? `Tracking saved.${shippingEmailMessage(result.email_status)}`
        : (order.status === 'shipped'
          ? 'Tracking saved. The customer account now shows these details.'
          : 'Tracking saved. The customer will see it after the order is marked shipped.');
      notify(editorStatus.textContent);
    } catch (saveError) {
      editorStatus.textContent = saveError.message;
      notify(`Unable to save tracking: ${saveError.message}`, 'error');
    } finally {
      saveButton.disabled = false;
      updateState();
    }
  };

  urlInput.addEventListener('input', updateState);
  saveButton.addEventListener('click', () => save(false));
  notifyButton.addEventListener('click', () => save(true));
  panel.updateShippingState = updateState;
  updateState();
}

async function enhanceOrderModal(orderId) {
  const { data: order, error } = await supabase
    .from('orders')
    .select('status, payment_status, fulfillment_status, delivery_service, tracking_carrier, tracking_number, tracking_url, tracking_updated_at')
    .eq('id', orderId)
    .single();
  if (error || !order) return;

  const payment = document.getElementById('paymentStatusSelect');
  const fulfillment = document.getElementById('fulfillmentStatusSelect');
  if (!payment || !fulfillment) return;

  payment.innerHTML = paymentStatusOptions(order.payment_status);
  payment.onchange = async () => {
    try {
      await updateOrderField(orderId, 'payment_status', payment.value);
      notify(`Payment status updated to ${payment.options[payment.selectedIndex].text}.`);
    } catch (updateError) {
      notify(`Unable to update payment status: ${updateError.message}`, 'error');
    }
  };

  const fulfillmentBlock = fulfillment.closest('div.flex.flex-col')?.children?.[1] || fulfillment.parentElement;
  const fulfillmentLabel = fulfillment.parentElement?.querySelector('label');
  if (fulfillmentLabel) fulfillmentLabel.textContent = 'Fulfillment Status';
  fulfillment.innerHTML = fulfillmentStatusOptions(order.fulfillment_status || 'unfulfilled');
  fulfillment.onchange = async () => {
    try {
      await updateOrderField(orderId, 'fulfillment_status', fulfillment.value);
      notify(`Fulfillment updated to ${fulfillment.options[fulfillment.selectedIndex].text}.`);
    } catch (updateError) {
      notify(`Unable to update fulfillment: ${updateError.message}`, 'error');
    }
  };

  let orderStatusSelect = document.getElementById('orderStatusSelect');
  if (!orderStatusSelect) {
    const group = document.createElement('div');
    group.innerHTML = `
      <label class="block text-xs font-bold text-stone-500 mb-1">Order Status</label>
      <select id="orderStatusSelect" class="w-full border border-gray-300 rounded p-2 text-sm"></select>`;
    fulfillment.parentElement?.insertAdjacentElement('afterend', group);
    orderStatusSelect = group.querySelector('select');
  }
  orderStatusSelect.innerHTML = orderStatusOptions(order.status);
  orderStatusSelect.onchange = async () => {
    try {
      const result = await updateOrderField(orderId, 'status', orderStatusSelect.value);
      order.status = orderStatusSelect.value;
      document.getElementById('orderTrackingEditor')?.updateShippingState?.();
      notify(`Order status updated to ${orderStatusSelect.options[orderStatusSelect.selectedIndex].text}.${shippingEmailMessage(result.email_status)}`);
    } catch (updateError) {
      notify(`Unable to update order status: ${updateError.message}`, 'error');
    }
  };

  const statusHint = document.getElementById('customerPortalStatusHint') || document.createElement('p');
  statusHint.id = 'customerPortalStatusHint';
  statusHint.className = 'mt-3 text-xs leading-5 text-stone-500';
  statusHint.innerHTML = '<i class="fas fa-circle-info text-amber-800 mr-1"></i>Payment and fulfilment are shown separately in the customer portal. Mark an order <strong>Paid</strong> for eligible Glow Credits to appear in the customer account.';
  if (!document.getElementById('customerPortalStatusHint')) fulfillment.parentElement?.parentElement?.appendChild(statusHint);
  trackingEditor(orderId, order, order.delivery_service || '');
}

function integrateOrders() {
  if (!window.location.pathname.endsWith('/admin/orders.html')) return;
  const existingOpen = window.openOrderModal;
  if (typeof existingOpen !== 'function' || existingOpen.__customerIntegrationWrapped) return;

  const wrapped = async function(orderId) {
    await existingOpen(orderId);
    await enhanceOrderModal(orderId);
  };
  wrapped.__customerIntegrationWrapped = true;
  window.openOrderModal = wrapped;
}

function waitForOrderModule() {
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    integrateOrders();
    if (typeof window.openOrderModal === 'function' || attempts > 30) window.clearInterval(timer);
  }, 150);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.setTimeout(waitForOrderModule, 0), { once: true });
} else {
  waitForOrderModule();
}
