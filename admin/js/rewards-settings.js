// Glow & Go Rewards — Programme Rules tab.
// This is the single control surface for every number the rewards engine (loyalty-engine.js)
// actually uses. Keep DEFAULT_POLICY in sync with the Node defaults if either changes.
import { supabase } from '/admin/js/supabase-client.js';

const DEFAULT_POLICY = {
  enabled: true,
  creditLabel: 'Glow Credits',
  signupBonus: 100,
  creditsPerJmdSpent: 0.01,
  tierNames: ['Radiant Rookie', 'Glowing Insider', 'Luminous VIP'],
  tierThresholdsJmd: [0, 10000, 25000],
  tierMultipliers: [1, 1.5, 2],
  birthdayCredits: 100,
  reviewCredits: 200,
  quizCredits: 200,
  socialShareCredits: 200,
  referralCredits: 200,
  referralFriendDiscountPercent: 20,
  expirationMonths: 6,
  redemptionDenominations: [100, 250, 500, 1000],
  creditToJmdRatio: 1,
  redemptionCodeValidDays: 14,
  noCreditsOnDiscountedOrders: true,
  removeCreditsOnRefund: true,
  allowStackingWithPromoCodes: false,
  allowStackingWithReferral: false,
  vipRewardEnabled: true,
  vipRewardFrequencyMonths: 6,
  vipRewardItems: ['1 free serum', '1 free toner']
};

const $ = (id) => document.getElementById(id);
const clone = (v) => JSON.parse(JSON.stringify(v));
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lines = (value) => String(value || '').split('\n').map((v) => v.trim()).filter(Boolean);
const num = (value, fallback) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };

function normalize(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const policy = { ...clone(DEFAULT_POLICY), ...source };
  policy.tierNames = Array.isArray(source.tierNames) && source.tierNames.length ? source.tierNames.map(String) : [...DEFAULT_POLICY.tierNames];
  policy.tierThresholdsJmd = Array.isArray(source.tierThresholdsJmd) && source.tierThresholdsJmd.length ? source.tierThresholdsJmd.map((v) => num(v, 0)) : [...DEFAULT_POLICY.tierThresholdsJmd];
  policy.tierMultipliers = Array.isArray(source.tierMultipliers) && source.tierMultipliers.length ? source.tierMultipliers.map((v) => num(v, 1)) : [...DEFAULT_POLICY.tierMultipliers];
  policy.redemptionDenominations = Array.isArray(source.redemptionDenominations) && source.redemptionDenominations.length ? source.redemptionDenominations.map((v) => num(v, 0)) : [...DEFAULT_POLICY.redemptionDenominations];
  policy.vipRewardItems = Array.isArray(source.vipRewardItems) && source.vipRewardItems.length ? source.vipRewardItems.map(String) : [...DEFAULT_POLICY.vipRewardItems];
  return policy;
}

function tiersMarkup(policy) {
  return policy.tierNames.map((name, index) => `
    <div class="tier-rule-row" data-tier-index="${index}">
      <div><label class="label">Tier name</label><input class="input tier-rule-name" value="${escapeHtml(name)}"></div>
      <div><label class="label">Lifetime purchases required (J$)</label><input class="input tier-rule-threshold" type="number" min="0" step="1" value="${escapeHtml(policy.tierThresholdsJmd[index] ?? 0)}"></div>
      <div><label class="label">Earning multiplier</label><input class="input tier-rule-multiplier" type="number" min="0" step="0.1" value="${escapeHtml(policy.tierMultipliers[index] ?? 1)}"></div>
      <button type="button" class="danger-btn remove-tier-rule" ${policy.tierNames.length <= 1 ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
    </div>`).join('');
}

function panelMarkup() {
  return `
    <div class="mb-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 flex flex-col md:flex-row gap-4 md:items-start">
      <div class="w-10 h-10 rounded-xl bg-amber-200/70 text-amber-900 flex items-center justify-center shrink-0"><i class="fas fa-sliders"></i></div>
      <div><h2 class="font-bold text-stone-800">This is the real programme engine.</h2><p class="text-sm text-stone-600 mt-1 leading-6">Every number here is live: it controls how Glow Credits are actually earned, expired, and redeemed — not just the wording on the page. Changes apply to new activity immediately.</p></div>
    </div>

    <section class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-stone-50">
        <div><h2 class="font-bold text-stone-800">Programme status</h2><p class="text-xs text-stone-500 mt-1">Pause the whole rewards engine without losing any member data.</p></div>
        <label class="inline-flex items-center gap-3 text-sm font-bold text-stone-700 cursor-pointer"><input id="rw_enabled" type="checkbox" class="w-5 h-5 accent-amber-800"><span>Rewards programme active</span></label>
      </div>
      <div class="p-6 grid grid-cols-1 md:grid-cols-3 gap-5">
        <div><label class="label">Credits name</label><input id="rw_creditLabel" class="input" placeholder="Glow Credits"></div>
        <div><label class="label">Signup bonus (credits on joining)</label><input id="rw_signupBonus" type="number" min="0" class="input"></div>
        <div><label class="label">J$ spent per 1 credit earned</label><input id="rw_jmdPerCredit" type="number" min="1" class="input" placeholder="100"><p class="help">Example: 100 = 1 credit for every J$100 spent (before tier multiplier).</p></div>
      </div>
    </section>

    <section class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-stone-100 flex items-center justify-between gap-4 bg-stone-50">
        <div><h2 class="font-bold text-stone-800">Tiers</h2><p class="text-xs text-stone-500 mt-1">Based on lifetime purchase total. Tier status never reverts once reached.</p></div>
        <button id="rw_addTier" type="button" class="small-btn"><i class="fas fa-plus mr-1"></i>Add tier</button>
      </div>
      <div id="rw_tiersList" class="p-6 space-y-4"></div>
    </section>

    <section class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-stone-100 bg-stone-50"><h2 class="font-bold text-stone-800">Bonus credit amounts</h2><p class="text-xs text-stone-500 mt-1">How many credits each activity is worth.</p></div>
      <div class="p-6 grid grid-cols-1 md:grid-cols-3 gap-5">
        <div><label class="label">Birthday reward</label><input id="rw_birthdayCredits" type="number" min="0" class="input"></div>
        <div><label class="label">Review approved</label><input id="rw_reviewCredits" type="number" min="0" class="input"></div>
        <div><label class="label">Skin quiz completed</label><input id="rw_quizCredits" type="number" min="0" class="input"></div>
        <div><label class="label">Social share (awarded manually)</label><input id="rw_socialShareCredits" type="number" min="0" class="input"></div>
        <div><label class="label">Referral reward (per completed referral)</label><input id="rw_referralCredits" type="number" min="0" class="input"></div>
        <div><label class="label">Friend's first-order discount (%)</label><input id="rw_referralFriendDiscountPercent" type="number" min="0" max="100" class="input"></div>
      </div>
    </section>

    <section class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-stone-100 bg-stone-50"><h2 class="font-bold text-stone-800">Expiration & redemption</h2><p class="text-xs text-stone-500 mt-1">100 credits always equals J$100 off, per the confirmed programme policy.</p></div>
      <div class="p-6 grid grid-cols-1 md:grid-cols-3 gap-5">
        <div><label class="label">Credits expire after (months)</label><input id="rw_expirationMonths" type="number" min="1" class="input"></div>
        <div><label class="label">Redemption reward tiers (credits, comma separated)</label><input id="rw_redemptionDenominations" class="input" placeholder="100, 250, 500, 1000"></div>
        <div><label class="label">Redemption code valid for (days)</label><input id="rw_redemptionCodeValidDays" type="number" min="1" class="input"></div>
      </div>
    </section>

    <section class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-stone-100 bg-stone-50"><h2 class="font-bold text-stone-800">Programme policy toggles</h2><p class="text-xs text-stone-500 mt-1">These match the confirmed launch policy — change them only if the policy changes.</p></div>
      <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <label class="flex items-start gap-3 cursor-pointer rounded-xl border border-stone-200 p-4 bg-stone-50"><input id="rw_noCreditsOnDiscountedOrders" type="checkbox" class="w-5 h-5 mt-0.5 accent-amber-800"><span><strong class="text-stone-800 text-sm">No credits on discounted orders</strong><span class="block text-xs text-stone-500 mt-1">Applies to any order using a promo, referral, or redemption code.</span></span></label>
        <label class="flex items-start gap-3 cursor-pointer rounded-xl border border-stone-200 p-4 bg-stone-50"><input id="rw_removeCreditsOnRefund" type="checkbox" class="w-5 h-5 mt-0.5 accent-amber-800"><span><strong class="text-stone-800 text-sm">Remove credits on refund/cancellation</strong><span class="block text-xs text-stone-500 mt-1">Tier progress is never reduced, even when credits are clawed back.</span></span></label>
        <label class="flex items-start gap-3 cursor-pointer rounded-xl border border-stone-200 p-4 bg-stone-50"><input id="rw_allowStackingWithPromoCodes" type="checkbox" class="w-5 h-5 mt-0.5 accent-amber-800"><span><strong class="text-stone-800 text-sm">Allow combining credits with promo codes</strong><span class="block text-xs text-stone-500 mt-1">Currently unsupported by checkout (one code per order) — leave off.</span></span></label>
        <label class="flex items-start gap-3 cursor-pointer rounded-xl border border-stone-200 p-4 bg-stone-50"><input id="rw_allowStackingWithReferral" type="checkbox" class="w-5 h-5 mt-0.5 accent-amber-800"><span><strong class="text-stone-800 text-sm">Allow combining credits with referral discount</strong><span class="block text-xs text-stone-500 mt-1">Currently unsupported by checkout (one code per order) — leave off.</span></span></label>
      </div>
    </section>

    <section class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden mb-8">
      <div class="px-6 py-4 border-b border-stone-100 flex items-center justify-between gap-4 bg-stone-50">
        <div><h2 class="font-bold text-stone-800">Luminous VIP product reward</h2><p class="text-xs text-stone-500 mt-1">Physical product gift, tracked in the VIP Rewards tab — fulfilment is manual.</p></div>
        <label class="inline-flex items-center gap-3 text-sm font-bold text-stone-700 cursor-pointer"><input id="rw_vipRewardEnabled" type="checkbox" class="w-5 h-5 accent-amber-800"><span>Enabled</span></label>
      </div>
      <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div><label class="label">Frequency (months)</label><input id="rw_vipRewardFrequencyMonths" type="number" min="1" class="input"></div>
        <div><label class="label">Reward items (one per line)</label><textarea id="rw_vipRewardItems" class="input min-h-20"></textarea></div>
      </div>
    </section>

    <div class="flex justify-end pb-8"><button id="rw_saveBtn" class="px-5 py-2.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white font-semibold text-sm shadow-sm transition"><i class="fas fa-save mr-2"></i>Save Programme Rules</button></div>
  `;
}

let policy = clone(DEFAULT_POLICY);

function fill() {
  $('rw_enabled').checked = policy.enabled !== false;
  $('rw_creditLabel').value = policy.creditLabel;
  $('rw_signupBonus').value = policy.signupBonus;
  $('rw_jmdPerCredit').value = policy.creditsPerJmdSpent > 0 ? Math.round(1 / policy.creditsPerJmdSpent) : 100;
  $('rw_tiersList').innerHTML = tiersMarkup(policy);
  bindTierRows();
  $('rw_birthdayCredits').value = policy.birthdayCredits;
  $('rw_reviewCredits').value = policy.reviewCredits;
  $('rw_quizCredits').value = policy.quizCredits;
  $('rw_socialShareCredits').value = policy.socialShareCredits;
  $('rw_referralCredits').value = policy.referralCredits;
  $('rw_referralFriendDiscountPercent').value = policy.referralFriendDiscountPercent;
  $('rw_expirationMonths').value = policy.expirationMonths;
  $('rw_redemptionDenominations').value = policy.redemptionDenominations.join(', ');
  $('rw_redemptionCodeValidDays').value = policy.redemptionCodeValidDays;
  $('rw_noCreditsOnDiscountedOrders').checked = policy.noCreditsOnDiscountedOrders !== false;
  $('rw_removeCreditsOnRefund').checked = policy.removeCreditsOnRefund !== false;
  $('rw_allowStackingWithPromoCodes').checked = !!policy.allowStackingWithPromoCodes;
  $('rw_allowStackingWithReferral').checked = !!policy.allowStackingWithReferral;
  $('rw_vipRewardEnabled').checked = policy.vipRewardEnabled !== false;
  $('rw_vipRewardFrequencyMonths').value = policy.vipRewardFrequencyMonths;
  $('rw_vipRewardItems').value = policy.vipRewardItems.join('\n');
}

function bindTierRows() {
  document.querySelectorAll('.remove-tier-rule').forEach((btn) => btn.addEventListener('click', () => {
    collect();
    const index = Number(btn.closest('[data-tier-index]').dataset.tierIndex);
    policy.tierNames.splice(index, 1);
    policy.tierThresholdsJmd.splice(index, 1);
    policy.tierMultipliers.splice(index, 1);
    fill();
  }));
}

function collect() {
  policy.enabled = $('rw_enabled').checked;
  policy.creditLabel = $('rw_creditLabel').value.trim() || 'Glow Credits';
  policy.signupBonus = num($('rw_signupBonus').value, 100);
  const jmdPerCredit = Math.max(1, num($('rw_jmdPerCredit').value, 100));
  policy.creditsPerJmdSpent = 1 / jmdPerCredit;

  const tierRows = Array.from(document.querySelectorAll('[data-tier-index]'));
  if (tierRows.length) {
    policy.tierNames = tierRows.map((row) => row.querySelector('.tier-rule-name').value.trim() || 'Tier');
    policy.tierThresholdsJmd = tierRows.map((row) => num(row.querySelector('.tier-rule-threshold').value, 0));
    policy.tierMultipliers = tierRows.map((row) => num(row.querySelector('.tier-rule-multiplier').value, 1));
  }

  policy.birthdayCredits = num($('rw_birthdayCredits').value, 100);
  policy.reviewCredits = num($('rw_reviewCredits').value, 200);
  policy.quizCredits = num($('rw_quizCredits').value, 200);
  policy.socialShareCredits = num($('rw_socialShareCredits').value, 200);
  policy.referralCredits = num($('rw_referralCredits').value, 200);
  policy.referralFriendDiscountPercent = num($('rw_referralFriendDiscountPercent').value, 20);
  policy.expirationMonths = num($('rw_expirationMonths').value, 6);
  policy.redemptionDenominations = $('rw_redemptionDenominations').value.split(',').map((v) => num(v, 0)).filter((v) => v > 0).sort((a, b) => a - b);
  policy.redemptionCodeValidDays = num($('rw_redemptionCodeValidDays').value, 14);
  policy.noCreditsOnDiscountedOrders = $('rw_noCreditsOnDiscountedOrders').checked;
  policy.removeCreditsOnRefund = $('rw_removeCreditsOnRefund').checked;
  policy.allowStackingWithPromoCodes = $('rw_allowStackingWithPromoCodes').checked;
  policy.allowStackingWithReferral = $('rw_allowStackingWithReferral').checked;
  policy.vipRewardEnabled = $('rw_vipRewardEnabled').checked;
  policy.vipRewardFrequencyMonths = num($('rw_vipRewardFrequencyMonths').value, 6);
  policy.vipRewardItems = lines($('rw_vipRewardItems').value);
}

function toast(message, type = 'success') {
  window.showRewardsToast ? window.showRewardsToast(message, type) : alert(message);
}

async function load() {
  const { data, error } = await supabase.from('store_settings').select('value').eq('key', 'glow_rewards_policy').maybeSingle();
  if (error) { toast('Could not load programme rules: ' + error.message, 'error'); return; }
  policy = normalize(data?.value);
  fill();
}

async function save() {
  collect();
  const button = $('rw_saveBtn');
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving…';
  try {
    const { error } = await supabase.from('store_settings').upsert({ key: 'glow_rewards_policy', value: policy }, { onConflict: 'key' });
    if (error) throw error;
    toast('Programme rules saved. New activity will use these numbers immediately.');
  } catch (err) {
    toast('Unable to save: ' + err.message, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-save mr-2"></i>Save Programme Rules';
  }
}

export async function initRewardsSettingsTab() {
  const panel = document.getElementById('rewardsPanel-rules');
  if (!panel) return;
  panel.innerHTML = panelMarkup();
  $('rw_addTier').addEventListener('click', () => {
    collect();
    policy.tierNames.push('New Tier');
    policy.tierThresholdsJmd.push((policy.tierThresholdsJmd[policy.tierThresholdsJmd.length - 1] || 0) + 10000);
    policy.tierMultipliers.push(1);
    fill();
  });
  $('rw_saveBtn').addEventListener('click', save);
  await load();
}
