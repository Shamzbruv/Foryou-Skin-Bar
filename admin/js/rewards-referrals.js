// Glow & Go Rewards — Referrals tab.
import { supabase } from '/admin/js/supabase-client.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatDate = (v) => { const d = new Date(v); return Number.isNaN(d.valueOf()) ? '—' : d.toLocaleDateString('en-JM', { year: 'numeric', month: 'short', day: 'numeric' }); };

function panelMarkup() {
  return `
    <section class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden mb-8">
      <div class="px-6 py-4 border-b border-stone-100 bg-stone-50"><h2 class="font-bold text-stone-800">Referrals</h2><p class="text-xs text-stone-500 mt-1">Every customer's own referral code lives on their profile (auto-generated the first time they view it). This is the activity log.</p></div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-sm">
          <thead><tr class="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold">
            <th class="p-4">Referrer</th><th class="p-4">Friend</th><th class="p-4">Status</th><th class="p-4">Credits paid</th><th class="p-4">Started</th><th class="p-4">Completed</th>
          </tr></thead>
          <tbody id="rf_tableBody"><tr><td colspan="6" class="p-8 text-center text-stone-500">Loading referrals…</td></tr></tbody>
        </table>
      </div>
    </section>`;
}

function statusBadge(status) {
  const map = { completed: 'bg-green-100 text-green-800', pending: 'bg-amber-100 text-amber-800', expired: 'bg-stone-100 text-stone-500' };
  return `<span class="px-2 py-1 text-xs rounded-full font-bold ${map[status] || map.pending}">${escapeHtml(status)}</span>`;
}

export async function initRewardsReferralsTab() {
  const panel = document.getElementById('rewardsPanel-referrals');
  if (!panel) return;
  panel.innerHTML = panelMarkup();
  const tbody = document.getElementById('rf_tableBody');

  const { data: referrals, error } = await supabase.from('glow_referrals').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) { tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-red-600">${escapeHtml(error.message)}</td></tr>`; return; }
  if (!referrals || !referrals.length) { tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-stone-500">No referrals yet.</td></tr>`; return; }

  const customerIds = Array.from(new Set(referrals.flatMap((r) => [r.referrer_customer_id, r.referee_customer_id]).filter(Boolean)));
  const { data: customers } = customerIds.length
    ? await supabase.from('customers').select('id, full_name, email').in('id', customerIds)
    : { data: [] };
  const byId = new Map((customers || []).map((c) => [c.id, c]));
  const nameFor = (id, fallbackEmail) => {
    const c = byId.get(id);
    if (c) return `${escapeHtml(c.full_name || 'Member')}<br><span class="text-xs text-stone-500">${escapeHtml(c.email || '')}</span>`;
    return fallbackEmail ? escapeHtml(fallbackEmail) : '—';
  };

  tbody.innerHTML = referrals.map((r) => `
    <tr class="border-b border-stone-100">
      <td class="p-4">${nameFor(r.referrer_customer_id)}</td>
      <td class="p-4">${nameFor(r.referee_customer_id, r.referee_email)}</td>
      <td class="p-4">${statusBadge(r.status)}</td>
      <td class="p-4 font-semibold text-amber-800">${r.reward_credits ? Number(r.reward_credits).toLocaleString() : '—'}</td>
      <td class="p-4 text-stone-500">${formatDate(r.created_at)}</td>
      <td class="p-4 text-stone-500">${r.completed_at ? formatDate(r.completed_at) : '—'}</td>
    </tr>`).join('');
}
