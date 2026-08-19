// Glow & Go Rewards — VIP Rewards tab (semi-annual free-product fulfilment).
import { supabase } from '/admin/js/supabase-client.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatDate = (v) => { const d = new Date(v); return Number.isNaN(d.valueOf()) ? '—' : d.toLocaleDateString('en-JM', { year: 'numeric', month: 'short', day: 'numeric' }); };

async function adminFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed.');
  return payload;
}

function toast(message, type = 'success') {
  window.showRewardsToast ? window.showRewardsToast(message, type) : alert(message);
}

function panelMarkup() {
  return `
    <section class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden mb-8">
      <div class="px-6 py-4 border-b border-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-stone-50">
        <div><h2 class="font-bold text-stone-800">Luminous VIP product rewards</h2><p class="text-xs text-stone-500 mt-1">1 free serum + 1 free toner, semi-annually, for members currently at the top tier. Generated automatically every Jan 1 / Jul 1, or run it now.</p></div>
        <button id="vip_generateBtn" class="small-btn" type="button"><i class="fas fa-rotate mr-1"></i>Generate this period's rewards</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-sm">
          <thead><tr class="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold">
            <th class="p-4">Member</th><th class="p-4">Period</th><th class="p-4">Status</th><th class="p-4">Note</th><th class="p-4 text-right">Action</th>
          </tr></thead>
          <tbody id="vip_tableBody"><tr><td colspan="5" class="p-8 text-center text-stone-500">Loading…</td></tr></tbody>
        </table>
      </div>
    </section>`;
}

async function loadRewards() {
  const tbody = document.getElementById('vip_tableBody');
  const { data: rewards, error } = await supabase.from('glow_vip_product_rewards').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) { tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-red-600">${escapeHtml(error.message)}</td></tr>`; return; }
  if (!rewards || !rewards.length) { tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-stone-500">No VIP rewards generated yet.</td></tr>`; return; }

  const customerIds = Array.from(new Set(rewards.map((r) => r.customer_id).filter(Boolean)));
  const { data: customers } = customerIds.length ? await supabase.from('customers').select('id, full_name, email').in('id', customerIds) : { data: [] };
  const byId = new Map((customers || []).map((c) => [c.id, c]));

  tbody.innerHTML = rewards.map((r) => {
    const c = byId.get(r.customer_id);
    return `<tr class="border-b border-stone-100" data-vip-row="${r.id}">
      <td class="p-4"><div class="font-bold text-stone-800">${escapeHtml(c?.full_name || 'Member')}</div><div class="text-xs text-stone-500">${escapeHtml(c?.email || '')}</div></td>
      <td class="p-4">${escapeHtml(r.period_label)}</td>
      <td class="p-4">${r.status === 'fulfilled' ? `<span class="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 font-bold">Fulfilled</span>` : `<span class="px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-800 font-bold">Pending</span>`}</td>
      <td class="p-4 text-stone-500">${r.fulfilled_at ? `Marked ${formatDate(r.fulfilled_at)}` : (r.note ? escapeHtml(r.note) : '—')}</td>
      <td class="p-4 text-right">${r.status !== 'fulfilled' ? `<button class="small-btn" type="button" data-mark-fulfilled="${r.id}"><i class="fas fa-check mr-1"></i>Mark fulfilled</button>` : ''}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-mark-fulfilled]').forEach((btn) => btn.addEventListener('click', () => markFulfilled(btn.dataset.markFulfilled)));
}

async function markFulfilled(id) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('glow_vip_product_rewards').update({ status: 'fulfilled', fulfilled_at: new Date().toISOString(), fulfilled_by: user?.id || null }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Marked as fulfilled.');
  await loadRewards();
}

async function generate() {
  const button = document.getElementById('vip_generateBtn');
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Generating…';
  try {
    const result = await adminFetch('/api/admin/rewards/vip-rewards/generate', { method: 'POST' });
    toast(`Generated ${result.created} new reward${result.created === 1 ? '' : 's'} for ${result.period}.`);
    await loadRewards();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-rotate mr-1"></i>Generate this period\'s rewards';
  }
}

export async function initRewardsVipTab() {
  const panel = document.getElementById('rewardsPanel-vip');
  if (!panel) return;
  panel.innerHTML = panelMarkup();
  document.getElementById('vip_generateBtn').addEventListener('click', generate);
  await loadRewards();
}
