import { supabase } from '/admin/js/supabase-client.js';

const DEFAULT_POLICY = {
  creditLabel: 'Glow Credits',
  pointsPerJmd: 1,
  tierMultipliers: [1, 2, 3],
  includeHistoricPaidOrders: true,
  historyStartDate: ''
};

const copy = (value) => JSON.parse(JSON.stringify(value));
const safe = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const asNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function parse(value) {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch (_) { return {}; } }
  return value && typeof value === 'object' ? value : {};
}

function normalizePolicy(value) {
  const raw = parse(value);
  return {
    ...copy(DEFAULT_POLICY),
    ...raw,
    pointsPerJmd: Math.max(0, asNumber(raw.pointsPerJmd, DEFAULT_POLICY.pointsPerJmd)),
    tierMultipliers: Array.isArray(raw.tierMultipliers) && raw.tierMultipliers.length ? raw.tierMultipliers.map((item) => Math.max(0, asNumber(item, 1))) : [...DEFAULT_POLICY.tierMultipliers],
    includeHistoricPaidOrders: raw.includeHistoricPaidOrders !== false,
    historyStartDate: typeof raw.historyStartDate === 'string' ? raw.historyStartDate : ''
  };
}

function policyMarkup() {
  return `
    <section id="loyaltyPointPolicyEditor" class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-stone-100 bg-stone-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div><h2 class="font-bold text-stone-800">Customer Glow Credits policy</h2><p class="text-xs text-stone-500 mt-1">This controls how customer account points are calculated from confirmed paid orders.</p></div>
        <button id="savePointPolicyBtn" type="button" class="px-4 py-2.5 rounded-lg bg-sage-700 hover:bg-sage-800 text-white font-semibold text-sm shadow-sm transition"><i class="fas fa-save mr-2"></i>Save points policy</button>
      </div>
      <div class="p-6">
        <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-stone-700 leading-6 mb-6"><i class="fas fa-circle-info text-amber-800 mr-2"></i>Customers earn points only after an order is marked <strong>Paid</strong>. This portal safely calculates their balance from qualifying purchases. Reward codes and automatic point redemption are not issued yet, so eligible rewards are requested through the business.</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div><label class="loyalty-policy-label" for="pointCreditLabel">Points name</label><input id="pointCreditLabel" class="loyalty-policy-input" placeholder="Glow Credits"></div>
          <div><label class="loyalty-policy-label" for="pointsPerJmd">Base points per J$1 spent</label><input id="pointsPerJmd" type="number" min="0" step="0.01" class="loyalty-policy-input" placeholder="1"></div>
          <label class="md:col-span-2 flex items-start gap-3 cursor-pointer rounded-xl border border-stone-200 p-4 bg-stone-50"><input id="includeHistoricPaidOrders" type="checkbox" class="w-5 h-5 mt-0.5 accent-amber-800"><span><strong class="text-stone-800 text-sm">Include existing paid orders</strong><span class="block text-xs text-stone-500 mt-1">Keep this on to calculate rewards from paid purchases already in the store. Turn it off to start the programme from a selected date.</span></span></label>
          <div id="historyStartWrap"><label class="loyalty-policy-label" for="historyStartDate">Programme start date</label><input id="historyStartDate" type="date" class="loyalty-policy-input"><p class="text-xs text-stone-500 mt-1">Used only when existing orders are not included.</p></div>
        </div>
        <div class="mt-7 pt-6 border-t border-stone-100"><h3 class="font-bold text-stone-800">Tier earning multipliers</h3><p class="text-xs text-stone-500 mt-1">These multipliers match each loyalty tier in the order displayed on the customer loyalty page.</p><div id="pointTierMultiplierList" class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4"></div></div>
        <p id="pointPolicyStatus" class="hidden mt-4 text-sm"></p>
      </div>
    </section>`;
}

function tierMultiplierMarkup(tiers, policy) {
  const target = document.getElementById('pointTierMultiplierList');
  if (!target) return;
  target.innerHTML = tiers.map((tier, index) => {
    const multiplier = policy.tierMultipliers[index] ?? 1;
    return `<div class="rounded-xl border border-amber-200 bg-amber-50/50 p-4"><p class="text-xs font-bold uppercase tracking-wider text-sage-700">${safe(tier.rank || `Tier ${index + 1}`)}</p><p class="font-bold text-stone-800 mt-1">${safe(tier.name || `Tier ${index + 1}`)}</p><label class="loyalty-policy-label mt-4" for="tierMultiplier-${index}">Points multiplier</label><input id="tierMultiplier-${index}" data-tier-multiplier type="number" min="0" step="0.1" class="loyalty-policy-input" value="${safe(multiplier)}"><p class="text-xs text-stone-500 mt-1">Example: 1 = normal earning, 2 = double.</p></div>`;
  }).join('');
}

function setStatus(message, type = 'success') {
  const status = document.getElementById('pointPolicyStatus');
  if (!status) return;
  status.textContent = message;
  status.className = `mt-4 text-sm ${type === 'error' ? 'text-red-600' : 'text-sage-700'}`;
}

async function initPolicyManager() {
  if (!window.location.pathname.endsWith('/admin/loyalty.html')) return;
  const container = document.querySelector('main .max-w-6xl');
  if (!container || document.getElementById('loyaltyPointPolicyEditor')) return;

  const sections = Array.from(container.querySelectorAll(':scope > section'));
  const firstSection = sections[0];
  if (firstSection) firstSection.insertAdjacentHTML('afterend', policyMarkup());
  else container.insertAdjacentHTML('beforeend', policyMarkup());

  const { data, error } = await supabase.from('store_settings').select('key, value').in('key', ['loyalty_program', 'loyalty_point_policy']);
  if (error) { setStatus(`Could not load the points policy: ${error.message}`, 'error'); return; }
  const settings = (data || []).reduce((all, row) => ({ ...all, [row.key]: row.value }), {});
  const policy = normalizePolicy(settings.loyalty_point_policy);
  const programme = parse(settings.loyalty_program);
  const tiers = Array.isArray(programme.tiers) && programme.tiers.length ? programme.tiers : [
    { name: 'Radiant Rookie', rank: 'Level One' },
    { name: 'Glowing Insider', rank: 'Level Two' },
    { name: 'Luminous VIP', rank: 'Level Three' }
  ];

  document.getElementById('pointCreditLabel').value = policy.creditLabel;
  document.getElementById('pointsPerJmd').value = policy.pointsPerJmd;
  document.getElementById('includeHistoricPaidOrders').checked = policy.includeHistoricPaidOrders;
  document.getElementById('historyStartDate').value = policy.historyStartDate || '';
  tierMultiplierMarkup(tiers, policy);

  const historicalToggle = document.getElementById('includeHistoricPaidOrders');
  const dateWrap = document.getElementById('historyStartWrap');
  const toggleDate = () => dateWrap.classList.toggle('opacity-50', historicalToggle.checked);
  historicalToggle.addEventListener('change', toggleDate);
  toggleDate();

  document.getElementById('savePointPolicyBtn').addEventListener('click', async () => {
    const button = document.getElementById('savePointPolicyBtn');
    const nextPolicy = {
      creditLabel: document.getElementById('pointCreditLabel').value.trim() || 'Glow Credits',
      pointsPerJmd: Math.max(0, asNumber(document.getElementById('pointsPerJmd').value, 1)),
      includeHistoricPaidOrders: document.getElementById('includeHistoricPaidOrders').checked,
      historyStartDate: document.getElementById('historyStartDate').value || '',
      tierMultipliers: Array.from(document.querySelectorAll('[data-tier-multiplier]')).map((input) => Math.max(0, asNumber(input.value, 1)))
    };
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving…';
    try {
      const { error: saveError } = await supabase.from('store_settings').upsert({ key: 'loyalty_point_policy', value: nextPolicy }, { onConflict: 'key' });
      if (saveError) throw saveError;
      setStatus('Points policy saved. Customer accounts now use this calculation.');
    } catch (saveError) {
      setStatus(`Unable to save points policy: ${saveError.message}`, 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-save mr-2"></i>Save points policy';
    }
  });
}

function waitForLoyaltyEditor() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(initPolicyManager, 250), { once: true });
  } else {
    window.setTimeout(initPolicyManager, 250);
  }
}

waitForLoyaltyEditor();
