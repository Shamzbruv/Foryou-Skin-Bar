// Glow & Go Rewards — Members & Ledger tab.
import { supabase } from '/admin/js/supabase-client.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatNumber = (v) => new Intl.NumberFormat('en-JM').format(Number(v) || 0);
const formatJmd = (v) => `J$${formatNumber(v)}`;
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
    <section class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-stone-50">
        <div><h2 class="font-bold text-stone-800">Members</h2><p class="text-xs text-stone-500 mt-1">Search by name, email, or phone. Click a member to view their full credits ledger.</p></div>
        <input id="mm_search" class="input" style="max-width:280px" placeholder="Search members…">
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-sm">
          <thead><tr class="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold">
            <th class="p-4">Member</th><th class="p-4">Tier</th><th class="p-4">Balance</th><th class="p-4">Lifetime spend</th><th class="p-4">Birthday</th><th class="p-4">Joined</th>
          </tr></thead>
          <tbody id="mm_tableBody"><tr><td colspan="6" class="p-8 text-center text-stone-500">Loading members…</td></tr></tbody>
        </table>
      </div>
      <div class="p-4 flex justify-between items-center border-t border-stone-100">
        <button id="mm_prevPage" class="small-btn" type="button">Previous</button>
        <span id="mm_pageInfo" class="text-xs text-stone-500"></span>
        <button id="mm_nextPage" class="small-btn" type="button">Next</button>
      </div>
    </section>

    <section id="mm_detail" class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden mb-8" hidden>
      <div class="px-6 py-4 border-b border-stone-100 flex items-center justify-between gap-4 bg-stone-50">
        <div><p class="text-xs font-bold uppercase tracking-wider text-sage-700">Member ledger</p><h2 id="mm_detailName" class="font-bold text-stone-800 text-lg"></h2></div>
        <button id="mm_closeDetail" class="small-btn" type="button"><i class="fas fa-xmark mr-1"></i>Close</button>
      </div>
      <div class="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-sm">
              <thead><tr class="text-stone-500 text-xs uppercase tracking-wide"><th class="py-2 pr-3">Date</th><th class="py-2 pr-3">Type</th><th class="py-2 pr-3">Amount</th><th class="py-2 pr-3">Note</th></tr></thead>
              <tbody id="mm_ledgerBody"></tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 class="font-bold text-stone-800 mb-3">Manual adjustment</h3>
          <label class="label">Amount (use a negative number to remove credits)</label>
          <input id="mm_adjustAmount" type="number" step="1" class="input mb-3" placeholder="e.g. 200 or -50">
          <label class="label">Reason</label>
          <select id="mm_adjustReason" class="input mb-3">
            <option value="Social Share Bonus">Social Share Bonus</option>
            <option value="Customer Service Goodwill">Customer Service Goodwill</option>
            <option value="Walk-in / manual sale credit">Walk-in / manual sale credit</option>
            <option value="Correction">Correction</option>
            <option value="Other">Other (write below)</option>
          </select>
          <textarea id="mm_adjustNote" class="input min-h-16 mb-3" placeholder="Optional note"></textarea>
          <button id="mm_adjustSubmit" class="w-full px-4 py-2.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white font-semibold text-sm shadow-sm transition" type="button"><i class="fas fa-sparkles mr-2"></i>Apply adjustment</button>
        </div>
      </div>
    </section>`;
}

const PAGE_SIZE = 25;
let state = { offset: 0, total: 0, search: '', activeCustomerId: null };

function typeLabel(type) {
  const map = {
    earn_purchase: 'Purchase', earn_signup: 'Signup bonus', earn_birthday: 'Birthday', earn_review: 'Review',
    earn_referral: 'Referral', earn_quiz: 'Quiz', earn_social: 'Social share', earn_glow_day_bonus: 'Glow Day bonus',
    earn_manual: 'Manual credit', redeem: 'Redeemed', expire: 'Expired', reverse_refund: 'Refund reversal', reverse_manual: 'Manual removal'
  };
  return map[type] || type;
}

async function loadMembers() {
  const tbody = $('mm_tableBody');
  tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-stone-500">Loading members…</td></tr>`;
  try {
    const params = new URLSearchParams({ search: state.search, limit: PAGE_SIZE, offset: state.offset });
    const result = await adminFetch(`/api/admin/rewards/members?${params.toString()}`);
    state.total = result.total || 0;
    if (!result.members || !result.members.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-stone-500">No members found.</td></tr>`;
    } else {
      tbody.innerHTML = result.members.map((m) => `
        <tr class="border-b border-stone-100 hover:bg-stone-50 cursor-pointer" data-open-member="${m.id}" data-name="${escapeHtml(m.full_name || m.email || 'Member')}">
          <td class="p-4"><div class="font-bold text-stone-800">${escapeHtml(m.full_name || '—')}</div><div class="text-xs text-stone-500">${escapeHtml(m.email || m.phone || '')}</div></td>
          <td class="p-4">${escapeHtml(m.tier)}</td>
          <td class="p-4 font-semibold text-amber-800">${formatNumber(m.balance)}</td>
          <td class="p-4">${formatJmd(m.lifetime_purchase_jmd)}</td>
          <td class="p-4">${m.date_of_birth ? formatDate(m.date_of_birth) : '—'}</td>
          <td class="p-4">${formatDate(m.created_at)}</td>
        </tr>`).join('');
      tbody.querySelectorAll('[data-open-member]').forEach((row) => row.addEventListener('click', () => openMember(row.dataset.openMember, row.dataset.name)));
    }
    const shown = result.members?.length || 0;
    $('mm_pageInfo').textContent = state.total ? `${state.offset + 1}–${state.offset + shown} of ${state.total}` : '';
    $('mm_prevPage').disabled = state.offset <= 0;
    $('mm_nextPage').disabled = state.offset + PAGE_SIZE >= state.total;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-red-600">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function openMember(customerId, name) {
  state.activeCustomerId = customerId;
  $('mm_detail').hidden = false;
  $('mm_detailName').textContent = name;
  $('mm_ledgerBody').innerHTML = `<tr><td colspan="4" class="py-4 text-stone-500">Loading…</td></tr>`;
  $('mm_detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const result = await adminFetch(`/api/admin/rewards/members/${encodeURIComponent(customerId)}/ledger?limit=100`);
    if (!result.transactions || !result.transactions.length) {
      $('mm_ledgerBody').innerHTML = `<tr><td colspan="4" class="py-4 text-stone-500">No credit activity yet.</td></tr>`;
      return;
    }
    $('mm_ledgerBody').innerHTML = result.transactions.map((t) => `
      <tr class="border-b border-stone-100">
        <td class="py-2 pr-3 text-stone-500">${formatDate(t.created_at)}</td>
        <td class="py-2 pr-3">${typeLabel(t.type)}</td>
        <td class="py-2 pr-3 font-semibold ${Number(t.amount) >= 0 ? 'text-sage-700' : 'text-red-600'}">${Number(t.amount) >= 0 ? '+' : ''}${formatNumber(t.amount)}</td>
        <td class="py-2 pr-3 text-stone-500">${escapeHtml(t.note || '')}</td>
      </tr>`).join('');
  } catch (err) {
    $('mm_ledgerBody').innerHTML = `<tr><td colspan="4" class="py-4 text-red-600">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function submitAdjustment() {
  if (!state.activeCustomerId) return;
  const amount = Number($('mm_adjustAmount').value);
  if (!amount) { toast('Enter a non-zero amount.', 'error'); return; }
  const reasonSelect = $('mm_adjustReason').value;
  const customNote = $('mm_adjustNote').value.trim();
  const note = reasonSelect === 'Other' ? (customNote || 'Manual adjustment') : (customNote ? `${reasonSelect} — ${customNote}` : reasonSelect);
  const button = $('mm_adjustSubmit');
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Applying…';
  try {
    await adminFetch('/api/admin/rewards/adjust', { method: 'POST', body: JSON.stringify({ customerId: state.activeCustomerId, amount, note }) });
    toast('Adjustment applied.');
    $('mm_adjustAmount').value = '';
    $('mm_adjustNote').value = '';
    await openMember(state.activeCustomerId, $('mm_detailName').textContent);
    await loadMembers();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-sparkles mr-2"></i>Apply adjustment';
  }
}

export async function initRewardsMembersTab() {
  const panel = document.getElementById('rewardsPanel-members');
  if (!panel) return;
  panel.innerHTML = panelMarkup();

  let searchTimer = null;
  $('mm_search').addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { state.search = $('mm_search').value.trim(); state.offset = 0; loadMembers(); }, 350);
  });
  $('mm_prevPage').addEventListener('click', () => { state.offset = Math.max(0, state.offset - PAGE_SIZE); loadMembers(); });
  $('mm_nextPage').addEventListener('click', () => { state.offset += PAGE_SIZE; loadMembers(); });
  $('mm_closeDetail').addEventListener('click', () => { $('mm_detail').hidden = true; state.activeCustomerId = null; });
  $('mm_adjustSubmit').addEventListener('click', submitAdjustment);

  await loadMembers();
}
