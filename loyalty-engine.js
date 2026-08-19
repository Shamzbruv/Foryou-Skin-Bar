// Glow & Go Inner Circle — rewards engine.
//
// Single source of truth for every Glow Credits rule (earning, tiers, expiry, redemption,
// referrals, birthdays, reviews, quiz, manual adjustments). Required by both server.js
// (checkout/webhook/admin routes) and customer-portal-api-v2.js (the account dashboard) so
// the numbers shown to the admin and to the customer can never drift apart.
//
// Design notes (see supabase/migrations/20260819000000_glow_rewards_program.sql for schema):
//  - Credits live in glow_credit_transactions as "lots": each earn row has `remaining` and
//    `expires_at`. Spendable balance is always computed live as
//    SUM(remaining) WHERE expires_at IS NULL OR expires_at > now() — correct even if the
//    nightly pg_cron sweep hasn't run yet.
//  - Tier is based on customers.lifetime_purchase_jmd (lifetime $ spend), never reverts.
//  - An order with any discount_code (promo, referral, or a redeemed-credits code) earns
//    zero purchase credits — this is the client's confirmed "no credits on discounted
//    purchases" rule, and it structurally prevents stacking since checkout only has one
//    discount-code slot.

const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const crypto = require('crypto');

const db = createClient(
  process.env.SUPABASE_URL || 'https://xftnfbeembjrhezvzquu.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { realtime: { transport: WebSocket } }
);

const DEFAULT_POLICY = {
  enabled: true,
  creditLabel: 'Glow Credits',
  signupBonus: 100,
  creditsPerJmdSpent: 0.01, // 1 credit per J$100 spent
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

const num = (value, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const addMonths = (date, months) => { const d = new Date(date); d.setMonth(d.getMonth() + num(months, 0)); return d; };
const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + num(days, 0)); return d; };

function parseJsonValue(value) {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch (_) { return null; } }
  return value && typeof value === 'object' ? value : null;
}

async function loadPolicy() {
  const { data, error } = await db.from('store_settings').select('value').eq('key', 'glow_rewards_policy').maybeSingle();
  if (error) throw error;
  const raw = parseJsonValue(data?.value) || {};
  const policy = { ...DEFAULT_POLICY, ...raw };
  const tierThresholds = Array.isArray(raw.tierThresholdsJmd) && raw.tierThresholdsJmd.length
    ? raw.tierThresholdsJmd.map((v) => num(v, 0)) : [...DEFAULT_POLICY.tierThresholdsJmd];
  const tierMultipliers = Array.isArray(raw.tierMultipliers) && raw.tierMultipliers.length
    ? raw.tierMultipliers.map((v) => num(v, 1)) : [...DEFAULT_POLICY.tierMultipliers];
  const tierNames = Array.isArray(raw.tierNames) && raw.tierNames.length
    ? raw.tierNames.map(String) : [...DEFAULT_POLICY.tierNames];
  // Sort the three parallel tier arrays together by threshold ascending — tierFor() assumes
  // ascending order to find the highest threshold met, and the admin UI doesn't enforce order.
  const tierRows = tierThresholds.map((threshold, i) => ({ threshold, multiplier: tierMultipliers[i] ?? 1, name: tierNames[i] || `Tier ${i + 1}` }))
    .sort((a, b) => a.threshold - b.threshold);
  policy.tierThresholdsJmd = tierRows.map((r) => r.threshold);
  policy.tierMultipliers = tierRows.map((r) => r.multiplier);
  policy.tierNames = tierRows.map((r) => r.name);
  policy.redemptionDenominations = Array.isArray(raw.redemptionDenominations) && raw.redemptionDenominations.length
    ? raw.redemptionDenominations.map((v) => num(v, 0)).filter((v) => v > 0).sort((a, b) => a - b)
    : [...DEFAULT_POLICY.redemptionDenominations];
  policy.vipRewardItems = Array.isArray(raw.vipRewardItems) && raw.vipRewardItems.length
    ? raw.vipRewardItems.map(String) : [...DEFAULT_POLICY.vipRewardItems];
  return policy;
}

function tierFor(lifetimePurchaseJmd, policy) {
  const spend = num(lifetimePurchaseJmd, 0);
  let index = 0;
  for (let i = 0; i < policy.tierThresholdsJmd.length; i++) {
    if (spend >= policy.tierThresholdsJmd[i]) index = i;
  }
  const nextThreshold = policy.tierThresholdsJmd[index + 1];
  return {
    index,
    name: policy.tierNames[index] || `Tier ${index + 1}`,
    multiplier: num(policy.tierMultipliers[index], 1),
    threshold: policy.tierThresholdsJmd[index],
    nextThreshold: nextThreshold !== undefined ? nextThreshold : null,
    nextName: policy.tierNames[index + 1] || null,
    isTopTier: index === policy.tierThresholdsJmd.length - 1
  };
}

// ── Ledger primitives ──────────────────────────────────────────────────────────────────

async function sweepExpiredForCustomer(customerId) {
  const nowIso = new Date().toISOString();
  const { data: dueLots, error } = await db.from('glow_credit_transactions')
    .select('id, customer_id, remaining')
    .eq('customer_id', customerId)
    .like('type', 'earn_%')
    .gt('remaining', 0)
    .not('expires_at', 'is', null)
    .lte('expires_at', nowIso);
  if (error || !dueLots || !dueLots.length) return;
  for (const lot of dueLots) {
    await db.from('glow_credit_transactions').insert({
      customer_id: lot.customer_id, type: 'expire', amount: -Number(lot.remaining),
      reference_id: lot.id, note: 'Automatic expiry sweep'
    });
    await db.from('glow_credit_transactions').update({ remaining: 0 }).eq('id', lot.id);
  }
}

async function refreshCustomerCache(customerId) {
  const { data, error } = await db.from('glow_credit_transactions')
    .select('type, amount, remaining, expires_at')
    .eq('customer_id', customerId);
  if (error) throw error;
  const nowMs = Date.now();
  let balance = 0;
  let lifetime = 0;
  for (const row of data || []) {
    if (!String(row.type).startsWith('earn_')) continue;
    lifetime += num(row.amount, 0);
    if (row.remaining == null) continue;
    if (row.expires_at && new Date(row.expires_at).getTime() <= nowMs) continue;
    balance += num(row.remaining, 0);
  }
  balance = Math.max(0, round2(balance));
  lifetime = Math.max(0, round2(lifetime));
  await db.from('customers').update({ loyalty_points_balance: balance, lifetime_earned_points: lifetime }).eq('id', customerId);
  return balance;
}

async function getBalance(customerId, { sweep = true } = {}) {
  if (sweep) await sweepExpiredForCustomer(customerId);
  const nowMs = Date.now();
  const { data, error } = await db.from('glow_credit_transactions')
    .select('remaining, expires_at, type')
    .eq('customer_id', customerId)
    .like('type', 'earn_%');
  if (error) throw error;
  const balance = (data || []).reduce((sum, row) => {
    if (row.remaining == null) return sum;
    if (row.expires_at && new Date(row.expires_at).getTime() <= nowMs) return sum;
    return sum + num(row.remaining, 0);
  }, 0);
  return Math.max(0, round2(balance));
}

// FIFO-consumes `amount` credits across the customer's oldest available lots first.
// Returns the amount actually consumed (may be less than requested if balance is short —
// callers that must guarantee sufficiency should check getBalance() first).
async function consumeCredits(customerId, amount, type, note, { orderId = null, createdBy = null, referenceId = null } = {}) {
  let toConsume = num(amount, 0);
  if (toConsume <= 0) return 0;
  const nowIso = new Date().toISOString();
  const { data: lots, error } = await db.from('glow_credit_transactions')
    .select('id, remaining')
    .eq('customer_id', customerId)
    .like('type', 'earn_%')
    .gt('remaining', 0)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('created_at', { ascending: true });
  if (error) throw error;

  for (const lot of lots || []) {
    if (toConsume <= 0) break;
    const take = Math.min(num(lot.remaining, 0), toConsume);
    if (take <= 0) continue;
    await db.from('glow_credit_transactions').update({ remaining: round2(num(lot.remaining, 0) - take) }).eq('id', lot.id);
    toConsume -= take;
  }

  const consumed = round2(num(amount, 0) - toConsume);
  if (consumed > 0) {
    await db.from('glow_credit_transactions').insert({
      customer_id: customerId, type, amount: -consumed, order_id: orderId, reference_id: referenceId,
      note, created_by: createdBy
    });
  }
  return consumed;
}

async function listLedger(customerId, { limit = 50, offset = 0 } = {}) {
  await sweepExpiredForCustomer(customerId);
  const { data, error, count } = await db.from('glow_credit_transactions')
    .select('id, type, amount, remaining, order_id, note, expires_at, created_at', { count: 'exact' })
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { transactions: data || [], total: count || 0 };
}

// ── Glow Days ──────────────────────────────────────────────────────────────────────────

async function activeGlowDayFor(order) {
  try {
    const atIso = order.created_at || new Date().toISOString();
    const { data } = await db.from('glow_days')
      .select('*')
      .eq('active', true)
      .lte('starts_at', atIso)
      .gte('ends_at', atIso)
      .order('multiplier', { ascending: false })
      .limit(5);
    if (!data || !data.length) return null;

    for (const gd of data) {
      if (gd.scope === 'min_spend' && num(order.subtotal_jmd, 0) < num(gd.min_spend_jmd, 0)) continue;
      if (gd.scope === 'category' && gd.category) {
        const { data: items } = await db.from('order_items').select('product_id').eq('order_id', order.id);
        const productIds = (items || []).map((i) => i.product_id).filter(Boolean);
        if (!productIds.length) continue;
        const { data: matches } = await db.from('products')
          .select('id, categories!inner(name)')
          .in('id', productIds)
          .ilike('categories.name', gd.category);
        if (!matches || !matches.length) continue;
      }
      return gd;
    }
    return null;
  } catch (err) {
    console.error('[Glow Rewards] Glow Day lookup failed, skipping bonus:', err.message);
    return null;
  }
}

// ── Purchase credits ───────────────────────────────────────────────────────────────────

async function awardPurchaseCredits(order) {
  const policy = await loadPolicy();
  if (!policy.enabled || !order.customer_id) return null;

  const { data: customer, error: custErr } = await db.from('customers')
    .select('id, lifetime_purchase_jmd, referred_by_customer_id')
    .eq('id', order.customer_id).maybeSingle();
  if (custErr || !customer) return null;

  const subtotal = num(order.subtotal_jmd, 0);
  const tier = tierFor(customer.lifetime_purchase_jmd, policy); // standing BEFORE this order
  const hasDiscount = !!order.discount_code;

  let amount = 0;
  let glowDay = null;
  if (!hasDiscount) {
    glowDay = await activeGlowDayFor(order);
    const base = Math.floor(subtotal * policy.creditsPerJmdSpent);
    amount = base * tier.multiplier;
    if (glowDay) {
      amount *= num(glowDay.multiplier, 1);
      if (subtotal >= num(glowDay.min_spend_jmd, 0)) amount += num(glowDay.bonus_flat_credits, 0);
    }
    amount = Math.floor(amount);
  }

  if (amount > 0) {
    await db.from('glow_credit_transactions').insert({
      customer_id: order.customer_id, type: 'earn_purchase', amount, remaining: amount,
      order_id: order.id, expires_at: addMonths(new Date(), policy.expirationMonths).toISOString(),
      note: glowDay ? `Purchase credit (Glow Day: ${glowDay.name})` : 'Purchase credit'
    });
  }
  // Keep the per-order "credits earned" figure shown in order history accurate — it was
  // previously only an estimate computed before payment was confirmed.
  await db.from('orders').update({ points_earned: amount }).eq('id', order.id);

  // Lifetime spend (tier progress) always counts, discounted or not.
  await db.from('customers').update({
    lifetime_purchase_jmd: round2(num(customer.lifetime_purchase_jmd, 0) + subtotal)
  }).eq('id', order.customer_id);

  await completeReferralIfEligible(order, customer, policy);
  await refreshCustomerCache(order.customer_id);
  return { amount };
}

async function reversePurchaseCredits(order) {
  const { data: lots, error } = await db.from('glow_credit_transactions')
    .select('id, remaining, customer_id')
    .eq('order_id', order.id).eq('type', 'earn_purchase').gt('remaining', 0);
  if (!error && lots && lots.length) {
    for (const lot of lots) {
      await db.from('glow_credit_transactions').insert({
        customer_id: lot.customer_id, type: 'reverse_refund', amount: -num(lot.remaining, 0),
        order_id: order.id, reference_id: lot.id, note: 'Order refunded/cancelled — credits reversed'
      });
      await db.from('glow_credit_transactions').update({ remaining: 0 }).eq('id', lot.id);
    }
    await refreshCustomerCache(lots[0].customer_id);
  }

  // If this order was the qualifying first purchase for a completed referral, claw back
  // the referrer's reward too — the purchase it was earned on no longer stands.
  const { data: referral } = await db.from('glow_referrals')
    .select('id, referrer_customer_id, reward_credits, status')
    .eq('completed_order_id', order.id).maybeSingle();
  if (referral && referral.status === 'completed' && num(referral.reward_credits, 0) > 0) {
    await consumeCredits(
      referral.referrer_customer_id, num(referral.reward_credits, 0), 'reverse_refund',
      'Referral reward reversed — referred order was refunded/cancelled',
      { orderId: order.id, referenceId: referral.id }
    );
    await refreshCustomerCache(referral.referrer_customer_id);
  }
  // Note: lifetime_purchase_jmd (tier progress) is intentionally NOT reduced — tier status
  // is lifetime per the confirmed programme policy.
}

async function completeReferralIfEligible(order, customer, policy) {
  if (!customer.referred_by_customer_id) return;
  const { data: existing } = await db.from('glow_referrals')
    .select('id, status').eq('referee_customer_id', customer.id).maybeSingle();
  if (existing && existing.status === 'completed') return;

  const { count } = await db.from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customer.id).eq('payment_status', 'paid').neq('id', order.id);
  if ((count || 0) > 0) return; // not their first paid order

  const rewardCredits = num(policy.referralCredits, 200);
  const nowIso = new Date().toISOString();

  if (existing) {
    await db.from('glow_referrals').update({
      status: 'completed', completed_order_id: order.id, completed_at: nowIso, reward_credits: rewardCredits
    }).eq('id', existing.id);
  } else {
    await db.from('glow_referrals').insert({
      referrer_customer_id: customer.referred_by_customer_id, referee_customer_id: customer.id,
      status: 'completed', completed_order_id: order.id, completed_at: nowIso, reward_credits: rewardCredits
    });
  }

  if (rewardCredits > 0) {
    await db.from('glow_credit_transactions').insert({
      customer_id: customer.referred_by_customer_id, type: 'earn_referral', amount: rewardCredits, remaining: rewardCredits,
      order_id: order.id, reference_id: customer.id, expires_at: addMonths(new Date(), policy.expirationMonths).toISOString(),
      note: 'Referral reward — friend completed first purchase'
    });
    await refreshCustomerCache(customer.referred_by_customer_id);
  }
}

// Shared hook for every place orders.payment_status changes (Fygaro webhook, admin
// reconciliation, and the admin order-status endpoint). Mirrors the transition semantics of
// the old handle_order_points trigger it replaces.
async function handlePaymentStatusChange(orderId, previousStatus, newStatus) {
  if (!orderId || previousStatus === newStatus) return;
  const { data: order, error } = await db.from('orders')
    .select('id, customer_id, subtotal_jmd, discount_code, payment_status, created_at')
    .eq('id', orderId).maybeSingle();
  if (error || !order) return;

  try {
    if (newStatus === 'paid' && previousStatus !== 'paid') {
      await awardPurchaseCredits(order);
    } else if (previousStatus === 'paid' && newStatus !== 'paid') {
      await reversePurchaseCredits(order);
    }
  } catch (err) {
    console.error('[Glow Rewards] handlePaymentStatusChange failed:', err.message);
  }
}

// ── Redemption ─────────────────────────────────────────────────────────────────────────

function generateCode(prefix = 'GLOW') {
  return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function redeemCredits(customerId, creditsAmount) {
  const policy = await loadPolicy();
  const amount = num(creditsAmount, 0);
  if (!policy.redemptionDenominations.includes(amount)) {
    const err = new Error(`Choose one of: ${policy.redemptionDenominations.join(', ')} ${policy.creditLabel}.`);
    err.status = 400; throw err;
  }
  const balance = await getBalance(customerId);
  if (balance < amount) {
    const err = new Error(`You don't have enough ${policy.creditLabel} for this reward yet.`);
    err.status = 400; throw err;
  }

  const cashValue = round2(amount * num(policy.creditToJmdRatio, 1));
  const code = generateCode('GLOW');
  const endsAt = addDays(new Date(), policy.redemptionCodeValidDays || 14).toISOString();

  const { data: discountRow, error } = await db.from('discount_codes').insert({
    code, discount_type: 'fixed', discount_value: cashValue, usage_limit: 1, used_count: 0,
    active: true, ends_at: endsAt, customer_id: customerId, kind: 'glow_redemption'
  }).select('id, code, discount_value, ends_at').single();
  if (error) throw error;

  await consumeCredits(customerId, amount, 'redeem', `Redeemed for code ${code}`, { referenceId: discountRow.id });
  await refreshCustomerCache(customerId);

  return { code: discountRow.code, cashValueJmd: Number(discountRow.discount_value), validUntil: discountRow.ends_at, creditsUsed: amount };
}

async function manualAdjust({ customerId, amount, note, adminUserId }) {
  const policy = await loadPolicy();
  const value = num(amount, 0);
  if (!value) { const err = new Error('Enter a non-zero amount.'); err.status = 400; throw err; }
  if (value > 0) {
    await db.from('glow_credit_transactions').insert({
      customer_id: customerId, type: 'earn_manual', amount: value, remaining: value,
      expires_at: addMonths(new Date(), policy.expirationMonths).toISOString(),
      note: note || 'Manual credit adjustment', created_by: adminUserId
    });
  } else {
    const balance = await getBalance(customerId);
    const toConsume = Math.min(balance, Math.abs(value));
    await consumeCredits(customerId, toConsume, 'reverse_manual', note || 'Manual credit adjustment', { createdBy: adminUserId });
  }
  return refreshCustomerCache(customerId);
}

async function awardSocialShareCredits(customerId, note, adminUserId) {
  const policy = await loadPolicy();
  const amount = num(policy.socialShareCredits, 200);
  if (amount <= 0) return null;
  await db.from('glow_credit_transactions').insert({
    customer_id: customerId, type: 'earn_social', amount, remaining: amount,
    expires_at: addMonths(new Date(), policy.expirationMonths).toISOString(),
    note: note || 'Social share bonus', created_by: adminUserId
  });
  await refreshCustomerCache(customerId);
  return { amount };
}

// ── Reviews / quiz / referral codes ────────────────────────────────────────────────────

async function awardReviewCredits(reviewId) {
  const { data: review, error } = await db.from('product_reviews')
    .select('id, customer_id, credit_awarded').eq('id', reviewId).maybeSingle();
  if (error || !review || review.credit_awarded || !review.customer_id) return null;
  const policy = await loadPolicy();
  const amount = num(policy.reviewCredits, 200);
  if (amount > 0) {
    await db.from('glow_credit_transactions').insert({
      customer_id: review.customer_id, type: 'earn_review', amount, remaining: amount,
      reference_id: review.id, expires_at: addMonths(new Date(), policy.expirationMonths).toISOString(),
      note: 'Review approved'
    });
    await refreshCustomerCache(review.customer_id);
  }
  await db.from('product_reviews').update({ credit_awarded: true }).eq('id', review.id);
  return { amount };
}

// Awards the one-time "join for free, get 100 Glow Credits" bonus. Idempotent: checks the
// ledger for an existing earn_signup row rather than relying on a dedicated flag column, so
// it's safe to call every time a customer becomes an account holder.
async function awardSignupBonusIfEligible(customerId) {
  const { data: existing } = await db.from('glow_credit_transactions').select('id').eq('customer_id', customerId).eq('type', 'earn_signup').limit(1);
  if (existing && existing.length) return null;
  const policy = await loadPolicy();
  const amount = num(policy.signupBonus, 100);
  if (amount <= 0) return null;
  await db.from('glow_credit_transactions').insert({
    customer_id: customerId, type: 'earn_signup', amount, remaining: amount,
    expires_at: addMonths(new Date(), policy.expirationMonths).toISOString(), note: 'Joined the Glow & Go Inner Circle'
  });
  await refreshCustomerCache(customerId);
  return { amount };
}

async function awardQuizCreditsIfEligible(customerId) {
  const { data: customer } = await db.from('customers').select('id, quiz_bonus_awarded_at').eq('id', customerId).maybeSingle();
  if (!customer || customer.quiz_bonus_awarded_at) return null;
  const policy = await loadPolicy();
  const amount = num(policy.quizCredits, 200);
  if (amount > 0) {
    await db.from('glow_credit_transactions').insert({
      customer_id: customerId, type: 'earn_quiz', amount, remaining: amount,
      expires_at: addMonths(new Date(), policy.expirationMonths).toISOString(), note: 'Skin quiz completed'
    });
  }
  await db.from('customers').update({ quiz_bonus_awarded_at: new Date().toISOString() }).eq('id', customerId);
  await refreshCustomerCache(customerId);
  return { amount };
}

function generateReferralCode(name) {
  const base = String(name || 'GLOW').trim().split(/\s+/)[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'GLOW';
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${base}${suffix}`;
}

async function getOrCreateReferralCode(customerId) {
  const { data: customer, error } = await db.from('customers').select('id, referral_code, full_name').eq('id', customerId).maybeSingle();
  if (error || !customer) throw new Error('Customer not found.');
  if (customer.referral_code) return customer.referral_code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateReferralCode(customer.full_name);
    await db.from('customers').update({ referral_code: candidate }).eq('id', customerId).is('referral_code', null);
    const { data: check } = await db.from('customers').select('referral_code').eq('id', customerId).maybeSingle();
    if (check?.referral_code) return check.referral_code;
  }
  throw new Error('Could not generate a referral code. Please try again.');
}

async function findReferralOwner(code) {
  if (!code) return null;
  const { data } = await db.from('customers').select('id, full_name, email').ilike('referral_code', code).maybeSingle();
  return data || null;
}

async function customerHasPaidOrder(customerId) {
  const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', customerId).eq('payment_status', 'paid');
  return (count || 0) > 0;
}

// ── Admin: members & VIP rewards ───────────────────────────────────────────────────────

async function listMembers({ search = '', limit = 25, offset = 0 } = {}) {
  const policy = await loadPolicy();
  let query = db.from('customers')
    .select('id, full_name, email, phone, created_at, date_of_birth, lifetime_purchase_jmd, loyalty_points_balance, lifetime_earned_points, referral_code', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + Math.max(0, limit - 1));
  const term = String(search || '').trim();
  if (term) {
    const escaped = term.replace(/[%,]/g, '');
    query = query.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
  }
  const { data, error, count } = await query;
  if (error) throw error;
  const members = (data || []).map((c) => ({
    ...c,
    balance: num(c.loyalty_points_balance, 0),
    tier: tierFor(c.lifetime_purchase_jmd, policy).name
  }));
  return { members, total: count || 0, policy };
}

async function generateVipRewardsForCurrentPeriod() {
  const policy = await loadPolicy();
  if (!policy.vipRewardEnabled) return { created: 0, period: null };
  const topThreshold = policy.tierThresholdsJmd[policy.tierThresholdsJmd.length - 1];
  const now = new Date();
  const half = now.getMonth() < 6 ? 'H1' : 'H2';
  const period = `${now.getFullYear()}-${half}`;

  const { data: eligible, error } = await db.from('customers').select('id').gte('lifetime_purchase_jmd', topThreshold);
  if (error) throw error;
  let created = 0;
  for (const c of eligible || []) {
    const { error: insertError } = await db.from('glow_vip_product_rewards')
      .insert({ customer_id: c.id, period_label: period, status: 'pending' });
    if (!insertError) created += 1;
  }
  return { created, period, eligibleCount: (eligible || []).length };
}

module.exports = {
  DEFAULT_POLICY,
  loadPolicy,
  tierFor,
  getBalance,
  sweepExpiredForCustomer,
  refreshCustomerCache,
  consumeCredits,
  listLedger,
  handlePaymentStatusChange,
  awardPurchaseCredits,
  reversePurchaseCredits,
  redeemCredits,
  manualAdjust,
  awardSocialShareCredits,
  awardReviewCredits,
  awardSignupBonusIfEligible,
  awardQuizCreditsIfEligible,
  getOrCreateReferralCode,
  findReferralOwner,
  customerHasPaidOrder,
  listMembers,
  generateVipRewardsForCurrentPeriod
};
