import { supabase } from '/admin/js/supabase-client.js';

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
  const { error } = await supabase.from('orders').update({ [field]: value }).eq('id', orderId);
  if (error) throw error;
}

async function enhanceOrderModal(orderId) {
  const { data: order, error } = await supabase
    .from('orders')
    .select('status, payment_status, fulfillment_status')
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
      await updateOrderField(orderId, 'status', orderStatusSelect.value);
      notify(`Order status updated to ${orderStatusSelect.options[orderStatusSelect.selectedIndex].text}.`);
    } catch (updateError) {
      notify(`Unable to update order status: ${updateError.message}`, 'error');
    }
  };

  const statusHint = document.getElementById('customerPortalStatusHint') || document.createElement('p');
  statusHint.id = 'customerPortalStatusHint';
  statusHint.className = 'mt-3 text-xs leading-5 text-stone-500';
  statusHint.innerHTML = '<i class="fas fa-circle-info text-amber-800 mr-1"></i>Payment and fulfilment are shown separately in the customer portal. Mark an order <strong>Paid</strong> for eligible Glow Credits to appear in the customer account.';
  if (!document.getElementById('customerPortalStatusHint')) fulfillment.parentElement?.parentElement?.appendChild(statusHint);
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
